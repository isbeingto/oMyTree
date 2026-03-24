# FAQ管理 API

[返回目录](./README.md)

| 方法   | 路径                                        | 描述                     |
| ------ | ------------------------------------------- | ------------------------ |
| GET    | `/knowledge-bases/:id/faq/entries`          | 获取FAQ条目列表          |
| POST   | `/knowledge-bases/:id/faq/entries`          | 批量导入FAQ条目          |
| POST   | `/knowledge-bases/:id/faq/entry`            | 创建单个FAQ条目          |
| PUT    | `/knowledge-bases/:id/faq/entries/:entry_id`| 更新单个FAQ条目          |
| PUT    | `/knowledge-bases/:id/faq/entries/status`   | 批量更新FAQ启用状态      |
| PUT    | `/knowledge-bases/:id/faq/entries/tags`     | 批量更新FAQ标签          |
| DELETE | `/knowledge-bases/:id/faq/entries`          | 批量删除FAQ条目          |
| POST   | `/knowledge-bases/:id/faq/search`           | 混合搜索FAQ              |

## GET `/knowledge-bases/:id/faq/entries` - 获取FAQ条目列表

**查询参数**:
- `page`: 页码（默认 1）
- `page_size`: 每页条数（默认 20）
- `tag_id`: 按标签ID筛选（可选）
- `keyword`: 关键字搜索（可选）
- `search_field`: 搜索字段（可选），可选值：
  - `standard_question`: 只搜索标准问题
  - `similar_questions`: 只搜索相似问法
  - `answers`: 只搜索答案
  - 留空或不传：搜索全部字段
- `sort_order`: 排序方式（可选），`asc` 表示按更新时间正序，默认按更新时间倒序

**请求**:

```curl
# 搜索全部字段
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries?page=1&page_size=10&keyword=密码' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json'

# 只搜索标准问题
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries?keyword=密码&search_field=standard_question' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ'

# 只搜索相似问法
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries?keyword=忘记&search_field=similar_questions' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ'

# 只搜索答案
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries?keyword=点击&search_field=answers' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ'
```

**响应**:

```json
{
    "data": {
        "total": 100,
        "page": 1,
        "page_size": 10,
        "data": [
            {
                "id": "faq-00000001",
                "chunk_id": "chunk-00000001",
                "knowledge_id": "knowledge-00000001",
                "knowledge_base_id": "kb-00000001",
                "tag_id": "tag-00000001",
                "is_enabled": true,
                "standard_question": "如何重置密码？",
                "similar_questions": ["忘记密码怎么办", "密码找回"],
                "negative_questions": ["如何修改用户名"],
                "answers": ["您可以通过点击登录页面的'忘记密码'链接来重置密码。"],
                "index_mode": "hybrid",
                "chunk_type": "faq",
                "created_at": "2025-08-12T10:00:00+08:00",
                "updated_at": "2025-08-12T10:00:00+08:00"
            }
        ]
    },
    "success": true
}
```

## POST `/knowledge-bases/:id/faq/entries` - 批量导入FAQ条目

**请求参数**:
- `mode`: 导入模式，`append`（追加）或 `replace`（替换）
- `entries`: FAQ条目数组
- `knowledge_id`: 关联的知识ID（可选）

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "mode": "append",
    "entries": [
        {
            "standard_question": "如何联系客服？",
            "similar_questions": ["客服电话", "在线客服"],
            "answers": ["您可以通过拨打400-xxx-xxxx联系我们的客服。"],
            "tag_id": "tag-00000001"
        },
        {
            "standard_question": "退款政策是什么？",
            "answers": ["我们提供7天无理由退款服务。"]
        }
    ]
}'
```

**响应**:

```json
{
    "data": {
        "task_id": "task-00000001"
    },
    "success": true
}
```

注：批量导入为异步操作，返回任务ID用于追踪进度。

## POST `/knowledge-bases/:id/faq/entry` - 创建单个FAQ条目

同步创建单个FAQ条目，适用于单条录入场景。会自动检查标准问和相似问是否与已有FAQ重复。

**请求参数**:
- `standard_question`: 标准问（必填）
- `similar_questions`: 相似问数组（可选）
- `negative_questions`: 反例问题数组（可选）
- `answers`: 答案数组（必填）
- `tag_id`: 标签ID（可选）
- `is_enabled`: 是否启用（可选，默认true）

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entry' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "standard_question": "如何联系客服？",
    "similar_questions": ["客服电话", "在线客服"],
    "answers": ["您可以通过拨打400-xxx-xxxx联系我们的客服。"],
    "tag_id": "tag-00000001",
    "is_enabled": true
}'
```

**响应**:

```json
{
    "data": {
        "id": "faq-00000001",
        "chunk_id": "chunk-00000001",
        "knowledge_id": "knowledge-00000001",
        "knowledge_base_id": "kb-00000001",
        "tag_id": "tag-00000001",
        "is_enabled": true,
        "standard_question": "如何联系客服？",
        "similar_questions": ["客服电话", "在线客服"],
        "negative_questions": [],
        "answers": ["您可以通过拨打400-xxx-xxxx联系我们的客服。"],
        "index_mode": "hybrid",
        "chunk_type": "faq",
        "created_at": "2025-08-12T10:00:00+08:00",
        "updated_at": "2025-08-12T10:00:00+08:00"
    },
    "success": true
}
```

**错误响应**（标准问或相似问重复时）:

```json
{
    "success": false,
    "error": {
        "code": "BAD_REQUEST",
        "message": "标准问与已有FAQ重复"
    }
}
```

## PUT `/knowledge-bases/:id/faq/entries/:entry_id` - 更新单个FAQ条目

**请求**:

```curl
curl --location --request PUT 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries/faq-00000001' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "standard_question": "如何重置账户密码？",
    "similar_questions": ["忘记密码怎么办", "密码找回", "重置密码"],
    "answers": ["您可以通过以下步骤重置密码：1. 点击登录页面的\"忘记密码\" 2. 输入注册邮箱 3. 查收重置邮件"],
    "is_enabled": true
}'
```

**响应**:

```json
{
    "success": true
}
```

## PUT `/knowledge-bases/:id/faq/entries/status` - 批量更新FAQ启用状态

**请求**:

```curl
curl --location --request PUT 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries/status' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "updates": {
        "faq-00000001": true,
        "faq-00000002": false,
        "faq-00000003": true
    }
}'
```

**响应**:

```json
{
    "success": true
}
```

## PUT `/knowledge-bases/:id/faq/entries/tags` - 批量更新FAQ标签

**请求**:

```curl
curl --location --request PUT 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries/tags' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "updates": {
        "faq-00000001": "tag-00000001",
        "faq-00000002": "tag-00000002",
        "faq-00000003": null
    }
}'
```

注：设置为 `null` 可清除标签关联。

**响应**:

```json
{
    "success": true
}
```

## DELETE `/knowledge-bases/:id/faq/entries` - 批量删除FAQ条目

**请求**:

```curl
curl --location --request DELETE 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/entries' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "ids": ["faq-00000001", "faq-00000002"]
}'
```

**响应**:

```json
{
    "success": true
}
```

## POST `/knowledge-bases/:id/faq/search` - 混合搜索FAQ

**请求参数**:
- `query_text`: 搜索查询文本
- `vector_threshold`: 向量相似度阈值（0-1）
- `match_count`: 返回结果数量（最大200）

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/faq/search' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "query_text": "如何重置密码",
    "vector_threshold": 0.5,
    "match_count": 10
}'
```

**响应**:

```json
{
    "data": [
        {
            "id": "faq-00000001",
            "chunk_id": "chunk-00000001",
            "knowledge_id": "knowledge-00000001",
            "knowledge_base_id": "kb-00000001",
            "tag_id": "tag-00000001",
            "is_enabled": true,
            "standard_question": "如何重置密码？",
            "similar_questions": ["忘记密码怎么办", "密码找回"],
            "answers": ["您可以通过点击登录页面的'忘记密码'链接来重置密码。"],
            "chunk_type": "faq",
            "score": 0.95,
            "match_type": "vector",
            "created_at": "2025-08-12T10:00:00+08:00",
            "updated_at": "2025-08-12T10:00:00+08:00"
        }
    ],
    "success": true
}
```
