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

from api.db.db_models import QuestionRecord, DB, User
from api.db.services.common_service import CommonService
from api.utils import get_uuid
import logging


class QuestionRecordService(CommonService):
    model = QuestionRecord

    @classmethod
    @DB.connection_context()
    def record_question(cls, user_id, question, dialog_id=None, conversation_id=None, 
                       source="dialog", ip_address=None, user_agent=None, session_info=None):
        """
        記錄用戶提問
        
        Args:
            user_id (str): 用戶 ID
            question (str): 問題內容
            dialog_id (str, optional): 對話 ID
            conversation_id (str, optional): 會話 ID  
            source (str): 來源類型 (dialog|agent|api)
            ip_address (str, optional): IP 地址
            user_agent (str, optional): 用戶代理
            session_info (dict, optional): 會話信息
            
        Returns:
            QuestionRecord: 創建的問題記錄
        """
        try:
            record_data = {
                "id": get_uuid(),
                "user_id": user_id or "",
                "question": question,
                "dialog_id": dialog_id,
                "conversation_id": conversation_id,
                "source": source,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "session_info": session_info or {}
            }
            
            return cls.save(**record_data)
        except Exception as e:
            logging.error(f"記錄用戶問題失敗: {str(e)}")
            return None

    @classmethod  
    @DB.connection_context()
    def get_question_list(cls, page_number=1, items_per_page=20, orderby="create_time", 
                         desc=True, user_id=None, source=None, keyword=None, 
                         start_date=None, end_date=None):
        """
        獲取問題記錄列表
        
        Args:
            page_number (int): 頁碼
            items_per_page (int): 每頁數量
            orderby (str): 排序字段
            desc (bool): 是否降序
            user_id (str, optional): 過濾用戶 ID
            source (str, optional): 過濾來源
            keyword (str, optional): 關鍵詞搜索
            start_date (str, optional): 開始日期
            end_date (str, optional): 結束日期
            
        Returns:
            list: 問題記錄列表
        """
        try:
            # 構建查詢
            query = cls.model.select(
                cls.model.id,
                cls.model.user_id,
                cls.model.question,
                cls.model.dialog_id,
                cls.model.conversation_id,
                cls.model.source,
                cls.model.ip_address,
                cls.model.create_time,
                cls.model.create_date,
                User.nickname,
                User.email
            ).join(
                User, on=(cls.model.user_id == User.id), join_type='LEFT'
            )
            
            # 添加過濾條件
            if user_id:
                query = query.where(cls.model.user_id == user_id)
            if source:
                query = query.where(cls.model.source == source)
            if keyword:
                query = query.where(cls.model.question.contains(keyword))
            if start_date:
                query = query.where(cls.model.create_date >= start_date)
            if end_date:
                query = query.where(cls.model.create_date <= end_date)
                
            # 排序
            if desc:
                query = query.order_by(cls.model.getter_by(orderby).desc())
            else:
                query = query.order_by(cls.model.getter_by(orderby).asc())
                
            # 分頁
            query = query.paginate(page_number, items_per_page)
            
            return list(query.dicts())
        except Exception as e:
            logging.error(f"獲取問題記錄列表失敗: {str(e)}")
            return []

    @classmethod
    @DB.connection_context()
    def get_question_stats(cls, start_date=None, end_date=None):
        """
        獲取問題統計信息
        
        Args:
            start_date (str, optional): 開始日期
            end_date (str, optional): 結束日期
            
        Returns:
            dict: 統計信息
        """
        try:
            from peewee import fn
            
            query = cls.model.select()
            if start_date:
                query = query.where(cls.model.create_date >= start_date)
            if end_date:
                query = query.where(cls.model.create_date <= end_date)
                
            # 總問題數
            total_questions = query.count()
            
            # 按來源統計
            source_stats = cls.model.select(
                cls.model.source,
                fn.COUNT(cls.model.id).alias('count')
            ).where(
                cls.model.create_date >= start_date if start_date else True,
                cls.model.create_date <= end_date if end_date else True
            ).group_by(cls.model.source).dicts()
            
            # 按日期統計
            daily_stats = cls.model.select(
                fn.DATE(cls.model.create_date).alias('date'),
                fn.COUNT(cls.model.id).alias('count')
            ).where(
                cls.model.create_date >= start_date if start_date else True,
                cls.model.create_date <= end_date if end_date else True
            ).group_by(fn.DATE(cls.model.create_date)).order_by(
                fn.DATE(cls.model.create_date).desc()
            ).dicts()
            
            return {
                "total_questions": total_questions,
                "source_stats": list(source_stats),
                "daily_stats": list(daily_stats)
            }
        except Exception as e:
            logging.error(f"獲取問題統計失敗: {str(e)}")
            return {
                "total_questions": 0,
                "source_stats": [],
                "daily_stats": []
            }

    @classmethod
    @DB.connection_context() 
    def get_user_question_count(cls, user_id, start_date=None, end_date=None):
        """
        獲取用戶問題數量
        
        Args:
            user_id (str): 用戶 ID
            start_date (str, optional): 開始日期
            end_date (str, optional): 結束日期
            
        Returns:
            int: 問題數量
        """
        try:
            query = cls.model.select().where(cls.model.user_id == user_id)
            if start_date:
                query = query.where(cls.model.create_date >= start_date)
            if end_date:
                query = query.where(cls.model.create_date <= end_date)
                
            return query.count()
        except Exception as e:
            logging.error(f"獲取用戶問題數量失敗: {str(e)}")
            return 0 