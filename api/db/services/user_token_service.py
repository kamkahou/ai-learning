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
import logging
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional

from api.db.db_models import DB, UserTokenUsage, User
from api.db.services.common_service import CommonService
from api.db.services.user_service import UserService
from api import settings


class UserTokenService(CommonService):
    model = UserTokenUsage
    
    @classmethod
    @DB.connection_context()
    def check_token_limit(cls, user_id: str, llm_type: str, llm_name: str, tokens_to_use: int) -> tuple[bool, str]:
        """
        檢查用戶是否可以使用指定數量的 token
        
        Args:
            user_id: 用戶 ID
            llm_type: LLM 類型 (CHAT, EMBEDDING, etc.)
            llm_name: LLM 模型名稱
            tokens_to_use: 即將使用的 token 數量
            
        Returns:
            tuple[bool, str]: (是否允許使用, 錯誤消息)
        """
        if not settings.TOKEN_LIMIT_ENABLED:
            return True, ""
            
        # 檢查用戶是否為管理員
        success, user = UserService.get_by_id(user_id)
        if success and user and user.is_superuser:
            return True, ""
            
        # 獲取或創建用戶 token 使用記錄
        usage_record = cls._get_or_create_usage_record(user_id, llm_type, llm_name)
        
        # 檢查是否需要重置使用量
        if cls._should_reset_usage(usage_record):
            cls._reset_usage(usage_record)
            
        # 檢查 token 限制
        if usage_record.token_limit > 0:  # 0 表示無限制
            if usage_record.used_tokens + tokens_to_use > usage_record.token_limit:
                return False, f"Token 使用量已達到限制。已使用: {usage_record.used_tokens}, 限制: {usage_record.token_limit}, 嘗試使用: {tokens_to_use}"
                
        return True, ""
    
    @classmethod
    @DB.connection_context()
    def increase_token_usage(cls, user_id: str, llm_type: str, llm_name: str, tokens_used: int) -> bool:
        """
        增加用戶的 token 使用量
        
        Args:
            user_id: 用戶 ID
            llm_type: LLM 類型
            llm_name: LLM 模型名稱
            tokens_used: 使用的 token 數量
            
        Returns:
            bool: 是否成功更新
        """
        try:
            # 獲取或創建用戶 token 使用記錄
            usage_record = cls._get_or_create_usage_record(user_id, llm_type, llm_name)
            
            # 檢查是否需要重置使用量
            if cls._should_reset_usage(usage_record):
                cls._reset_usage(usage_record)
                
            # 更新使用量
            num = (
                cls.model.update(used_tokens=cls.model.used_tokens + tokens_used)
                .where(
                    cls.model.user_id == user_id,
                    cls.model.llm_type == llm_type,
                    cls.model.llm_name == llm_name
                )
                .execute()
            )
            
            return num > 0
            
        except Exception as e:
            logging.error(f"Failed to increase token usage for user {user_id}: {e}")
            return False
    
    @classmethod
    @DB.connection_context()
    def get_user_token_usage(cls, user_id: str) -> List[Dict]:
        """
        獲取用戶的 token 使用情況
        
        Args:
            user_id: 用戶 ID
            
        Returns:
            List[Dict]: 用戶的 token 使用記錄列表
        """
        try:
            records = cls.model.select().where(cls.model.user_id == user_id).dicts()
            return list(records)
        except Exception as e:
            logging.error(f"Failed to get token usage for user {user_id}: {e}")
            return []
    
    @classmethod
    @DB.connection_context()
    def set_user_token_limit(cls, user_id: str, llm_type: str, llm_name: str, token_limit: int) -> bool:
        """
        設置用戶的 token 限制
        
        Args:
            user_id: 用戶 ID
            llm_type: LLM 類型
            llm_name: LLM 模型名稱
            token_limit: token 限制數量，0 表示無限制
            
        Returns:
            bool: 是否成功設置
        """
        try:
            usage_record = cls._get_or_create_usage_record(user_id, llm_type, llm_name)
            
            num = (
                cls.model.update(token_limit=token_limit)
                .where(
                    cls.model.user_id == user_id,
                    cls.model.llm_type == llm_type,
                    cls.model.llm_name == llm_name
                )
                .execute()
            )
            
            return num > 0
            
        except Exception as e:
            logging.error(f"Failed to set token limit for user {user_id}: {e}")
            return False
    
    @classmethod
    @DB.connection_context()
    def reset_user_token_usage(cls, user_id: str, llm_type: str = None, llm_name: str = None) -> bool:
        """
        重置用戶的 token 使用量
        
        Args:
            user_id: 用戶 ID
            llm_type: LLM 類型 (可選，為空則重置所有類型)
            llm_name: LLM 模型名稱 (可選，為空則重置所有模型)
            
        Returns:
            bool: 是否成功重置
        """
        try:
            query = cls.model.update(
                used_tokens=0,
                reset_date=cls._get_next_reset_date()
            ).where(cls.model.user_id == user_id)
            
            if llm_type:
                query = query.where(cls.model.llm_type == llm_type)
            if llm_name:
                query = query.where(cls.model.llm_name == llm_name)
                
            num = query.execute()
            return num > 0
            
        except Exception as e:
            logging.error(f"Failed to reset token usage for user {user_id}: {e}")
            return False
    
    @classmethod
    @DB.connection_context()
    def get_all_users_token_usage(cls, limit: int = 100, offset: int = 0) -> List[Dict]:
        """
        獲取所有用戶的 token 使用統計 (管理員功能)
        
        Args:
            limit: 限制返回數量
            offset: 偏移量
            
        Returns:
            List[Dict]: 用戶 token 使用統計列表
        """
        try:
            # 獲取用戶 token 使用統計，並加入用戶信息
            query = """
                SELECT 
                    utu.user_id,
                    u.nickname,
                    u.email,
                    u.is_superuser,
                    utu.llm_type,
                    utu.llm_name,
                    utu.used_tokens,
                    utu.token_limit,
                    utu.reset_date,
                    utu.is_active,
                    utu.create_date,
                    utu.update_date
                FROM user_token_usage utu
                LEFT JOIN user u ON utu.user_id = u.id
                ORDER BY utu.update_date DESC
                LIMIT %s OFFSET %s
            """
            
            cursor = DB.execute_sql(query, (limit, offset))
            columns = [desc[0] for desc in cursor.description]
            results = []
            
            for row in cursor.fetchall():
                results.append(dict(zip(columns, row)))
                
            return results
            
        except Exception as e:
            logging.error(f"Failed to get all users token usage: {e}")
            return []
    
    @classmethod
    @DB.connection_context()
    def get_token_usage_statistics(cls) -> Dict:
        """
        獲取 token 使用統計概覽 (管理員功能)
        
        Returns:
            Dict: 統計信息
        """
        try:
            # 總用戶數
            total_users = User.select().count()
            
            # 啟用 token 限制的用戶數
            users_with_limits = cls.model.select().where(cls.model.token_limit > 0).count()
            
            # 總 token 使用量
            total_tokens_used = cls.model.select().scalar(
                cls.model.select(cls.model.used_tokens.sum()).scalar()
            ) or 0
            
            # 按類型統計 token 使用量
            type_stats = {}
            for record in cls.model.select(
                cls.model.llm_type,
                cls.model.used_tokens.sum().alias('total_tokens')
            ).group_by(cls.model.llm_type).dicts():
                type_stats[record['llm_type']] = record['total_tokens']
            
            return {
                "total_users": total_users,
                "users_with_limits": users_with_limits,
                "total_tokens_used": total_tokens_used,
                "tokens_by_type": type_stats,
                "statistics_date": datetime.now().isoformat()
            }
            
        except Exception as e:
            logging.error(f"Failed to get token usage statistics: {e}")
            return {}
    
    @classmethod
    def _get_or_create_usage_record(cls, user_id: str, llm_type: str, llm_name: str) -> UserTokenUsage:
        """
        獲取或創建用戶 token 使用記錄
        """
        try:
            record = cls.model.get(
                cls.model.user_id == user_id,
                cls.model.llm_type == llm_type,
                cls.model.llm_name == llm_name
            )
            return record
        except cls.model.DoesNotExist:
            # 創建新記錄
            success, user = UserService.get_by_id(user_id)
            default_limit = 0 if (success and user and user.is_superuser) else settings.NORMAL_USER_TOKEN_LIMIT
            
            record = cls.model.create(
                user_id=user_id,
                llm_type=llm_type,
                llm_name=llm_name,
                used_tokens=0,
                token_limit=default_limit,
                reset_date=cls._get_next_reset_date(),
                is_active=True
            )
            return record
    
    @classmethod
    def _should_reset_usage(cls, usage_record: UserTokenUsage) -> bool:
        """
        檢查是否需要重置使用量
        """
        if not usage_record.reset_date:
            return True
            
        return date.today() >= usage_record.reset_date
    
    @classmethod
    def _reset_usage(cls, usage_record: UserTokenUsage):
        """
        重置使用量
        """
        usage_record.used_tokens = 0
        usage_record.reset_date = cls._get_next_reset_date()
        usage_record.save()
    
    @classmethod
    def _get_next_reset_date(cls) -> date:
        """
        獲取下次重置日期
        """
        today = date.today()
        
        if settings.TOKEN_LIMIT_RESET_INTERVAL == 'daily':
            return today + timedelta(days=1)
        elif settings.TOKEN_LIMIT_RESET_INTERVAL == 'weekly':
            days_until_monday = (7 - today.weekday()) % 7
            if days_until_monday == 0:  # 如果今天是週一
                days_until_monday = 7
            return today + timedelta(days=days_until_monday)
        else:  # monthly
            if today.month == 12:
                return date(today.year + 1, 1, 1)
            else:
                return date(today.year, today.month + 1, 1) 