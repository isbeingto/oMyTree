import http from "node:http";

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(null);
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function writeJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function writeBytes(res, status, body, { contentType = "application/octet-stream", contentDisposition = "inline" } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""), "utf8");
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.setHeader("content-length", String(buf.length));
  res.setHeader("content-disposition", contentDisposition);
  res.end(buf);
}

function getApiKey(req) {
  const header = req.headers["x-api-key"];
  if (Array.isArray(header)) return header[0] || "";
  return typeof header === "string" ? header : "";
}

function ensureTenant(store, apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return null;
  if (!store.has(key)) {
    store.set(key, { seq: 0, bases: new Map() });
  }
  return store.get(key);
}

export async function startWeknoraStubServer() {
  const tenants = new Map(); // apiKey -> { seq, docSeq, bases: Map<id, base>, docs: Map<docId, doc> }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const apiKey = getApiKey(req);
    const tenant = ensureTenant(tenants, apiKey);

    if (!tenant) {
      return writeJson(res, 401, { code: "unauthorized", message: "missing X-API-Key" });
    }

    // WeKnora-compatible prefix
    if (!url.pathname.startsWith("/api/v1")) {
      return writeJson(res, 404, { code: "not_found", message: "not found" });
    }

    // Ensure tenant fields
    if (typeof tenant.docSeq !== "number") tenant.docSeq = 0;
    if (!tenant.docs) tenant.docs = new Map();

    // POST /api/v1/knowledge-bases
    if (req.method === "POST" && url.pathname === "/api/v1/knowledge-bases") {
      const body = await readJsonBody(req);
      tenant.seq += 1;
      const id = String(tenant.seq);
      const now = new Date().toISOString();
      const base = {
        id,
        name: typeof body?.name === "string" ? body.name : `kb-${id}`,
        created_at: now,
        updated_at: now,
        // stub metadata for debugging
        _tenant_key: apiKey,
      };
      tenant.bases.set(id, base);
      return writeJson(res, 201, { data: base });
    }

    // GET /api/v1/knowledge-bases
    if (req.method === "GET" && url.pathname === "/api/v1/knowledge-bases") {
      const list = Array.from(tenant.bases.values()).map((b) => ({ ...b }));
      return writeJson(res, 200, { data: list });
    }

    // GET /api/v1/knowledge-bases/:id
    const getBaseMatch = url.pathname.match(/^\/api\/v1\/knowledge-bases\/([^/]+)$/);
    if (req.method === "GET" && getBaseMatch) {
      const kbId = decodeURIComponent(getBaseMatch[1]);
      const kb = tenant.bases.get(kbId);
      if (!kb) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge base not found" });
      }
      return writeJson(res, 200, { data: { ...kb } });
    }

    // PUT /api/v1/knowledge-bases/:id
    const putBaseMatch = url.pathname.match(/^\/api\/v1\/knowledge-bases\/([^/]+)$/);
    if (req.method === "PUT" && putBaseMatch) {
      const kbId = decodeURIComponent(putBaseMatch[1]);
      const kb = tenant.bases.get(kbId);
      if (!kb) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge base not found" });
      }
      const body = await readJsonBody(req);
      if (typeof body?.name === "string" && body.name.trim()) {
        kb.name = body.name.trim();
      }
      kb.updated_at = new Date().toISOString();
      tenant.bases.set(kbId, kb);
      return writeJson(res, 200, { data: { ...kb } });
    }

    // DELETE /api/v1/knowledge-bases/:id
    const deleteBaseMatch = url.pathname.match(/^\/api\/v1\/knowledge-bases\/([^/]+)$/);
    if (req.method === "DELETE" && deleteBaseMatch) {
      const kbId = decodeURIComponent(deleteBaseMatch[1]);
      const kb = tenant.bases.get(kbId);
      if (!kb) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge base not found" });
      }
      tenant.bases.delete(kbId);
      const docIds = Array.isArray(kb._doc_ids) ? kb._doc_ids : [];
      for (const docId of docIds) {
        tenant.docs.delete(docId);
      }
      return writeJson(res, 200, { data: { ok: true } });
    }

    // POST /api/v1/knowledge-bases/:id/knowledge/file (multipart upload)
    const uploadMatch = url.pathname.match(/^\/api\/v1\/knowledge-bases\/([^/]+)\/knowledge\/file$/);
    if (req.method === "POST" && uploadMatch) {
      const kbId = decodeURIComponent(uploadMatch[1]);
      const kb = tenant.bases.get(kbId);
      if (!kb) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge base not found" });
      }

      const raw = await readRawBody(req); // do not parse multipart
      tenant.docSeq += 1;
      const id = `doc-${kbId}-${tenant.docSeq}`;
      const now = new Date().toISOString();
      const doc = {
        id,
        knowledge_base_id: kbId,
        file_name: `stub-${tenant.docSeq}.bin`,
        title: `Stub Doc ${tenant.docSeq}`,
        parse_status: "completed",
        created_at: now,
        updated_at: now,
        _tenant_key: apiKey,
        _raw_len: raw.length,
      };
      tenant.docs.set(id, doc);
      if (!kb._doc_ids) kb._doc_ids = [];
      kb._doc_ids.push(id);

      return writeJson(res, 201, { data: doc });
    }

    // GET /api/v1/knowledge-bases/:id/knowledge (list docs)
    const listDocsMatch = url.pathname.match(/^\/api\/v1\/knowledge-bases\/([^/]+)\/knowledge$/);
    if (req.method === "GET" && listDocsMatch) {
      const kbId = decodeURIComponent(listDocsMatch[1]);
      const kb = tenant.bases.get(kbId);
      if (!kb) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge base not found" });
      }
      const docIds = Array.isArray(kb._doc_ids) ? kb._doc_ids : [];
      const docs = docIds.map((id) => tenant.docs.get(id)).filter(Boolean);
      return writeJson(res, 200, { data: docs });
    }

    // GET /api/v1/knowledge/:id (get doc metadata)
    const getDocMatch = url.pathname.match(/^\/api\/v1\/knowledge\/([^/]+)$/);
    if (req.method === "GET" && getDocMatch) {
      const docId = decodeURIComponent(getDocMatch[1]);
      const doc = tenant.docs.get(docId);
      if (!doc) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge not found" });
      }
      return writeJson(res, 200, { data: doc });
    }

    // GET /api/v1/knowledge/:id/download (download)
    const downloadMatch = url.pathname.match(/^\/api\/v1\/knowledge\/([^/]+)\/download$/);
    if (req.method === "GET" && downloadMatch) {
      const docId = decodeURIComponent(downloadMatch[1]);
      const doc = tenant.docs.get(docId);
      if (!doc) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge not found" });
      }
      const payload = `weknora-stub tenant=${apiKey} doc=${docId}`;
      return writeBytes(res, 200, payload, {
        contentType: "application/octet-stream",
        contentDisposition: `inline; filename="${doc.file_name || "document"}"`,
      });
    }

    // DELETE /api/v1/knowledge/:id (delete)
    const deleteDocMatch = url.pathname.match(/^\/api\/v1\/knowledge\/([^/]+)$/);
    if (req.method === "DELETE" && deleteDocMatch) {
      const docId = decodeURIComponent(deleteDocMatch[1]);
      const doc = tenant.docs.get(docId);
      if (!doc) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge not found" });
      }
      tenant.docs.delete(docId);
      const kb = tenant.bases.get(doc.knowledge_base_id);
      if (kb && Array.isArray(kb._doc_ids)) {
        kb._doc_ids = kb._doc_ids.filter((id) => id !== docId);
      }
      return writeJson(res, 200, { data: { ok: true } });
    }

    // GET /api/v1/chunks/:docId (minimal stub)
    const chunksMatch = url.pathname.match(/^\/api\/v1\/chunks\/([^/]+)$/);
    if (req.method === "GET" && chunksMatch) {
      const docId = decodeURIComponent(chunksMatch[1]);
      const doc = tenant.docs.get(docId);
      if (!doc) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge not found" });
      }
      const page = Number.parseInt(url.searchParams.get("page") || "1", 10);
      const pageSize = Number.parseInt(url.searchParams.get("page_size") || "25", 10);
      const items = [
        {
          id: `chunk-${docId}-1`,
          content: `tenant=${apiKey} doc=${docId} chunk=1`,
        },
      ];
      return writeJson(res, 200, { data: items, total: items.length, page, page_size: pageSize });
    }

    // GET /api/v1/knowledge-bases/:id/hybrid-search  (accept JSON body even for GET)
    const hybridMatch = url.pathname.match(/^\/api\/v1\/knowledge-bases\/([^/]+)\/hybrid-search$/);
    if (req.method === "GET" && hybridMatch) {
      const kbId = decodeURIComponent(hybridMatch[1]);
      const kb = tenant.bases.get(kbId);
      if (!kb) {
        return writeJson(res, 404, { code: "not_found", message: "knowledge base not found" });
      }
      const body = await readJsonBody(req);
      const q = typeof body?.query_text === "string" ? body.query_text : "";
      const n = typeof body?.match_count === "number" ? body.match_count : 5;
      const results = Array.from({ length: Math.min(Math.max(n, 1), 5) }, (_v, idx) => ({
        score: 0.9 - idx * 0.01,
        content: `tenant=${apiKey} kb=${kbId} q=${q} #${idx + 1}`,
        knowledge_id: `doc-${kbId}-${idx + 1}`,
        knowledge_title: `Doc ${idx + 1}`,
      }));
      return writeJson(res, 200, { data: results });
    }

    return writeJson(res, 404, { code: "not_found", message: "not found" });
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", (err) => reject(err));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
