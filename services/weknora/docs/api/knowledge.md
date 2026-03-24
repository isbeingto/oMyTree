# 知识管理 API

[返回目录](./README.md)

| 方法   | 路径                                  | 描述                     |
| ------ | ------------------------------------- | ------------------------ |
| POST   | `/knowledge-bases/:id/knowledge/file` | 从文件创建知识           |
| POST   | `/knowledge-bases/:id/knowledge/url`  | 从 URL 创建知识          |
| POST   | `/knowledge-bases/:id/knowledge/manual` | 创建手工 Markdown 知识 |
| GET    | `/knowledge-bases/:id/knowledge`      | 获取知识库下的知识列表   |
| GET    | `/knowledge/:id`                      | 获取知识详情             |
| DELETE | `/knowledge/:id`                      | 删除知识                 |
| GET    | `/knowledge/:id/download`             | 下载知识文件             |
| PUT    | `/knowledge/:id`                      | 更新知识                 |
| PUT    | `/knowledge/manual/:id`               | 更新手工 Markdown 知识   |
| PUT    | `/knowledge/image/:id/:chunk_id`      | 更新图像分块信息         |
| PUT    | `/knowledge/tags`                     | 批量更新知识标签         |
| GET    | `/knowledge/batch`                    | 批量获取知识             |

## POST `/knowledge-bases/:id/knowledge/file` - 从文件创建知识

**表单参数**：
- `file`: 上传的文件（必填）
- `metadata`: JSON 格式的元数据（可选）
- `enable_multimodel`: 是否启用多模态处理（可选，true/false）
- `fileName`: 自定义文件名，用于文件夹上传时保留路径（可选）

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/knowledge/file' \
--header 'Content-Type: application/json' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--form 'file=@"/Users/xxxx/tests/彗星.txt"' \
--form 'enable_multimodel="true"'
```

**响应**:

```json
{
    "data": {
        "id": "4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5",
        "tenant_id": 1,
        "knowledge_base_id": "kb-00000001",
        "type": "file",
        "title": "彗星.txt",
        "description": "",
        "source": "",
        "parse_status": "processing",
        "enable_status": "disabled",
        "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
        "file_name": "彗星.txt",
        "file_type": "txt",
        "file_size": 7710,
        "file_hash": "d69476ddbba45223a5e97e786539952c",
        "file_path": "data/files/1/4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5/1754970756171067621.txt",
        "storage_size": 0,
        "metadata": null,
        "created_at": "2025-08-12T11:52:36.168632288+08:00",
        "updated_at": "2025-08-12T11:52:36.173612121+08:00",
        "processed_at": null,
        "error_message": "",
        "deleted_at": null
    },
    "success": true
}
```

## POST `/knowledge-bases/:id/knowledge/url` - 从 URL 创建知识

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/knowledge/url' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "url":"https://github.com/Tencent/WeKnora",
    "enable_multimodel":true
}'
```

**响应**:

```json
{
    "data": {
        "id": "9c8af585-ae15-44ce-8f73-45ad18394651",
        "tenant_id": 1,
        "knowledge_base_id": "kb-00000001",
        "type": "url",
        "title": "",
        "description": "",
        "source": "https://github.com/Tencent/WeKnora",
        "parse_status": "processing",
        "enable_status": "disabled",
        "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
        "file_name": "",
        "file_type": "",
        "file_size": 0,
        "file_hash": "",
        "file_path": "",
        "storage_size": 0,
        "metadata": null,
        "created_at": "2025-08-12T11:55:05.709266776+08:00",
        "updated_at": "2025-08-12T11:55:05.712918234+08:00",
        "processed_at": null,
        "error_message": "",
        "deleted_at": null
    },
    "success": true
}
```

## GET `/knowledge-bases/:id/knowledge` - 获取知识库下的知识列表

**查询参数**：
- `page`: 页码（默认 1）
- `page_size`: 每页条数（默认 20）
- `tag_id`: 按标签ID筛选（可选）

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-bases/kb-00000001/knowledge?page_size=1&page=1&tag_id=tag-00000001' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json'
```

**响应**:

```json
{
    "data": [
        {
            "id": "9c8af585-ae15-44ce-8f73-45ad18394651",
            "tenant_id": 1,
            "knowledge_base_id": "kb-00000001",
            "type": "url",
            "title": "",
            "description": "",
            "source": "https://github.com/Tencent/WeKnora",
            "parse_status": "pending",
            "enable_status": "disabled",
            "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
            "file_name": "",
            "file_type": "",
            "file_size": 0,
            "file_hash": "",
            "file_path": "",
            "storage_size": 0,
            "metadata": null,
            "created_at": "2025-08-12T11:55:05.709266+08:00",
            "updated_at": "2025-08-12T11:55:05.709266+08:00",
            "processed_at": null,
            "error_message": "",
            "deleted_at": null
        }
    ],
    "page": 1,
    "page_size": 1,
    "success": true,
    "total": 2
}
```

注：parse_status 包含 `pending/processing/failed/completed` 四种状态

## GET `/knowledge/:id` - 获取知识详情

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge/4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json'
```

**响应**:

```json
{
    "data": {
        "id": "4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5",
        "tenant_id": 1,
        "knowledge_base_id": "kb-00000001",
        "type": "file",
        "title": "彗星.txt",
        "description": "彗星是由冰和尘埃构成的太阳系小天体，接近太阳时会形成彗发和彗尾。其轨道周期差异大，来源包括柯伊伯带和奥尔特云。彗星与小行星的区别逐渐模糊，部分彗星已失去挥发物质，类似小行星。截至2019年，已知彗星超6600颗，数量庞大。彗星在古代被视为凶兆，现代研究揭示其复杂结构与起源。",
        "source": "",
        "parse_status": "completed",
        "enable_status": "enabled",
        "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
        "file_name": "彗星.txt",
        "file_type": "txt",
        "file_size": 7710,
        "file_hash": "d69476ddbba45223a5e97e786539952c",
        "file_path": "data/files/1/4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5/1754970756171067621.txt",
        "storage_size": 33689,
        "metadata": null,
        "created_at": "2025-08-12T11:52:36.168632+08:00",
        "updated_at": "2025-08-12T11:52:53.376871+08:00",
        "processed_at": "2025-08-12T11:52:53.376573+08:00",
        "error_message": "",
        "deleted_at": null
    },
    "success": true
}
```

## GET `/knowledge/batch` - 批量获取知识

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge/batch?ids=9c8af585-ae15-44ce-8f73-45ad18394651&ids=4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json'
```

**响应**:

```json
{
    "data": [
        {
            "id": "9c8af585-ae15-44ce-8f73-45ad18394651",
            "tenant_id": 1,
            "knowledge_base_id": "kb-00000001",
            "type": "url",
            "title": "",
            "description": "",
            "source": "https://github.com/Tencent/WeKnora",
            "parse_status": "pending",
            "enable_status": "disabled",
            "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
            "file_name": "",
            "file_type": "",
            "file_size": 0,
            "file_hash": "",
            "file_path": "",
            "storage_size": 0,
            "metadata": null,
            "created_at": "2025-08-12T11:55:05.709266+08:00",
            "updated_at": "2025-08-12T11:55:05.709266+08:00",
            "processed_at": null,
            "error_message": "",
            "deleted_at": null
        },
        {
            "id": "4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5",
            "tenant_id": 1,
            "knowledge_base_id": "kb-00000001",
            "type": "file",
            "title": "彗星.txt",
            "description": "彗星是由冰和尘埃构成的太阳系小天体，接近太阳时会形成彗发和彗尾。其轨道周期差异大，来源包括柯伊伯带和奥尔特云。彗星与小行星的区别逐渐模糊，部分彗星已失去挥发物质，类似小行星。截至2019年，已知彗星超6600颗，数量庞大。彗星在古代被视为凶兆，现代研究揭示其复杂结构与起源。",
            "source": "",
            "parse_status": "completed",
            "enable_status": "enabled",
            "embedding_model_id": "dff7bc94-7885-4dd1-bfd5-bd96e4df2fc3",
            "file_name": "彗星.txt",
            "file_type": "txt",
            "file_size": 7710,
            "file_hash": "d69476ddbba45223a5e97e786539952c",
            "file_path": "data/files/1/4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5/1754970756171067621.txt",
            "storage_size": 33689,
            "metadata": null,
            "created_at": "2025-08-12T11:52:36.168632+08:00",
            "updated_at": "2025-08-12T11:52:53.376871+08:00",
            "processed_at": "2025-08-12T11:52:53.376573+08:00",
            "error_message": "",
            "deleted_at": null
        }
    ],
    "success": true
}
```

## DELETE `/knowledge/:id` - 删除知识

**请求**:

```curl
curl --location --request DELETE 'http://localhost:8080/api/v1/knowledge/9c8af585-ae15-44ce-8f73-45ad18394651' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json'
```

**响应**:

```json
{
    "message": "Deleted successfully",
    "success": true
}
```

## GET `/knowledge/:id/download` - 下载知识文件

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge/4c4e7c1a-09cf-485b-a7b5-24b8cdc5acf5/download' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json'
```

**响应**:

```
attachment
```
