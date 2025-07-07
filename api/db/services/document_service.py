#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
import json
import logging
import random
import re
import hashlib
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime
from io import BytesIO

import trio
import xxhash
from peewee import fn

from api import settings
from api.db import FileType, LLMType, ParserType, StatusEnum, TaskStatus, UserTenantRole
from api.db.db_models import DB, Document, Knowledgebase, Task, Tenant, UserTenant
from api.db.db_utils import bulk_insert_into_db
from api.db.services.common_service import CommonService
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.utils import current_timestamp, get_format_time, get_uuid
from rag.nlp import rag_tokenizer, search
from rag.settings import get_svr_queue_name
from rag.utils.redis_conn import REDIS_CONN
from rag.utils.storage_factory import STORAGE_IMPL
from api.db.services.user_service import UserService


class DocumentService(CommonService):
    model = Document

    @classmethod
    @DB.connection_context()
    def get_list(cls, kb_id, page_number, items_per_page,
                 orderby, desc, keywords, id, name):
        docs = cls.model.select().where(cls.model.kb_id == kb_id)
        if id:
            docs = docs.where(
                cls.model.id == id)
        if name:
            docs = docs.where(
                cls.model.name == name
            )
        if keywords:
            docs = docs.where(
                fn.LOWER(cls.model.name).contains(keywords.lower())
            )
        if desc:
            docs = docs.order_by(cls.model.getter_by(orderby).desc())
        else:
            docs = docs.order_by(cls.model.getter_by(orderby).asc())

        count = docs.count()
        docs = docs.paginate(page_number, items_per_page)
        return list(docs.dicts()), count

    @classmethod
    @DB.connection_context()
    def get_by_kb_id(cls, kb_id, page_number, items_per_page,
                     orderby, desc, keywords, user_id=None):
        # 如果没有提供user_id，尝试从Flask current_user获取
        if user_id is None:
            try:
                from flask_login import current_user
                user_id = current_user.id
            except (ImportError, AttributeError):
                # 如果没有Flask环境或current_user不存在，返回空结果
                return [], 0
        
        success, user = UserService.get_by_id(user_id)
        
        conditions = [cls.model.kb_id == kb_id]

        if not (success and user and user.is_superuser):
            # For non-admin users, show:
            # 1. Public documents from any user
            # 2. Private documents created by themselves
            conditions.append(
                (cls.model.visibility == 'public') | 
                (cls.model.created_by == user_id)
            )

        if keywords:
            conditions.append(fn.LOWER(cls.model.name).contains(keywords.lower()))

        docs = cls.model.select().where(*conditions)
        
        # 如果是普通用户，需要额外检查授权文档
        if not (success and user and user.is_superuser):
            all_docs = list(docs.dicts())
            
            # 获取所有可能的授权文档
            authorized_docs_query = cls.model.select().where(
                cls.model.kb_id == kb_id,
                cls.model.visibility == 'private',
                cls.model.created_by != user_id
            )
            
            if keywords:
                authorized_docs_query = authorized_docs_query.where(
                    fn.LOWER(cls.model.name).contains(keywords.lower())
                )
            
            authorized_docs = list(authorized_docs_query.dicts())
            
            # 过滤出用户有权限的文档
            for doc in authorized_docs:
                if cls._is_document_visible_to_user(doc, user_id, False):
                    all_docs.append(doc)
            
            # 排序
            if desc:
                all_docs.sort(key=lambda x: x.get(orderby, 0), reverse=True)
            else:
                all_docs.sort(key=lambda x: x.get(orderby, 0))
            
            # 分页
            total_count = len(all_docs)
            start_idx = (page_number - 1) * items_per_page
            end_idx = start_idx + items_per_page
            paginated_docs = all_docs[start_idx:end_idx]
            
            return paginated_docs, total_count
        
        else:
            # 超级用户的原有逻辑
            count = docs.count()

            if desc:
                docs = docs.order_by(cls.model.getter_by(orderby).desc())
            else:
                docs = docs.order_by(cls.model.getter_by(orderby).asc())

            docs = docs.paginate(page_number, items_per_page)
            return list(docs.dicts()), count

    @classmethod
    @DB.connection_context()
    def get_all_public_docs(cls, page_number, items_per_page,
                           orderby, desc, keywords):
        # 獲取所有公開文件
        if keywords:
            docs = cls.model.select().where(
                (cls.model.visibility == 'public'),
                (fn.LOWER(cls.model.name).contains(keywords.lower()))
            )
        else:
            docs = cls.model.select().where(
                (cls.model.visibility == 'public')
            )

        count = docs.count()

        if desc:
            docs = docs.order_by(cls.model.getter_by(orderby).desc())
        else:
            docs = docs.order_by(cls.model.getter_by(orderby).asc())

        docs = docs.paginate(page_number, items_per_page)
        return list(docs.dicts()), count

    @classmethod
    @DB.connection_context()
    def insert(cls, doc):
        try:
            # 使用 create 而不是 save，避免覆蓋 visibility
            result = cls.model.create(**doc)
            if not KnowledgebaseService.atomic_increase_doc_num_by_id(doc["kb_id"]):
                raise RuntimeError("Database error (Knowledgebase)!")
            return result
        except Exception as e:
            raise RuntimeError("Failed to save document!")

    @classmethod
    @DB.connection_context()
    def remove_document(cls, doc, tenant_id):
        cls.clear_chunk_num(doc.id)
        try:
            settings.docStoreConn.delete({"doc_id": doc.id}, search.index_name(tenant_id), doc.kb_id)
            settings.docStoreConn.update({"kb_id": doc.kb_id, "knowledge_graph_kwd": ["entity", "relation", "graph", "subgraph", "community_report"], "source_id": doc.id},
                                         {"remove": {"source_id": doc.id}},
                                         search.index_name(tenant_id), doc.kb_id)
            settings.docStoreConn.update({"kb_id": doc.kb_id, "knowledge_graph_kwd": ["graph"]},
                                         {"removed_kwd": "Y"},
                                         search.index_name(tenant_id), doc.kb_id)
            settings.docStoreConn.delete({"kb_id": doc.kb_id, "knowledge_graph_kwd": ["entity", "relation", "graph", "subgraph", "community_report"], "must_not": {"exists": "source_id"}},
                                         search.index_name(tenant_id), doc.kb_id)
        except Exception:
            pass
        return cls.delete_by_id(doc.id)

    @classmethod
    @DB.connection_context()
    def get_newly_uploaded(cls):
        fields = [
            cls.model.id,
            cls.model.kb_id,
            cls.model.parser_id,
            cls.model.parser_config,
            cls.model.name,
            cls.model.type,
            cls.model.location,
            cls.model.size,
            Knowledgebase.tenant_id,
            Tenant.embd_id,
            Tenant.img2txt_id,
            Tenant.asr_id,
            cls.model.update_time]
        docs = cls.model.select(*fields) \
            .join(Knowledgebase, on=(cls.model.kb_id == Knowledgebase.id)) \
            .join(Tenant, on=(Knowledgebase.tenant_id == Tenant.id)) \
            .where(
            cls.model.status == StatusEnum.VALID.value,
            ~(cls.model.type == FileType.VIRTUAL.value),
            cls.model.progress == 0,
            cls.model.update_time >= current_timestamp() - 1000 * 600,
            cls.model.run == TaskStatus.RUNNING.value) \
            .order_by(cls.model.update_time.asc())
        return list(docs.dicts())

    @classmethod
    @DB.connection_context()
    def get_unfinished_docs(cls):
        fields = [cls.model.id, cls.model.process_begin_at, cls.model.parser_config, cls.model.progress_msg,
                  cls.model.run, cls.model.parser_id]
        docs = cls.model.select(*fields) \
            .where(
            cls.model.status == StatusEnum.VALID.value,
            ~(cls.model.type == FileType.VIRTUAL.value),
            cls.model.progress < 1,
            cls.model.progress > 0)
        return list(docs.dicts())

    @classmethod
    @DB.connection_context()
    def increment_chunk_num(cls, doc_id, kb_id, token_num, chunk_num, duation):
        num = cls.model.update(token_num=cls.model.token_num + token_num,
                               chunk_num=cls.model.chunk_num + chunk_num,
                               process_duation=cls.model.process_duation + duation).where(
            cls.model.id == doc_id).execute()
        if num == 0:
            raise LookupError(
                "Document not found which is supposed to be there")
        num = Knowledgebase.update(
            token_num=Knowledgebase.token_num +
            token_num,
            chunk_num=Knowledgebase.chunk_num +
            chunk_num).where(
            Knowledgebase.id == kb_id).execute()
        return num

    @classmethod
    @DB.connection_context()
    def decrement_chunk_num(cls, doc_id, kb_id, token_num, chunk_num, duation):
        num = cls.model.update(token_num=cls.model.token_num - token_num,
                               chunk_num=cls.model.chunk_num - chunk_num,
                               process_duation=cls.model.process_duation + duation).where(
            cls.model.id == doc_id).execute()
        if num == 0:
            raise LookupError(
                "Document not found which is supposed to be there")
        num = Knowledgebase.update(
            token_num=Knowledgebase.token_num -
            token_num,
            chunk_num=Knowledgebase.chunk_num -
            chunk_num
        ).where(
            Knowledgebase.id == kb_id).execute()
        return num

    @classmethod
    @DB.connection_context()
    def clear_chunk_num(cls, doc_id):
        doc = cls.model.get_by_id(doc_id)
        assert doc, "Can't fine document in database."

        num = Knowledgebase.update(
            token_num=Knowledgebase.token_num -
            doc.token_num,
            chunk_num=Knowledgebase.chunk_num -
            doc.chunk_num,
            doc_num=Knowledgebase.doc_num - 1
        ).where(
            Knowledgebase.id == doc.kb_id).execute()
        return num

    @classmethod
    @DB.connection_context()
    def get_tenant_id(cls, doc_id):
        docs = cls.model.select(
            Knowledgebase.tenant_id).join(
            Knowledgebase, on=(
                Knowledgebase.id == cls.model.kb_id)).where(
            cls.model.id == doc_id, Knowledgebase.status == StatusEnum.VALID.value)
        docs = docs.dicts()
        if not docs:
            return
        return docs[0]["tenant_id"]

    @classmethod
    @DB.connection_context()
    def get_knowledgebase_id(cls, doc_id):
        docs = cls.model.select(cls.model.kb_id).where(cls.model.id == doc_id)
        docs = docs.dicts()
        if not docs:
            return
        return docs[0]["kb_id"]

    @classmethod
    @DB.connection_context()
    def get_tenant_id_by_name(cls, name):
        docs = cls.model.select(
            Knowledgebase.tenant_id).join(
            Knowledgebase, on=(
                Knowledgebase.id == cls.model.kb_id)).where(
            cls.model.name == name, Knowledgebase.status == StatusEnum.VALID.value)
        docs = docs.dicts()
        if not docs:
            return
        return docs[0]["tenant_id"]

    @classmethod
    @DB.connection_context()
    def accessible(cls, doc_id, user_id):
        docs = cls.model.select(
            cls.model.id).join(
            Knowledgebase, on=(
                Knowledgebase.id == cls.model.kb_id)
        ).join(UserTenant, on=(UserTenant.tenant_id == Knowledgebase.tenant_id)
               ).where(cls.model.id == doc_id, UserTenant.user_id == user_id).paginate(0, 1)
        docs = docs.dicts()
        if not docs:
            return False
        return True

    @classmethod
    @DB.connection_context()
    def accessible4deletion(cls, doc_id, user_id):
        docs = cls.model.select(cls.model.id
        ).join(
            Knowledgebase, on=(
                Knowledgebase.id == cls.model.kb_id)
        ).join(
            UserTenant, on=(
                (UserTenant.tenant_id == Knowledgebase.created_by) & (UserTenant.user_id == user_id))
        ).where(
            cls.model.id == doc_id,
            UserTenant.status == StatusEnum.VALID.value,
            ((UserTenant.role == UserTenantRole.NORMAL) | (UserTenant.role == UserTenantRole.OWNER))
        ).paginate(0, 1)
        docs = docs.dicts()
        if not docs:
            return False
        return True

    @classmethod
    @DB.connection_context()
    def get_embd_id(cls, doc_id):
        docs = cls.model.select(
            Knowledgebase.embd_id).join(
            Knowledgebase, on=(
                Knowledgebase.id == cls.model.kb_id)).where(
            cls.model.id == doc_id, Knowledgebase.status == StatusEnum.VALID.value)
        docs = docs.dicts()
        if not docs:
            return
        return docs[0]["embd_id"]

    @classmethod
    @DB.connection_context()
    def get_chunking_config(cls, doc_id):
        configs = (
            cls.model.select(
                cls.model.id,
                cls.model.kb_id,
                cls.model.parser_id,
                cls.model.parser_config,
                Knowledgebase.language,
                Knowledgebase.embd_id,
                Tenant.id.alias("tenant_id"),
                Tenant.img2txt_id,
                Tenant.asr_id,
                Tenant.llm_id,
            )
            .join(Knowledgebase, on=(cls.model.kb_id == Knowledgebase.id))
            .join(Tenant, on=(Knowledgebase.tenant_id == Tenant.id))
            .where(cls.model.id == doc_id)
        )
        configs = configs.dicts()
        if not configs:
            return None
        return configs[0]

    @classmethod
    @DB.connection_context()
    def get_doc_id_by_doc_name(cls, doc_name):
        fields = [cls.model.id]
        doc_id = cls.model.select(*fields) \
            .where(cls.model.name == doc_name)
        doc_id = doc_id.dicts()
        if not doc_id:
            return
        return doc_id[0]["id"]

    @classmethod
    @DB.connection_context()
    def get_thumbnails(cls, docids):
        fields = [cls.model.id, cls.model.kb_id, cls.model.thumbnail]
        return list(cls.model.select(
            *fields).where(cls.model.id.in_(docids)).dicts())

    @classmethod
    @DB.connection_context()
    def update_parser_config(cls, id, config):
        if not config:
            return
        e, d = cls.get_by_id(id)
        if not e:
            raise LookupError(f"Document({id}) not found.")

        def dfs_update(old, new):
            for k, v in new.items():
                if k not in old:
                    old[k] = v
                    continue
                if isinstance(v, dict):
                    assert isinstance(old[k], dict)
                    dfs_update(old[k], v)
                else:
                    old[k] = v

        dfs_update(d.parser_config, config)
        if not config.get("raptor") and d.parser_config.get("raptor"):
            del d.parser_config["raptor"]
        cls.update_by_id(id, {"parser_config": d.parser_config})

    @classmethod
    @DB.connection_context()
    def get_doc_count(cls, tenant_id):
        docs = cls.model.select(cls.model.id).join(Knowledgebase,
                                                   on=(Knowledgebase.id == cls.model.kb_id)).where(
            Knowledgebase.tenant_id == tenant_id)
        return len(docs)

    @classmethod
    @DB.connection_context()
    def begin2parse(cls, docid):
        cls.update_by_id(
            docid, {"progress": random.random() * 1 / 100.,
                    "progress_msg": "Task is queued...",
                    "process_begin_at": get_format_time()
                    })

    @classmethod
    @DB.connection_context()
    def update_meta_fields(cls, doc_id, meta_fields):
        return cls.update_by_id(doc_id, {"meta_fields": meta_fields})

    @classmethod
    @DB.connection_context()
    def update_progress(cls):
        docs = cls.get_unfinished_docs()
        for d in docs:
            try:
                tsks = Task.query(doc_id=d["id"], order_by=Task.create_time)
                if not tsks:
                    continue
                msg = []
                prg = 0
                finished = True
                bad = 0
                has_raptor = False
                has_graphrag = False
                e, doc = DocumentService.get_by_id(d["id"])
                status = doc.run  # TaskStatus.RUNNING.value
                priority = 0
                for t in tsks:
                    if 0 <= t.progress < 1:
                        finished = False
                    if t.progress == -1:
                        bad += 1
                    prg += t.progress if t.progress >= 0 else 0
                    msg.append(t.progress_msg)
                    if t.task_type == "raptor":
                        has_raptor = True
                    elif t.task_type == "graphrag":
                        has_graphrag = True
                    priority = max(priority, t.priority)
                prg /= len(tsks)
                if finished and bad:
                    prg = -1
                    status = TaskStatus.FAIL.value
                elif finished:
                    if d["parser_config"].get("raptor", {}).get("use_raptor") and not has_raptor:
                        queue_raptor_o_graphrag_tasks(d, "raptor", priority)
                        prg = 0.98 * len(tsks) / (len(tsks) + 1)
                    elif d["parser_config"].get("graphrag", {}).get("use_graphrag") and not has_graphrag:
                        queue_raptor_o_graphrag_tasks(d, "graphrag", priority)
                        prg = 0.98 * len(tsks) / (len(tsks) + 1)
                    else:
                        status = TaskStatus.DONE.value

                msg = "\n".join(sorted(msg))
                info = {
                    "process_duation": datetime.timestamp(
                        datetime.now()) -
                    d["process_begin_at"].timestamp(),
                    "run": status}
                if prg != 0:
                    info["progress"] = prg
                if msg:
                    info["progress_msg"] = msg
                cls.update_by_id(d["id"], info)
            except Exception as e:
                if str(e).find("'0'") < 0:
                    logging.exception("fetch task exception")

    @classmethod
    @DB.connection_context()
    def get_kb_doc_count(cls, kb_id):
        return len(cls.model.select(cls.model.id).where(
            cls.model.kb_id == kb_id).dicts())

    @classmethod
    @DB.connection_context()
    def do_cancel(cls, doc_id):
        try:
            _, doc = DocumentService.get_by_id(doc_id)
            return doc.run == TaskStatus.CANCEL.value or doc.progress < 0
        except Exception:
            pass
        return False

    @staticmethod
    def calculate_file_md5(file_content):
        """计算文件内容的MD5值"""
        md5_hash = hashlib.md5()
        if isinstance(file_content, bytes):
            md5_hash.update(file_content)
        else:
            md5_hash.update(file_content.encode('utf-8'))
        return md5_hash.hexdigest()

    @classmethod
    @DB.connection_context()
    def find_duplicates_by_md5(cls, md5_hash, user_id, kb_id=None):
        """
        根据MD5查找重复文件
        返回: (所有重复文件列表, 用户可见的重复文件列表, 用户不可见但存在的重复文件列表)
        """
        # 查找所有具有相同MD5的文件
        all_duplicates = list(cls.model.select().where(
            cls.model.md5_hash == md5_hash,
            cls.model.status == StatusEnum.VALID.value
        ).dicts())
        
        if not all_duplicates:
            return [], [], []
        
        # 获取用户信息
        success, user = UserService.get_by_id(user_id)
        is_superuser = success and user and user.is_superuser
        
        user_visible_duplicates = []
        user_invisible_duplicates = []
        
        for doc in all_duplicates:
            # 如果指定了知识库，跳过当前知识库的文件
            if kb_id and doc['kb_id'] == kb_id:
                continue
                
            # 判断用户是否可以看到这个文件
            if cls._is_document_visible_to_user(doc, user_id, is_superuser):
                user_visible_duplicates.append(doc)
            else:
                user_invisible_duplicates.append(doc)
        
        return all_duplicates, user_visible_duplicates, user_invisible_duplicates

    @classmethod
    @DB.connection_context()
    def _is_document_visible_to_user(cls, document_dict, user_id, is_superuser):
        """判断文档是否对用户可见"""
        # 超级用户可以看到所有文档
        if is_superuser:
            return True
        
        # 文档是公开的，或者是用户自己创建的
        if document_dict['visibility'] == 'public' or document_dict['created_by'] == user_id:
            return True
        
        # 检查用户是否在授权列表中
        meta_fields = document_dict.get('meta_fields', {})
        if meta_fields and isinstance(meta_fields, dict):
            authorized_users = meta_fields.get('authorized_users', [])
            if user_id in authorized_users:
                return True
        
        return False

    @classmethod
    @DB.connection_context() 
    def grant_document_access(cls, doc_id, user_id):
        """为用户授权访问指定文档（通过修改可见性或添加权限记录）"""
        try:
            # 这里我们采用简单的方法：为用户创建一个可见性记录
            # 在实际实现中，你可能需要更复杂的权限管理系统
            
            # 方法1: 将文档可见性设为public（简单但不够精细）
            # cls.update_by_id(doc_id, {"visibility": "public"})
            
            # 方法2: 创建用户-文档权限关系表（需要额外的表结构）
            # 由于当前系统结构限制，我们使用方法1的变种：
            # 在meta_fields中记录有权限访问的用户
            
            success, doc = cls.get_by_id(doc_id)
            if not success:
                return False
                
            meta_fields = doc.meta_fields or {}
            authorized_users = meta_fields.get('authorized_users', [])
            
            if user_id not in authorized_users:
                authorized_users.append(user_id)
                meta_fields['authorized_users'] = authorized_users
                cls.update_by_id(doc_id, {"meta_fields": meta_fields})
            
            return True
        except Exception as e:
            logging.error(f"Failed to grant document access: {e}")
            return False

    @classmethod
    @DB.connection_context()
    def check_file_duplication(cls, file_content, user_id, kb_id):
        """
        检查文件重复并返回相应的处理结果
        
        Returns:
            dict: {
                'is_duplicate': bool,
                'action': str,  # 'allow', 'deny', 'grant_access'
                'message': str,
                'existing_doc': dict or None,
                'md5_hash': str
            }
        """
        md5_hash = cls.calculate_file_md5(file_content)
        
        all_duplicates, user_visible_duplicates, user_invisible_duplicates = cls.find_duplicates_by_md5(
            md5_hash, user_id, kb_id
        )
        
        # 获取用户信息判断是否为超级用户
        success, user = UserService.get_by_id(user_id)
        is_superuser = success and user and user.is_superuser
        
        result = {
            'is_duplicate': len(all_duplicates) > 0,
            'md5_hash': md5_hash,
            'existing_doc': None,
            'action': 'allow',
            'message': ''
        }
        
        if not all_duplicates:
            # 没有重复文件，允许上传
            result['message'] = '文件无重复，可以上传'
            return result
        
        if is_superuser:
            # 超级用户上传，如果有重复就提醒
            if all_duplicates:
                result['action'] = 'deny'
                result['existing_doc'] = all_duplicates[0]
                result['message'] = f'文件已存在于系统中。重复文件：{all_duplicates[0]["name"]}'
        else:
            # 普通用户上传
            if user_visible_duplicates:
                # 情况2：与用户可见的文件重复
                result['action'] = 'deny'
                result['existing_doc'] = user_visible_duplicates[0]
                result['message'] = f'文件与您可访问的文件重复。重复文件：{user_visible_duplicates[0]["name"]}'
            elif user_invisible_duplicates:
                # 情况3：与用户不可见的文件重复，授权访问已存在的文件
                result['action'] = 'grant_access'
                result['existing_doc'] = user_invisible_duplicates[0]
                result['message'] = f'文件已存在于系统中，已为您授权访问。文件：{user_invisible_duplicates[0]["name"]}'
            else:
                # 情况1：没有重复（不应该到这里，但作为保险）
                result['message'] = '文件无重复，可以上传'
        
        return result


def queue_raptor_o_graphrag_tasks(doc, ty, priority):
    chunking_config = DocumentService.get_chunking_config(doc["id"])
    hasher = xxhash.xxh64()
    for field in sorted(chunking_config.keys()):
        hasher.update(str(chunking_config[field]).encode("utf-8"))

    def new_task():
        nonlocal doc
        return {
            "id": get_uuid(),
            "doc_id": doc["id"],
            "from_page": 100000000,
            "to_page": 100000000,
            "task_type": ty,
            "progress_msg":  datetime.now().strftime("%H:%M:%S") + " created task " + ty
        }

    task = new_task()
    for field in ["doc_id", "from_page", "to_page"]:
        hasher.update(str(task.get(field, "")).encode("utf-8"))
    hasher.update(ty.encode("utf-8"))
    task["digest"] = hasher.hexdigest()
    bulk_insert_into_db(Task, [task], True)
    assert REDIS_CONN.queue_product(get_svr_queue_name(priority), message=task), "Can't access Redis. Please check the Redis' status."


def doc_upload_and_parse(conversation_id, file_objs, user_id):
    from api.db.services.api_service import API4ConversationService
    from api.db.services.conversation_service import ConversationService
    from api.db.services.dialog_service import DialogService
    from api.db.services.file_service import FileService
    from api.db.services.llm_service import LLMBundle
    from api.db.services.user_service import TenantService
    from rag.app import audio, email, naive, picture, presentation

    e, conv = ConversationService.get_by_id(conversation_id)
    if not e:
        e, conv = API4ConversationService.get_by_id(conversation_id)
    assert e, "Conversation not found!"

    e, dia = DialogService.get_by_id(conv.dialog_id)
    if not dia.kb_ids:
        raise LookupError("No knowledge base associated with this conversation. "
                          "Please add a knowledge base before uploading documents")
    kb_id = dia.kb_ids[0]
    e, kb = KnowledgebaseService.get_by_id(kb_id)
    if not e:
        raise LookupError("Can't find this knowledgebase!")

    embd_mdl = LLMBundle(kb.tenant_id, LLMType.EMBEDDING, llm_name=kb.embd_id, lang=kb.language)

    err, files = FileService.upload_document(kb, file_objs, user_id)
    assert not err, "\n".join(err)

    def dummy(prog=None, msg=""):
        pass

    FACTORY = {
        ParserType.PRESENTATION.value: presentation,
        ParserType.PICTURE.value: picture,
        ParserType.AUDIO.value: audio,
        ParserType.EMAIL.value: email
    }
    parser_config = {"chunk_token_num": 4096, "delimiter": "\n!?;。；！？", "layout_recognize": "Plain Text"}
    exe = ThreadPoolExecutor(max_workers=12)
    threads = []
    doc_nm = {}
    for d, blob in files:
        doc_nm[d["id"]] = d["name"]
    for d, blob in files:
        kwargs = {
            "callback": dummy,
            "parser_config": parser_config,
            "from_page": 0,
            "to_page": 100000,
            "tenant_id": kb.tenant_id,
            "lang": kb.language
        }
        threads.append(exe.submit(FACTORY.get(d["parser_id"], naive).chunk, d["name"], blob, **kwargs))

    for (docinfo, _), th in zip(files, threads):
        docs = []
        doc = {
            "doc_id": docinfo["id"],
            "kb_id": [kb.id]
        }
        for ck in th.result():
            d = deepcopy(doc)
            d.update(ck)
            d["id"] = xxhash.xxh64((ck["content_with_weight"] + str(d["doc_id"])).encode("utf-8")).hexdigest()
            d["create_time"] = str(datetime.now()).replace("T", " ")[:19]
            d["create_timestamp_flt"] = datetime.now().timestamp()
            if not d.get("image"):
                docs.append(d)
                continue

            output_buffer = BytesIO()
            if isinstance(d["image"], bytes):
                output_buffer = BytesIO(d["image"])
            else:
                d["image"].save(output_buffer, format='JPEG')

            STORAGE_IMPL.put(kb.id, d["id"], output_buffer.getvalue())
            d["img_id"] = "{}-{}".format(kb.id, d["id"])
            d.pop("image", None)
            docs.append(d)

    parser_ids = {d["id"]: d["parser_id"] for d, _ in files}
    docids = [d["id"] for d, _ in files]
    chunk_counts = {id: 0 for id in docids}
    token_counts = {id: 0 for id in docids}
    es_bulk_size = 64

    def embedding(doc_id, cnts, batch_size=16):
        nonlocal embd_mdl, chunk_counts, token_counts
        vects = []
        for i in range(0, len(cnts), batch_size):
            vts, c = embd_mdl.encode(cnts[i: i + batch_size])
            vects.extend(vts.tolist())
            chunk_counts[doc_id] += len(cnts[i:i + batch_size])
            token_counts[doc_id] += c
        return vects

    idxnm = search.index_name(kb.tenant_id)
    try_create_idx = True

    _, tenant = TenantService.get_by_id(kb.tenant_id)
    llm_bdl = LLMBundle(kb.tenant_id, LLMType.CHAT, tenant.llm_id)
    for doc_id in docids:
        cks = [c for c in docs if c["doc_id"] == doc_id]

        if parser_ids[doc_id] != ParserType.PICTURE.value:
            from graphrag.general.mind_map_extractor import MindMapExtractor
            mindmap = MindMapExtractor(llm_bdl)
            try:
                mind_map = trio.run(mindmap, [c["content_with_weight"] for c in docs if c["doc_id"] == doc_id])
                mind_map = json.dumps(mind_map.output, ensure_ascii=False, indent=2)
                if len(mind_map) < 32:
                    raise Exception("Few content: " + mind_map)
                cks.append({
                    "id": get_uuid(),
                    "doc_id": doc_id,
                    "kb_id": [kb.id],
                    "docnm_kwd": doc_nm[doc_id],
                    "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", doc_nm[doc_id])),
                    "content_ltks": rag_tokenizer.tokenize("summary summarize 总结 概况 file 文件 概括"),
                    "content_with_weight": mind_map,
                    "knowledge_graph_kwd": "mind_map"
                })
            except Exception as e:
                logging.exception("Mind map generation error")

        vects = embedding(doc_id, [c["content_with_weight"] for c in cks])
        assert len(cks) == len(vects)
        for i, d in enumerate(cks):
            v = vects[i]
            d["q_%d_vec" % len(v)] = v
        for b in range(0, len(cks), es_bulk_size):
            if try_create_idx:
                if not settings.docStoreConn.indexExist(idxnm, kb_id):
                    settings.docStoreConn.createIdx(idxnm, kb_id, len(vects[0]))
                try_create_idx = False
            settings.docStoreConn.insert(cks[b:b + es_bulk_size], idxnm, kb_id)

        DocumentService.increment_chunk_num(
            doc_id, kb.id, token_counts[doc_id], chunk_counts[doc_id], 0)

    return [d["id"] for d, _ in files]
