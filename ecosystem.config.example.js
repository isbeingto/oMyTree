/**
 * PM2 Ecosystem Configuration (Example / Template)
 *
 * Copy this file to `ecosystem.config.js` and fill in your own values.
 *   cp ecosystem.config.example.js ecosystem.config.js
 *
 * NEVER commit ecosystem.config.js — it contains real secrets.
 */
module.exports = {
  apps: [
    {
      name: "omytree-api",
      cwd: "/srv/oMyTree/api",
      script: "index.js",
      // === 零停机热更新配置 ===
      instances: 2,              // 运行 2 个实例实现零停机
      exec_mode: "cluster",      // 集群模式
      wait_ready: true,          // 等待应用发送 ready 信号
      listen_timeout: 10000,     // 等待监听的超时时间 (10s)
      kill_timeout: 5000,        // 优雅关闭的等待时间 (5s)
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8000",

        // === Signed knowledge download URLs (iframe-friendly auth) ===
        KNOWLEDGE_DOWNLOAD_TOKEN_SECRET: "CHANGE_ME_random_secret_string",

        // === WeKnora Knowledge Service (OMK) ===
        WEKNORA_BASE_URL: "http://127.0.0.1:8081",
        WEKNORA_API_KEY: "CHANGE_ME_weknora_api_key",
        WEKNORA_TENANT_ID: "1",
        WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK: "true",

        // === iOS App OAuth ===
        GOOGLE_IOS_CLIENT_ID: "",

        // === LLM Provider 核心变量 ===
        OPENAI_API_KEY: "sk-CHANGE_ME_your_openai_api_key",
        LLM_MODEL: "gpt-4",
        LLM_REQUEST_TIMEOUT_MS: "600000",

        // === P1: Semantic Selection / Embeddings ===
        RECENT_DIALOGUE_SEMANTIC_ENABLED: "1",
        SEMANTIC_CORE_FACTS_ENABLED: "0",
        SEMANTIC_MIN_QUERY_LENGTH: "3",
        SEMANTIC_SCORE_WEIGHT: "0.8",
        SEMANTIC_NEIGHBOR_EXPAND_ENABLED: "1",
        SEMANTIC_NEIGHBOR_EXPAND: "1",

        EMBEDDING_ENABLED: "1",
        EMBEDDING_PROVIDER: "mock", // "mock" | "openai"
        EMBEDDING_MODEL: "text-embedding-3-small",
        EMBEDDING_DIM: "64",
        EMBEDDING_OPENAI_TIMEOUT_MS: "15000",

        EMBEDDING_CACHE_MAX_SIZE: "500",
        EMBEDDING_CACHE_TTL_MS: "3600000",

        // === P2: Branch Summary / Cross-branch ===
        BRANCH_SUMMARY_ENABLED: "1",
        BRANCH_SUMMARY_MIN_TURNS: "5",
        BRANCH_SUMMARY_UPDATE_THRESHOLD: "5",
        BRANCH_SUMMARY_LLM_MODEL: "gpt-4o-mini",
        CROSS_BRANCH_SIMILARITY_THRESHOLD: "0.65",
        CROSS_BRANCH_MAX_REFERENCES: "2",

        PROMPT_CACHING_ENABLED: "1",
        PROMPT_CACHE_MIN_TOKENS: "1024",
        PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN: "5",
        PROMPT_CACHE_ENABLE_METRICS: "1",

        // PostgreSQL
        TREE_ADAPTER: "pg",
        PG_DSN: "postgres://omytree:CHANGE_ME_db_password@127.0.0.1:5432/omytree?sslmode=disable",

        PGUSER: "omytree",
        PGPASSWORD: "CHANGE_ME_db_password",
        PGHOST: "127.0.0.1",
        PGPORT: "5432",
        PGDATABASE: "omytree",
        PGSSLMODE: "disable",
        PGCONNECT_TIMEOUT: "2",
        PGPOOL_MAX: "40",
        PGPOOL_IDLE_TIMEOUT_MS: "30000",
        PGPOOL_CONNECTION_TIMEOUT_MS: "10000",
        PG_TREE_ADAPTER_POOL_MAX: "10",
        ENABLE_LEGACY_BRANCH_API: "true",
        ENABLE_LEGACY_EVENT_REPLAY_API: "true",
        OMYTREE_MAX_DEPTH: "12",
        OMYTREE_MAX_CHILDREN_PER_NODE: "20",

        ACCEPT_DEV_ENDPOINTS: "0",

        // === Mail Transport ===
        MAIL_PROVIDER: "log",   // "log" | "smtp"
        APP_PUBLIC_URL: "https://your-domain.com",

        // SMTP 配置（当 MAIL_PROVIDER=smtp 时使用）
        MAIL_SMTP_HOST: "smtp.example.com",
        MAIL_SMTP_PORT: "465",
        MAIL_SMTP_SECURE: "true",
        MAIL_SMTP_USER: "your-email@example.com",
        MAIL_SMTP_PASS: "CHANGE_ME_smtp_password",

        MAIL_FROM_ADDRESS: "noreply@your-domain.com",
        MAIL_FROM_NAME: "oMyTree",

        // === reCAPTCHA v3 ===
        RECAPTCHA_SECRET_KEY: "CHANGE_ME_recaptcha_secret",

        // === PayPal Complete Payments ===
        PAYPAL_MODE: "sandbox",
        PAYPAL_CLIENT_ID: "CHANGE_ME_paypal_client_id",
        PAYPAL_CLIENT_SECRET: "CHANGE_ME_paypal_client_secret",
        PAYPAL_WEBHOOK_ID: "",

        // === API Key 加密密钥 (BYOK) ===
        API_KEY_ENCRYPTION_SECRET: "CHANGE_ME_generate_with_openssl_rand_base64_32",
      }
    },
    {
      name: "omytree-web",
      cwd: "/srv/oMyTree/web",
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3000",
      // === 零停机热更新配置 ===
      instances: 2,
      exec_mode: "cluster",
      listen_timeout: 15000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",

        // === API Proxy ===
        API_PROXY_TARGET: "http://127.0.0.1:8000",

        // === NextAuth ===
        NEXTAUTH_URL: "https://your-domain.com",
        NEXT_PUBLIC_SITE_URL: "https://your-domain.com",
        AUTH_TRUST_HOST: "true",
        NEXTAUTH_SECRET: "CHANGE_ME_generate_with_openssl_rand_base64_32",

        // === reCAPTCHA ===
        NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "CHANGE_ME_recaptcha_site_key",
        RECAPTCHA_SECRET_KEY: "CHANGE_ME_recaptcha_secret",

        RECAPTCHA_PROJECT_ID: "CHANGE_ME_gcloud_project_id",
        RECAPTCHA_API_KEY: "CHANGE_ME_gcloud_api_key",

        // === Google OAuth 2.0 ===
        GOOGLE_CLIENT_ID: "CHANGE_ME_google_client_id.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "CHANGE_ME_google_client_secret",

        // === Database ===
        DATABASE_URL: "postgres://omytree:CHANGE_ME_db_password@127.0.0.1:5432/omytree?sslmode=disable",
        PG_DSN: "postgres://omytree:CHANGE_ME_db_password@127.0.0.1:5432/omytree?sslmode=disable",

        // === Server Actions Encryption Key ===
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "CHANGE_ME_generate_with_openssl_rand_base64_32"
      }
    },

    // ========== WeKnora Knowledge Service (OMK) ==========
    {
      name: "omytree-weknora",
      cwd: "/srv/oMyTree/services/weknora",
      script: "/srv/oMyTree/services/weknora/scripts/run_weknora.sh",
      interpreter: "bash",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        GIN_MODE: "release",
        DISABLE_REGISTRATION: "true",

        SERVER_HOST: "127.0.0.1",
        SERVER_PORT: "8081",

        // Database (dedicated DB)
        DB_DRIVER: "postgres",
        DB_HOST: "127.0.0.1",
        DB_PORT: "5432",
        DB_USER: "omytree",
        DB_PASSWORD: "CHANGE_ME_db_password",
        DB_NAME: "omytree_weknora",

        // Retrieval backend (Qdrant only)
        RETRIEVE_DRIVER: "qdrant",
        EMBEDDING_MIGRATION_POLICY: "qdrant_only",
        QDRANT_HOST: "127.0.0.1",
        QDRANT_PORT: "6334",
        QDRANT_COLLECTION: "omytree_kb",
        QDRANT_USE_TLS: "false",
        DB_MAX_OPEN_CONNS: "20",
        DB_MAX_IDLE_CONNS: "10",
        DB_CONN_MAX_LIFETIME_MINUTES: "10",
        DB_CONN_MAX_IDLE_TIME_MINUTES: "5",

        // DocReader
        DOCREADER_ADDR: "127.0.0.1:50051",

        // Storage
        STORAGE_TYPE: "local",
        LOCAL_STORAGE_BASE_DIR: "/srv/oMyTree/data/weknora/files",

        // Stream manager
        STREAM_MANAGER_TYPE: "memory",

        // Redis
        REDIS_ADDR: "127.0.0.1:6379",
        REDIS_PASSWORD: "",
        REDIS_DB: "0",

        // Concurrency
        CONCURRENCY_POOL_SIZE: "3",
        ASYNQ_CONCURRENCY: "1",

        // Feature flags
        ENABLE_GRAPH_RAG: "false",
        AUTO_MIGRATE: "true",
        AUTO_RECOVER_DIRTY: "true",

        // Security
        TENANT_AES_KEY: "CHANGE_ME_generate_with_openssl_rand_hex_32",
        JWT_SECRET: "CHANGE_ME_generate_with_openssl_rand_hex_32",

        // LLM Provider
        OPENAI_API_KEY: "sk-CHANGE_ME_your_openai_api_key"
      },
      error_file: "/srv/oMyTree/logs/weknora-error.log",
      out_file: "/srv/oMyTree/logs/weknora-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      restart_delay: 1000
    },

    {
      name: "omytree-docreader",
      cwd: "/srv/oMyTree/services/weknora",
      script: "/home/azureuser/.local/bin/uv",
      args: "--project /srv/oMyTree/services/weknora/docreader --directory /srv/oMyTree/services/weknora run -m docreader.main",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "350M",
      env: {
        PYTHONPATH: "/srv/oMyTree/services/weknora/docreader/proto:/srv/oMyTree/services/weknora",
        DOCREADER_GRPC_PORT: "50051",
        DOCREADER_GRPC_MAX_WORKERS: "1",
        DOCREADER_OCR_BACKEND: "paddle",
        DOCREADER_OCR_ISOLATE_PROCESS: "1",

        // ========== OCR 模型选择 ==========
        // "mobile" = 轻量级，内存占用低 (~200-400MB)，精度中等
        // "server" = 高精度，内存占用高 (~800MB-1.5GB)，推荐16GB+内存服务器
        DOCREADER_PADDLE_OCR_MODEL_SIZE: "mobile",

        // ========== OCR 队列配置 ==========
        DOCREADER_OCR_QUEUE_ENABLED: "1",
        DOCREADER_OCR_QUEUE_SIZE: "10",
        DOCREADER_OCR_TASK_TIMEOUT: "120",

        DOCREADER_OCR_WORKER_MAX_TASKS: "20",
        DOCREADER_OCR_WORKER_TIMEOUT_S: "90",
        DOCREADER_OCR_WORKER_START_METHOD: "spawn",
        OMP_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
        OPENBLAS_NUM_THREADS: "1",
        NUMEXPR_NUM_THREADS: "1",
        DOCREADER_IMAGE_MAX_PIXELS: "8000000",
        DOCREADER_IMAGE_MAX_SIZE: "1280",
        DOCREADER_PDF_OCR_MIN_TEXT_CHARS: "200",
        DOCREADER_PDF_OCR_MIN_UNIQUE_RATIO: "0.12",
        DOCREADER_PDF_OCR_MAX_PAGES: "20",
        DOCREADER_PDF_OCR_RENDER_SCALE: "1.2",
        DOCREADER_STORAGE_TYPE: "local",
        DOCREADER_LOCAL_STORAGE_BASE_DIR: "/srv/oMyTree/data/weknora/files",
        STORAGE_TYPE: "local",
        LOCAL_STORAGE_BASE_DIR: "/srv/oMyTree/data/weknora/files",
        PYTHONUNBUFFERED: "1",
        DOCREADER_MEMORY_GC_ENABLED: "1",
        DOCREADER_MEMORY_GC_THRESHOLD_MB: "200",
        DOCREADER_MEMORY_GC_MIN_INTERVAL_S: "5",
        DOCREADER_MEMORY_MALLOC_TRIM: "1",
        DOCREADER_PADDLE_OCR_DET_SIDE_LEN: "640"
      },
      error_file: "/srv/oMyTree/logs/docreader-error.log",
      out_file: "/srv/oMyTree/logs/docreader-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 20,
      restart_delay: 3000,
      autorestart: true,
      min_uptime: "30s"
    }
  ]
};
