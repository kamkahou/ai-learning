class File(BaseModel):
    id = CharField(primary_key=True)
    parent_id = CharField()
    tenant_id = CharField()
    created_by = CharField()
    type = CharField()
    name = CharField()
    location = CharField()
    size = IntegerField()
    visibility = CharField(default="private")
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        table_name = 'file' 