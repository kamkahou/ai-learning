# 文件MD5重复检测功能说明

## 功能概述

本功能为RagFlow系统添加了基于MD5哈希的文件重复检测机制，可以在用户上传文件时检测重复内容，并根据用户权限级别采取不同的处理策略。

## 功能特点

### 1. MD5哈希计算
- 自动计算上传文件的MD5哈希值
- 将MD5值存储在document表的md5_hash字段中
- 支持二进制和文本内容的哈希计算

### 2. 分层重复检测策略

#### 超级用户上传：
- 检测知识库中所有已有文件的MD5重复
- 如果发现重复，提醒用户文件已存在
- 由用户决定是否继续上传

#### 普通用户上传：
根据重复情况分为三种处理方式：

1. **文件无重复**
   - 正常上传并处理文件

2. **与用户可见文件重复**
   - 包括：公共文件、用户自己的私有文件、已授权访问的文件
   - 提醒用户文件重复，阻止上传

3. **与用户不可见的管理员私有文件重复**
   - 不实际处理和存储文件
   - 自动为用户授权访问已存在的文件
   - 避免重复解析，减轻服务器负担

## 技术实现

### 数据库变更
```sql
-- 为document表添加md5_hash字段
ALTER TABLE document ADD COLUMN md5_hash VARCHAR(32) NULL COMMENT 'MD5 hash of file content';
CREATE INDEX idx_document_md5_hash ON document(md5_hash);
```

### 核心方法

#### DocumentService.calculate_file_md5(file_content)
计算文件内容的MD5哈希值。

#### DocumentService.find_duplicates_by_md5(md5_hash, user_id, kb_id)
根据MD5查找重复文件，返回：
- 所有重复文件列表
- 用户可见的重复文件列表  
- 用户不可见但存在的重复文件列表

#### DocumentService.check_file_duplication(file_content, user_id, kb_id)
执行完整的重复检测逻辑，返回处理建议：
```python
{
    'is_duplicate': bool,           # 是否重复
    'action': str,                  # 'allow', 'deny', 'grant_access'
    'message': str,                 # 提示信息
    'existing_doc': dict or None,   # 已存在的文档信息
    'md5_hash': str                 # 文件MD5哈希
}
```

#### DocumentService.grant_document_access(doc_id, user_id)
为用户授权访问指定文档，在meta_fields.authorized_users中添加用户ID。

### 权限系统

#### 文档可见性判断
文档对用户可见的条件：
1. 用户是超级用户
2. 文档是公开的（visibility='public'）
3. 文档是用户自己创建的
4. 用户在文档的授权列表中（meta_fields.authorized_users）

#### 授权机制
通过在文档的meta_fields字段中维护authorized_users列表来管理细粒度的访问权限。

## 使用示例

### 文件上传处理流程

```python
# 在FileService.upload_document方法中
blob = file.read()

# 检查文件重复
duplication_result = DocumentService.check_file_duplication(blob, user_id, kb.id)

if duplication_result['action'] == 'deny':
    # 文件重复，拒绝上传
    raise RuntimeError(duplication_result['message'])
    
elif duplication_result['action'] == 'grant_access':
    # 授权访问已存在的文件
    existing_doc = duplication_result['existing_doc']
    DocumentService.grant_document_access(existing_doc['id'], user_id)
    return existing_doc  # 返回已存在的文档
    
else:
    # 正常上传流程
    doc = {
        "id": doc_id,
        "kb_id": kb.id,
        "md5_hash": duplication_result['md5_hash'],  # 保存MD5
        # ... 其他字段
    }
    DocumentService.insert(doc)
```

## 测试

运行测试脚本验证功能：
```bash
python test_md5_duplication.py
```

## 优势

1. **避免重复存储**：相同内容的文件不会被重复存储
2. **减少解析负担**：避免对相同文件进行重复的文档解析
3. **智能权限管理**：自动为用户授权访问已存在的文件
4. **用户体验友好**：不同用户级别有相应的提示和处理方式
5. **存储空间优化**：避免相同文件的重复存储

## 注意事项

1. MD5哈希虽然计算快速，但在极端情况下可能存在哈希碰撞
2. 权限授权基于meta_fields字段，需要确保JSON格式正确
3. 大文件的MD5计算可能会消耗一定的CPU资源
4. 建议定期清理无效的授权记录

## 配置建议

1. 为md5_hash字段创建数据库索引以提高查询性能
2. 考虑在高并发场景下使用文件锁避免竞态条件
3. 可以配置MD5计算的缓存策略以提高性能 