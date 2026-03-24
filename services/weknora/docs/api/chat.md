# 聊天功能 API

[返回目录](./README.md)

| 方法 | 路径                          | 描述                     |
| ---- | ----------------------------- | ------------------------ |
| POST | `/knowledge-chat/:session_id` | 基于知识库的问答         |
| POST | `/agent-chat/:session_id`     | 基于 Agent 的智能问答    |
| POST | `/knowledge-search`           | 基于知识库的搜索知识     |

## POST `/knowledge-chat/:session_id` - 基于知识库的问答

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/knowledge-chat/ceb9babb-1e30-41d7-817d-fd584954304b' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "query": "彗尾的形状"
}'
```

**响应格式**:
服务器端事件流（Server-Sent Events，Content-Type: text/event-stream）

**响应**:

```
event: message
data: {"id":"3475c004-0ada-4306-9d30-d7f5efce50d2","response_type":"references","content":"","done":false,"knowledge_references":[{"id":"c8347bef-127f-4a22-b962-edf5a75386ec","content":"彗星xxx。","knowledge_id":"a6790b93-4700-4676-bd48-0d4804e1456b","chunk_index":0,"knowledge_title":"彗星.txt","start_at":0,"end_at":2760,"seq":0,"score":4.038836479187012,"match_type":3,"sub_chunk_id":["688821f0-40bf-428e-8cb6-541531ebeb76","c1e9903e-2b4d-4281-be15-0149288d45c2","7d955251-3f79-4fd5-a6aa-02f81e044091"],"metadata":{},"chunk_type":"text","parent_chunk_id":"","image_info":"","knowledge_filename":"彗星.txt","knowledge_source":""},{"id":"fa3aadee-cadb-4a84-9941-c839edc3e626","content":"# 文档名称\n彗星.txt\n\n# 摘要\n彗星是由冰和尘埃构成的太阳系小天体，接近太阳时会释放气体形成彗发和彗尾。其轨道周期差异大，来源包括柯伊伯带和奥尔特云。彗星与小行星的区别逐渐模糊，部分彗星已失去挥发物质，类似小行星。目前已知彗星数量众多，且存在系外彗星。彗星在古代被视为凶兆，现代研究揭示其复杂结构与起源。","knowledge_id":"a6790b93-4700-4676-bd48-0d4804e1456b","chunk_index":6,"knowledge_title":"彗星.txt","start_at":0,"end_at":0,"seq":6,"score":0.6131043121858466,"match_type":3,"sub_chunk_id":null,"metadata":{},"chunk_type":"summary","parent_chunk_id":"c8347bef-127f-4a22-b962-edf5a75386ec","image_info":"","knowledge_filename":"彗星.txt","knowledge_source":""}]}

event: message
data: {"id":"3475c004-0ada-4306-9d30-d7f5efce50d2","response_type":"answer","content":"表现为","done":false,"knowledge_references":null}

event: message
data: {"id":"3475c004-0ada-4306-9d30-d7f5efce50d2","response_type":"answer","content":"结构","done":false,"knowledge_references":null}

event: message
data: {"id":"3475c004-0ada-4306-9d30-d7f5efce50d2","response_type":"answer","content":"。","done":false,"knowledge_references":null}

event: message
data: {"id":"3475c004-0ada-4306-9d30-d7f5efce50d2","response_type":"answer","content":"","done":true,"knowledge_references":null}
```

## POST `/agent-chat/:session_id` - 基于 Agent 的智能问答

Agent 模式支持更智能的问答，包括工具调用、网络搜索、多知识库检索等能力。

**请求参数**：
- `query`: 查询文本（必填）
- `knowledge_base_ids`: 知识库 ID 数组，可动态指定本次查询使用的知识库（可选）
- `knowledge_ids`: 知识文件 ID 数组，可动态指定本次查询使用的具体知识文件（可选）
- `agent_enabled`: 是否启用 Agent 模式（可选，默认 false）
- `agent_id`: 自定义 Agent ID，指定使用的自定义智能体（可选）
- `web_search_enabled`: 是否启用网络搜索（可选，默认 false）
- `summary_model_id`: 覆盖会话默认的摘要模型 ID（可选）
- `mentioned_items`: @提及的知识库和文件列表（可选）
- `disable_title`: 是否禁用自动标题生成（可选，默认 false）
- `mcp_service_ids`: MCP 服务白名单（可选，已废弃）

**请求**:

```curl
curl --location 'http://localhost:8080/api/v1/agent-chat/ceb9babb-1e30-41d7-817d-fd584954304b' \
--header 'X-API-Key: sk-vQHV2NZI_LK5W7wHQvH3yGYExX8YnhaHwZipUYbiZKCYJbBQ' \
--header 'Content-Type: application/json' \
--data '{
    "query": "帮我查询今天的天气",
    "agent_enabled": true,
    "web_search_enabled": true,
    "knowledge_base_ids": ["kb-00000001"],
    "agent_id": "agent-001",
    "mentioned_items": [
        {
            "id": "kb-00000001",
            "name": "天气知识库",
            "type": "kb",
            "kb_type": "document"
        }
    ]
}'
```

**响应格式**:
服务器端事件流（Server-Sent Events，Content-Type: text/event-stream）

**响应类型说明**：

| response_type | 描述 |
|---------------|------|
| `thinking` | Agent 思考过程 |
| `tool_call` | 工具调用信息 |
| `tool_result` | 工具调用结果 |
| `references` | 知识库检索引用 |
| `answer` | 最终回答内容 |
| `reflection` | Agent 反思内容 |
| `error` | 错误信息 |

**响应示例**:

```
event: message
data: {"id":"agent-001","response_type":"thinking","content":"用户想查询天气，我需要使用网络搜索工具...","done":false,"knowledge_references":null}

event: message
data: {"id":"agent-001","response_type":"tool_call","content":"","done":false,"knowledge_references":null,"data":{"tool_name":"web_search","arguments":{"query":"今天天气"}}}

event: message
data: {"id":"agent-001","response_type":"tool_result","content":"搜索结果：今天晴，气温25°C...","done":false,"knowledge_references":null}

event: message
data: {"id":"agent-001","response_type":"answer","content":"根据查询结果，今天天气晴朗，气温约25°C。","done":false,"knowledge_references":null}

event: message
data: {"id":"agent-001","response_type":"answer","content":"","done":true,"knowledge_references":null}
```
