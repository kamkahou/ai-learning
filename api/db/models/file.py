from api.db.base_models import Base, DataBaseModel
from api.db.db_models import Tenant, User
from api.db import FileSource


class File(DataBaseModel):
    id = CharField(max_length=32, primary_key=True)
    parent_id = CharField(max_length=32, null=False, help_text="parent folder id", index=True)
    tenant_id = CharField(max_length=32, null=False, help_text="tenant id", index=True)
    created_by = CharField(max_length=32, null=False, help_text="who created it", index=True)
    name = CharField(max_length=255, null=False, help_text="file name or folder name", index=True)
    location = CharField(max_length=255, null=True, help_text="where dose it store", index=True)
    size = IntegerField(default=0, index=True)
    type = CharField(max_length=32, null=False, help_text="file extension", index=True)
    source_type = CharField(max_length=128, null=False, default="", help_text="where dose this document come from", index=True)
    visibility = CharField(max_length=32, null=False, default="private", help_text="file visibility", index=True)
    permission = CharField(max_length=32, default='private', help_text="File permission: private or public")

    def to_dict(self):
        return {
            "id": self.id,
            "parent_id": self.parent_id,
            "tenant_id": self.tenant_id,
            "created_by": self.created_by,
            "name": self.name,
            "location": self.location,
            "size": self.size,
            "type": self.type,
            "source_type": self.source_type,
            "visibility": self.visibility,
            "create_time": self.create_time,
            "create_date": self.create_date,
            "update_time": self.update_time,
            "update_date": self.update_date,
            "permission": self.permission,
        }

    class Meta:
        database = DB

class Document(DataBaseModel):
    id = CharField(max_length=128, primary_key=True)
    kb_id = CharField(max_length=128, null=False, help_text="knowledge base id", index=True) 