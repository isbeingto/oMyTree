# 知识库管理 API

[返回目录](./README.md)

| 方法   | 路径                                 | 描述                     |
| ------ | ------------------------------------ | ------------------------ |
| POST   | `/knowledge-bases`                   | 创建知识库               |
| GET    | `/knowledge-bases`                   | 获取知识库列表           |
| GET    | `/knowledge-bases/:id`               | 获取知识库详情           |
| PUT    | `/knowledge-bases/:id`               | 更新知识库               |
| DELETE | `/knowledge-bases/:id`               | 删除知识库               |
| POST   | `/knowledge-bases/copy`              | 拷贝知识库               |
| GET    | `/knowledge-bases/:id/hybrid-search` | 混合搜索（向量+关键词）  |

## POST `/knowledge-bases` - 创建知识库

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases' \
--header 'Content-Type: application/json' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--data '{
    "name": "weknora",
    "description": "weknora description",
    "chunking_config": {
        "chunk_size": 1000,
        "chunk_overlap": 200,
        "separators": [
            "."
        ],
        "enable_multimodal": true
    },
    "image_processing_config": {
        "model_id": "f2083ad7-63e3-486d-a610-e6c56e58d72e"
    },
    "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
    "summary_model_id": "8aea788c-bb30-4898-809e-e40c14ffb48c",
    "rerank_model_id": "b30171a1-787b-426e-a293-735cd5ac16c0",
    "vlm_config": {
        "enabled": true,
        "model_id": "f2083ad7-63e3-486d-a610-e6c56e58d72e"
    },
    "cos_config": {
        "secret_id": "",
        "secret_key": "",
        "region": "",
        "bucket_name": "",
        "app_id": "",
        "path_prefix": ""
    }
}'
```

**响应**:

```json
{
    "data": {
        "id": "b5829e4a-3845-4624-a7fb-ea3b35e843b0",
        "name": "weknora",
        "description": "weknora description",
        "tenant_id": 1,
        "chunking_config": {
            "chunk_size": 1000,
            "chunk_overlap": 200,
            "separators": [
                "."
            ],
            "enable_multimodal": true
        },
        "image_processing_config": {
            "model_id": "f2083ad7-63e3-486d-a610-e6c56e58d72e"
        },
        "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
        "summary_model_id": "8aea788c-bb30-4898-809e-e40c14ffb48c",
        "rerank_model_id": "b30171a1-787b-426e-a293-735cd5ac16c0",
        "vlm_config": {
            "enabled": true,
            "model_id": "f2083ad7-63e3-486d-a610-e6c56e58d72e"
        },
        "cos_config": {
            "secret_id": "",
            "secret_key": "",
            "region": "",
            "bucket_name": "",
            "app_id": "",
            "path_prefix": ""
        },
        "created_at": "2025-08-12T11:30:09.206238645+08:00",
        "updated_at": "2025-08-12T11:30:09.206238854+08:00",
        "deleted_at": null
    },
    "success": true
}
```

## GET `/knowledge-bases` - 获取知识库列表

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases' \
--header 'Content-Type: application/json' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ'
```

**响应**:

```json
{
    "data": [
        {
            "id": "kb-00000001",
            "name": "Default Knowledge Base",
            "description": "System Default Knowledge Base",
            "tenant_id": 1,
            "chunking_config": {
                "chunk_size": 1000,
                "chunk_overlap": 200,
                "separators": [
                    "\n\n",
                    "\n",
                    "。",
                    "！",
                    "？",
                    ";",
                    "；"
                ],
                "enable_multimodal": true
            },
            "image_processing_config": {
                "model_id": ""
            },
            "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
            "summary_model_id": "8aea788c-bb30-4898-809e-e40c14ffb48c",
            "rerank_model_id": "b30171a1-787b-426e-a293-735cd5ac16c0",
            "vlm_config": {
                "enabled": true,
                "model_id": "f2083ad7-63e3-486d-a610-e6c56e58d72e"
            },
            "cos_config": {
                "secret_id": "",
                "secret_key": "",
                "region": "",
                "bucket_name": "",
                "app_id": "",
                "path_prefix": ""
            },
            "created_at": "2025-08-11T20:10:41.817794+08:00",
            "updated_at": "2025-08-12T11:23:00.593097+08:00",
            "deleted_at": null
        }
    ],
    "success": true
}
```

## GET `/knowledge-bases/:id` - 获取知识库详情

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001' \
--header 'Content-Type: application/json' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ'
```

**响应**:

```json
{
    "data": {
        "id": "kb-00000001",
        "name": "Default Knowledge Base",
        "description": "System Default Knowledge Base",
        "tenant_id": 1,
        "chunking_config": {
            "chunk_size": 1000,
            "chunk_overlap": 200,
            "separators": [
                "\n\n",
                "\n",
                "。",
                "！",
                "？",
                ";",
                "；"
            ],
            "enable_multimodal": true
        },
        "image_processing_config": {
            "model_id": ""
        },
        "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
        "summary_model_id": "8aea788c-bb30-4898-809e-e40c14ffb48c",
        "rerank_model_id": "b30171a1-787b-426e-a293-735cd5ac16c0",
        "vlm_config": {
            "enabled": true,
            "model_id": "f2083ad7-63e3-486d-a610-e6c56e58d72e"
        },
        "cos_config": {
            "secret_id": "",
            "secret_key": "",
            "region": "",
            "bucket_name": "",
            "app_id": "",
            "path_prefix": ""
        },
        "created_at": "2025-08-11T20:10:41.817794+08:00",
        "updated_at": "2025-08-12T11:23:00.593097+08:00",
        "deleted_at": null
    },
    "success": true
}
```

## PUT `/knowledge-bases/:id` - 更新知识库

**请求**:

```curl
curl --location --request PUT 'http://localhost:8080/api/v1/knowledge-bases/b5829e4a-3845-4624-a7fb-ea3b35e843b0' \
--header 'Content-Type: application/json' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--data '{
    "name": "weknora new",
    "description": "weknora description new",
    "config": {
        "chunking_config": {
            "chunk_size": 1000,
            "chunk_overlap": 200,
            "separators": [
                "\n\n",
                "\n",
                "。",
                "！",
                "？",
                ";",
                "；"
            ],
            "enable_multimodal": true
        },
        "image_processing_config": {
            "model_id": ""
        }
    }
}'
```

**响应**:

```json
{
    "data": {
        "id": "b5829e4a-3845-4624-a7fb-ea3b35e843b0",
        "name": "weknora new",
        "description": "weknora description new",
        "tenant_id": 1,
        "chunking_config": {
            "chunk_size": 1000,
            "chunk_overlap": 200,
            "separators": [
                "\n\n",
                "\n",
                "。",
                "！",
                "？",
                ";",
                "；"
            ],
            "enable_multimodal": true
        },
        "image_processing_config": {
            "model_id": ""
        },
        "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
        "summary_model_id": "8aea788c-bb30-4898-809e-e40c14ffb48c",
        "rerank_model_id": "b30171a1-787b-426e-a293-735cd5ac16c0",
        "vlm_config": {
            "enabled": true,
            "model_id": "f2083ad7-63e3-486d-a610-e6c56e58d72e"
        },
        "cos_config": {
            "secret_id": "",
            "secret_key": "",
            "region": "",
            "bucket_name": "",
            "app_id": "",
            "path_prefix": ""
        },
        "created_at": "2025-08-12T11:30:09.206238+08:00",
        "updated_at": "2025-08-12T11:36:09.083577609+08:00",
        "deleted_at": null
    },
    "success": true
}
```

## DELETE `/knowledge-bases/:id` - 删除知识库

**请求**:

```curl
curl --location --request DELETE 'http://localhost:8080/api/v1/knowledge-bases/b5829e4a-3845-4624-a7fb-ea3b35e843b0' \
--header 'Content-Type: application/json' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ'
```

**响应**:

```json
{
    "message": "Knowledge base deleted successfully",
    "success": true
}
```

## GET `/knowledge-bases/:id/hybrid-search` - 混合搜索

执行向量搜索和关键词搜索的混合检索。

**注意**：此接口使用 GET 方法但需要 JSON 请求体。

**请求参数**：
- `query_text`: 搜索查询文本（必填）
- `vector_threshold`: 向量相似度阈值（0-1，可选）
- `keyword_threshold`: 关键词匹配阈值（可选）
- `match_count`: 返回结果数量（可选）
- `disable_keywords_match`: 是否禁用关键词匹配（可选）
- `disable_vector_match`: 是否禁用向量匹配（可选）

**请求**:

```curl
curl --location --request GET 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/hybrid-search' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "query_text": "如何使用知识库",
    "vector_threshold": 0.5,
    "match_count": 10
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
