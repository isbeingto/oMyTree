# Docker 开箱即用运行（推荐）

> 目标：把 oMyTree（Web + API）以及 WeKnora（含 docreader / Redis / Qdrant / Postgres）打包成一个 **docker compose 工程**，在任意服务器上 `docker compose up -d` 即可跑起来。
>
> 说明：严格意义上的“单一容器同时跑 Web/API/DB/Qdrant/Redis/WeKnora”虽然能做（supervisord + 内置 DB），但不利于数据持久化、升级与排障。这里采用业界标准的 **多容器一键启动**，对你来说依然是“一个命令开箱即用”。

## 1) 前置要求

- 安装 Docker
  - 验证：`docker version`
- 可选：安装 Compose 插件（`docker compose`）
  - 验证：`docker compose version`
- 当前用户能访问 Docker：
  - 若 `docker ps` 报权限错误，使用 `sudo docker ...` 或把用户加入 `docker` 组。

## 2) 一键启动

### 方案 A：有 `docker compose`（推荐）

在仓库根目录执行：

```bash
sudo docker compose -f docker/compose.yaml up -d --build
```

### 方案 B：没有 `docker compose`（纯 docker，一条命令）

如果你的机器像本仓库当前环境一样 **没有安装 compose 插件**，直接运行：

```bash
bash scripts/docker/up.sh
```

停止并清理容器（保留数据卷）：

```bash
bash scripts/docker/down.sh
```

服务端口：
- Web: http://localhost:3000
- API: http://localhost:8000
- WeKnora: http://localhost:8081 (health: `/health`)
- Qdrant: http://localhost:6333
- Postgres: localhost:5432
- Redis: localhost:6379

## 3) 数据持久化

compose 默认创建以下 volume：
- `pgdata`：Postgres 数据
- `qdrant_storage`：Qdrant 数据
- `weknora_files`：WeKnora/docreader 本地文件存储

迁移服务器时：备份并迁移 Docker volumes 即可。

## 4) 配置与密钥（生产必配）

为了避免把密钥写死进镜像，compose 中对以下项使用 `CHANGE_ME_*` 占位：
- `NEXTAUTH_SECRET`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
- `API_KEY_ENCRYPTION_SECRET`
- `TENANT_AES_KEY` / `JWT_SECRET`（WeKnora）

生产部署时请改为真实值（可用环境变量注入、或在 `docker/compose.yaml` 里覆盖）。

## 5) 常用运维

```bash
sudo docker compose -f docker/compose.yaml ps
sudo docker compose -f docker/compose.yaml logs -f --tail=200 weknora
sudo docker compose -f docker/compose.yaml restart api web weknora docreader
sudo docker compose -f docker/compose.yaml down
```

## 6) 已知点：docreader 镜像体积

docreader 依赖较多（OCR/解析链），镜像可能比较大，首次构建时间较长。
如果你只想先跑通主站/WeKnora 健康检查，可先不启 docreader（但上传解析会不可用）。
