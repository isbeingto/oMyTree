# 知识搜索 API

[返回目录](./README.md)

| 方法 | 路径               | 描述     |
| ---- | ------------------ | -------- |
| POST | `/knowledge-search` | 知识搜索 |

## POST `/knowledge-search` - 知识搜索

在知识库中搜索相关内容（不使用 LLM 总结），直接返回检索结果。

**请求参数**:
- `query`: 搜索查询文本（必填）
- `knowledge_base_id`: 单个知识库ID（向后兼容）
- `knowledge_base_ids`: 知识库ID列表（支持多知识库搜索）
- `knowledge_ids`: 指定知识（文件）ID列表

**请求**:

```curl
# 搜索单个知识库
curl --location 'http://localhost:8080/api/v1/knowledge-search' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "query": "如何使用知识库",
    "knowledge_base_id": "kb-00000001"
}'

# 搜索多个知识库
curl --location 'http://localhost:8080/api/v1/knowledge-search' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "query": "如何使用知识库",
    "knowledge_base_ids": ["kb-00000001", "kb-00000002"]
}'

# 搜索指定文件
curl --location 'http://localhost:8080/api/v1/knowledge-search' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "query": "如何使用知识库",
    "knowledge_ids": ["4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5"]
}'
```

**响应**:

```json
{
    "data": [
        {
            "id": "chunk-00000001",
            "content": "知识库是用于存储和检索知识的系统...",
            "knowledge_id": "knowledge-00000001",
            "chunk_index": 0,
            "knowledge_title": "知识库使用指南",
            "start_at": 0,
            "end_at": 500,
            "seq": 1,
            "score": 0.95,
            "chunk_type": "text",
            "image_info": "",
            "metadata": {},
            "knowledge_filename": "guide.pdf",
            "knowledge_source": "file"
        }
    ],
    "success": true
}
```
