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
from flask import Blueprint, request
from flask_login import login_required, current_user

from api.db.services.question_record_service import QuestionRecordService
from api.db.services.user_service import UserTenantService
from api.utils.api_utils import get_json_result, get_data_error_result, server_error_response
from api.utils import current_timestamp

# Initialize logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Create a blueprint with the correct URL prefix
manager = Blueprint("question_record", __name__, url_prefix="/api/v1/question_record")
logger.info("question_record blueprint created with prefix: /api/v1/question_record")


def check_admin_permission():
    """Checks if the current user has admin permissions."""
    try:
        if hasattr(current_user, 'is_superuser') and current_user.is_superuser:
            return True
        tenants = UserTenantService.query(user_id=current_user.id)
        for tenant in tenants:
            if tenant.role in ['admin', 'owner']:
                return True
        return False
    except Exception as e:
        logger.error(f"Error checking admin permission: {e}")
        return False


@manager.route('/list', methods=['GET'])
@login_required
def get_question_list():
    """Gets the list of question records."""
    if not check_admin_permission():
        return get_data_error_result(message="Permission denied.")

    try:
        page_number = int(request.args.get('page', 1))
        items_per_page = int(request.args.get('page_size', 20))
        orderby = request.args.get('orderby', 'create_time')
        desc = request.args.get('desc', 'true').lower() == 'true'
        user_id = request.args.get('user_id')
        source = request.args.get('source')
        keyword = request.args.get('keyword')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

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

        total_count = QuestionRecordService.model.select().count()

        return get_json_result(data={
            "list": question_list,
            "total": total_count,
            "page": page_number,
            "page_size": items_per_page
        })
    except Exception as e:
        logger.error(f"Error getting question list: {e}")
        return server_error_response(e)


@manager.route('/stats', methods=['GET'])
@login_required
def get_question_stats():
    """Gets question statistics."""
    if not check_admin_permission():
        return get_data_error_result(message="Permission denied.")

    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        stats = QuestionRecordService.get_question_stats(
            start_date=start_date,
            end_date=end_date
        )
        return get_json_result(data=stats)
    except Exception as e:
        logger.error(f"Error getting question stats: {e}")
        return server_error_response(e)


@manager.route('/export', methods=['GET'])
@login_required
def export_questions():
    """Exports question records."""
    if not check_admin_permission():
        return get_data_error_result(message="Permission denied.")

    try:
        user_id = request.args.get('user_id')
        source = request.args.get('source')
        keyword = request.args.get('keyword')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        questions = QuestionRecordService.get_question_list(
            page_number=1,
            items_per_page=10000,
            user_id=user_id,
            source=source,
            keyword=keyword,
            start_date=start_date,
            end_date=end_date
        )
        return get_json_result(data=questions)
    except Exception as e:
        logger.error(f"Error exporting questions: {e}")
        return server_error_response(e)


@manager.route('/delete', methods=['POST'])
@login_required
def delete_questions():
    """Deletes question records."""
    if not check_admin_permission():
        return get_data_error_result(message="Permission denied.")

    try:
        req = request.json
        question_ids = req.get('question_ids', [])
        if not question_ids:
            return get_data_error_result(message="Question IDs are required.")

        deleted_count = QuestionRecordService.model.delete().where(
            QuestionRecordService.model.id.in_(question_ids)
        ).execute()

        return get_json_result(data={
            "deleted_count": deleted_count,
            "message": f"Successfully deleted {deleted_count} records."
        })
    except Exception as e:
        logger.error(f"Error deleting questions: {e}")
        return server_error_response(e)

@manager.route('/test', methods=['GET'])
def test_route():
    """A simple test route to ensure the blueprint is registered and accessible."""
    timestamp = current_timestamp()
    logger.info(f"Test route accessed at {timestamp}")
    return get_json_result(data={"message": "Question record blueprint is working!", "timestamp": timestamp}) 