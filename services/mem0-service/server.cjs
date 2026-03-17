const http = require("http");
const path = require("path");
const fs = require("fs");
const { Memory } = require("mem0ai/oss");

const PORT = Number(process.env.MEM0_SERVICE_PORT || 3010);

const EMBEDDING_DIMS = {
  "BAAI/bge-m3": 1024,
  "BAAI/bge-large-zh-v1.5": 1024,
  "BAAI/bge-large-en-v1.5": 1024,
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

const LLM_BASE_URLS = {
  anthropic: undefined,
  openai: undefined,
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.cn/v1",
};

let lanceDbConn = null;
let memoriesTable = null;
let mem0 = null;
let configKey = "";
let currentDim = 1024;

const MEMORY_DIR = process.env.MEMORY_DB_PATH
  ? path.dirname(process.env.MEMORY_DB_PATH)
  : path.join(process.cwd(), "data");
const LANCEDB_DIR = path.join(MEMORY_DIR, "lancedb");
const MEM0_INTERNAL_DB_PATH = path.join(MEMORY_DIR, "mem0-internal.db");

let internalMem0Db = null;

function resetMem0Cache() {
  mem0 = null;
  configKey = "";
}

function getInternalMem0Db() {
  if (internalMem0Db) return internalMem0Db;
  const Database = require("better-sqlite3");
  internalMem0Db = new Database(MEM0_INTERNAL_DB_PATH);
  return internalMem0Db;
}

function deleteInternalMemoryByContent(masterId, content) {
  if (!fs.existsSync(MEM0_INTERNAL_DB_PATH)) return;

  const db = getInternalMem0Db();
  try {
    db.prepare(
      `DELETE FROM vectors
       WHERE json_extract(payload, '$.userId') = ?
         AND json_extract(payload, '$.data') = ?`
    ).run(masterId, content);
  } catch (err) {
    console.error("[mem0-service] deleteInternalMemoryByContent failed:", err);
  }
}

function clearInternalMemories(masterId) {
  if (!fs.existsSync(MEM0_INTERNAL_DB_PATH)) return;

  const db = getInternalMem0Db();
  try {
    if (masterId) {
      db.prepare(
        `DELETE FROM vectors
         WHERE json_extract(payload, '$.userId') = ?`
      ).run(masterId);
      db.prepare("DELETE FROM memory_migrations WHERE user_id = ?").run(masterId);
    } else {
      db.prepare("DELETE FROM vectors").run();
      db.prepare("DELETE FROM memory_migrations").run();
    }
  } catch (err) {
    console.error("[mem0-service] clearInternalMemories failed:", err);
  }
}

async function getLanceDb() {
  if (lanceDbConn) return lanceDbConn;
  const lancedb = require("@lancedb/lancedb");
  if (!fs.existsSync(LANCEDB_DIR)) fs.mkdirSync(LANCEDB_DIR, { recursive: true });
  lanceDbConn = await lancedb.connect(LANCEDB_DIR);
  return lanceDbConn;
}

async function getMemoriesTable(dim) {
  const db = await getLanceDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes("memories")) {
    if (!memoriesTable) {
      memoriesTable = await db.openTable("memories");
    }
    return memoriesTable;
  }

  memoriesTable = await db.createTable("memories", [
    {
      id: "__init__",
      master_id: "__init__",
      content: "",
      created_at: new Date().toISOString(),
      vector: new Array(dim).fill(0),
    },
  ]);
  await memoriesTable.delete('id = "__init__"');
  return memoriesTable;
}

async function saveMemory(masterId, content, embedding) {
  const table = await getMemoriesTable(embedding.length);
  const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await table.add([
    {
      id,
      master_id: masterId,
      content,
      created_at: new Date().toISOString(),
      vector: embedding,
    },
  ]);
}

async function searchMemories(masterId, queryEmbedding, topK, threshold) {
  try {
    const table = await getMemoriesTable(queryEmbedding.length);
    const results = await table
      .vectorSearch(queryEmbedding)
      .where(`master_id = '${masterId.replace(/'/g, "''")}'`)
      .limit(topK)
      .toArray();

    return results
      .filter((r) => {
        const dist = r._distance ?? Infinity;
        const sim = 1 - dist;
        return sim >= threshold;
      })
      .map((r) => ({
        content: r.content,
        similarity: 1 - (r._distance ?? 1),
        createdAt: r.created_at,
      }));
  } catch {
    return [];
  }
}

async function deleteMemoryByContent(masterId, content) {
  try {
    const table = await getMemoriesTable(currentDim);
    const escaped = content.replace(/'/g, "''");
    const mid = masterId.replace(/'/g, "''");
    await table.delete(`master_id = '${mid}' AND content = '${escaped}'`);
    deleteInternalMemoryByContent(masterId, content);
    resetMem0Cache();
  } catch (err) {
    console.error("[mem0-service] deleteMemoryByContent failed:", err);
  }
}

async function clearMemories(masterId) {
  try {
    const table = await getMemoriesTable(currentDim);
    if (masterId) {
      const mid = masterId.replace(/'/g, "''");
      await table.delete(`master_id = '${mid}'`);
      clearInternalMemories(masterId);
    } else {
      const db = await getLanceDb();
      await db.dropTable("memories");
      memoriesTable = null;
      clearInternalMemories();
    }
    resetMem0Cache();
  } catch (err) {
    console.error("[mem0-service] clearMemories failed:", err);
  }
}

async function getMemoryStats(masterId) {
  try {
    const table = await getMemoriesTable(currentDim);
    if (masterId) {
      const mid = masterId.replace(/'/g, "''");
      const rows = await table.query().where(`master_id = '${mid}'`).limit(10000).toArray();
      return { total: rows.length };
    }
    const count = await table.countRows();
    return { total: count };
  } catch (err) {
    console.error("[mem0-service] getMemoryStats error:", err);
    return { total: 0 };
  }
}

async function generateEmbedding(text, config) {
  const url = config.apiUrl.replace(/\/+$/, "") + "/embeddings";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
      encoding_format: "float",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  if (!json.data?.[0]?.embedding) {
    throw new Error("Embedding API returned no data");
  }
  return json.data[0].embedding;
}

class OpenAICompatibleEmbedder {
  constructor(config) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.embeddingDims = config.embeddingDims ?? 1024;
  }

  async embed(text) {
    return generateEmbedding(text, {
      apiUrl: this.apiUrl,
      apiKey: this.apiKey,
      model: this.model,
    });
  }

  async embedBatch(texts) {
    const url = this.apiUrl + "/embeddings";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: "float",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Embedding API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

function getMem0(cfg) {
  const nextKey = [
    cfg.llmProvider,
    cfg.llmApiKey,
    cfg.llmModel,
    cfg.embedding.apiKey,
    cfg.embedding.model,
    cfg.embedding.apiUrl,
  ].join("|");

  if (mem0 && configKey === nextKey) return mem0;

  const isAnthropic = cfg.llmProvider === "anthropic";
  const baseURL = LLM_BASE_URLS[cfg.llmProvider];
  const dim = EMBEDDING_DIMS[cfg.embedding.model] ?? 1024;
  currentDim = dim;

  mem0 = new Memory({
    version: "v1.1",
    disableHistory: true,
    llm: {
      provider: isAnthropic ? "anthropic" : "openai",
      config: {
        apiKey: cfg.llmApiKey,
        model: cfg.llmModel,
        ...(baseURL ? { baseURL } : {}),
      },
    },
    embedder: {
      provider: "openai",
      config: { apiKey: "placeholder", model: "placeholder" },
    },
    vectorStore: {
      provider: "memory",
      config: {
        collectionName: "open-master",
        dimension: dim,
        dbPath: path.join(MEMORY_DIR, "mem0-internal.db"),
      },
    },
  });

  mem0.embedder = new OpenAICompatibleEmbedder({
    apiUrl: cfg.embedding.apiUrl,
    apiKey: cfg.embedding.apiKey,
    model: cfg.embedding.model,
    embeddingDims: dim,
  });

  configKey = nextKey;
  return mem0;
}

async function addWithFilteredKnownErrors(instance, messages, config) {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const text = args.map((arg) => String(arg)).join(" ");
    if (text.includes("Error processing memory action: Error: Memory with ID undefined not found")) {
      return;
    }
    originalConsoleError(...args);
  };

  try {
    return await instance.add(messages, config);
  } finally {
    console.error = originalConsoleError;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function handleExtract(body, res) {
  const { masterId, messages, provider, model, apiKey, embeddingConfig } = body;

  if (!masterId || !Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: "masterId and messages required" });
  }

  if (
    !embeddingConfig?.enabled ||
    !embeddingConfig.apiKey ||
    !embeddingConfig.model ||
    !embeddingConfig.apiUrl
  ) {
    return sendJson(res, 200, { extracted: 0, fallback: true });
  }

  if (!apiKey || !provider || !model) {
    return sendJson(res, 400, { error: "LLM config required" });
  }

  // Long-term memory should store user facts, not assistant suggestions or hallucinations.
  const userMessages = messages
    .filter((m) => m?.role === "user" && typeof m.content === "string")
    .map((m) => ({ role: "user", content: m.content.trim() }))
    .filter((m) => m.content.length > 0);

  if (userMessages.length === 0) {
    return sendJson(res, 200, { extracted: 0, saved: 0, facts: [] });
  }

  const result = await addWithFilteredKnownErrors(
    getMem0({
      llmProvider: provider,
      llmApiKey: apiKey,
      llmModel: model,
      embedding: embeddingConfig,
    }),
    userMessages,
    { userId: masterId }
  );

  let saved = 0;
  for (const item of result.results ?? []) {
    const event = item.metadata?.event ?? item.event ?? "ADD";
    if ((event === "ADD" || event === "UPDATE") && item.memory) {
      if (event === "UPDATE" && item.metadata?.previousMemory) {
        await deleteMemoryByContent(masterId, item.metadata.previousMemory);
      }
      try {
        const embedding = await generateEmbedding(item.memory, embeddingConfig);
        await saveMemory(masterId, item.memory, embedding);
        saved++;
      } catch (error) {
        console.error("[mem0-service] save failed:", error);
      }
    }
  }

  return sendJson(res, 200, {
    extracted: result.results?.length ?? 0,
    saved,
    facts: (result.results ?? []).map((item) => item.memory),
  });
}

async function handleSearch(body, res) {
  const { masterId, query, embeddingConfig, topK = 5, threshold = 0.25 } = body;

  if (!masterId || !query) {
    return sendJson(res, 400, { error: "masterId and query required" });
  }

  if (!embeddingConfig?.enabled || !embeddingConfig.apiKey || !embeddingConfig.model || !embeddingConfig.apiUrl) {
    return sendJson(res, 200, { memories: [] });
  }

  try {
    const queryEmbedding = await generateEmbedding(query, embeddingConfig);
    const memories = await searchMemories(masterId, queryEmbedding, topK, threshold);
    return sendJson(res, 200, { memories });
  } catch (err) {
    console.error("[mem0-service] search error:", err);
    return sendJson(res, 200, { memories: [] });
  }
}

async function handleStats(body, res) {
  const masterId = body?.masterId;
  const stats = await getMemoryStats(masterId);
  return sendJson(res, 200, stats);
}

async function handleDelete(body, res) {
  const { masterId, content } = body || {};

  if (masterId && content) {
    await deleteMemoryByContent(masterId, content);
    return sendJson(res, 200, { success: true });
  }

  await clearMemories(masterId);
  return sendJson(res, 200, { success: true });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk.toString(); });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, store: "lancedb" });
    }

    if (req.method === "POST") {
      const body = await parseBody(req);
      const urlPath = req.url?.split("?")[0];

      if (urlPath === "/extract") return await handleExtract(body, res);
      if (urlPath === "/search") return await handleSearch(body, res);
      if (urlPath === "/stats") return await handleStats(body, res);
      if (urlPath === "/delete") return await handleDelete(body, res);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("[mem0-service] fatal error:", error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mem0-service] listening on ${PORT} (LanceDB: ${LANCEDB_DIR})`);
});
