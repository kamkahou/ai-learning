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

from flask import Blueprint, request
from flask_login import login_required, current_user

from api.db.services.question_record_service import QuestionRecordService
from api.db.services.user_service import UserTenantService
from api.utils.api_utils import get_json_result, get_data_error_result, server_error_response


manager = Blueprint("question_record_manager", __name__, url_prefix="/api/v1/question_record")


def check_admin_permission():
    """檢查管理員權限"""
    try:
        # 檢查用戶是否為超級管理員
        if hasattr(current_user, 'is_superuser') and current_user.is_superuser:
            return True
        
        # 或者檢查是否為租戶管理員 
        tenants = UserTenantService.query(user_id=current_user.id)
        for tenant in tenants:
            if tenant.role in ['admin', 'owner']:
                return True
        
        return False
    except Exception:
        return False


@manager.route('/list', methods=['GET'])
@login_required
def get_question_list():
    """獲取問題記錄列表"""
    if not check_admin_permission():
        return get_data_error_result(message="權限不足，僅管理員可以查看問題記錄")
    
    try:
        # 獲取查詢參數
        page_number = int(request.args.get('page', 1))
        items_per_page = int(request.args.get('page_size', 20))
        orderby = request.args.get('orderby', 'create_time')
        desc = request.args.get('desc', 'true').lower() == 'true'
        user_id = request.args.get('user_id')
        source = request.args.get('source')
        keyword = request.args.get('keyword')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # 獲取問題記錄列表
        question_list = QuestionRecordService.get_question_list(
            page_number=page_number,
            items_per_page=items_per_page,
            orderby=orderby,
            desc=desc,
            user_id=user_id,
            source=source,
            keyword=keyword,
            start_date=start_date,
            end_date=end_date
        )
        
        # 獲取總數
        total_count = QuestionRecordService.model.select().count()
        
        return get_json_result(data={
            "list": question_list,
            "total": total_count,
            "page": page_number,
            "page_size": items_per_page
        })
        
    except Exception as e:
        return server_error_response(e)


@manager.route('/stats', methods=['GET'])
@login_required  
def get_question_stats():
    """獲取問題統計信息"""
    if not check_admin_permission():
        return get_data_error_result(message="權限不足，僅管理員可以查看統計信息")
    
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        stats = QuestionRecordService.get_question_stats(
            start_date=start_date,
            end_date=end_date
        )
        
        return get_json_result(data=stats)
        
    except Exception as e:
        return server_error_response(e)


@manager.route('/user_stats/<user_id>', methods=['GET'])
@login_required
def get_user_question_stats(user_id):
    """獲取特定用戶的問題統計"""
    if not check_admin_permission():
        return get_data_error_result(message="權限不足，僅管理員可以查看用戶統計")
    
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        count = QuestionRecordService.get_user_question_count(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date
        )
        
        return get_json_result(data={"user_id": user_id, "question_count": count})
        
    except Exception as e:
        return server_error_response(e)


@manager.route('/export', methods=['GET'])
@login_required
def export_questions():
    """導出問題記錄"""
    if not check_admin_permission():
        return get_data_error_result(message="權限不足，僅管理員可以導出數據")
    
    try:
        # 獲取查詢參數
        user_id = request.args.get('user_id')
        source = request.args.get('source')
        keyword = request.args.get('keyword')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # 獲取所有符合條件的記錄（不分頁）
        questions = QuestionRecordService.get_question_list(
            page_number=1,
            items_per_page=10000,  # 設置一個大數值獲取所有記錄
            user_id=user_id,
            source=source,
            keyword=keyword,
            start_date=start_date,
            end_date=end_date
        )
        
        return get_json_result(data=questions)
        
    except Exception as e:
        return server_error_response(e)


@manager.route('/delete', methods=['POST'])
@login_required
def delete_questions():
    """批量刪除問題記錄"""
    if not check_admin_permission():
        return get_data_error_result(message="權限不足，僅管理員可以刪除記錄")
    
    try:
        req = request.json
        question_ids = req.get('question_ids', [])
        
        if not question_ids:
            return get_data_error_result(message="請提供要刪除的問題記錄ID")
        
        # 批量刪除記錄
        deleted_count = QuestionRecordService.model.delete().where(
            QuestionRecordService.model.id.in_(question_ids)
        ).execute()
        
        return get_json_result(data={
            "deleted_count": deleted_count,
            "message": f"成功刪除 {deleted_count} 條記錄"
        })
        
    except Exception as e:
        return server_error_response(e)


@manager.route('/search', methods=['POST'])
@login_required
def search_questions():
    """高級搜索問題記錄"""
    if not check_admin_permission():
        return get_data_error_result(message="權限不足，僅管理員可以搜索記錄")
    
    try:
        req = request.json
        
        # 獲取搜索條件
        page_number = req.get('page', 1)
        items_per_page = req.get('page_size', 20)
        orderby = req.get('orderby', 'create_time')
        desc = req.get('desc', True)
        
        filters = req.get('filters', {})
        user_id = filters.get('user_id')
        source = filters.get('source')
        keyword = filters.get('keyword')
        start_date = filters.get('start_date')
        end_date = filters.get('end_date')
        
        # 執行搜索
        question_list = QuestionRecordService.get_question_list(
            page_number=page_number,
            items_per_page=items_per_page,
            orderby=orderby,
            desc=desc,
            user_id=user_id,
            source=source,
            keyword=keyword,
            start_date=start_date,
            end_date=end_date
        )
        
        return get_json_result(data={
            "list": question_list,
            "page": page_number,
            "page_size": items_per_page
        })
        
    except Exception as e:
        return server_error_response(e) 