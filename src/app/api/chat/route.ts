import { streamText } from 'ai';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getLanguageModel, type ProviderType } from '@/lib/ai/provider';
import { getMasterById } from '@/lib/master/registry';
import {
  addEpisode,
  importKnowledgeGraph,
  searchKnowledgeGraph,
} from '@/lib/memory/client';
import type { Master } from '@/lib/master/types';
import type { EmbeddingConfig } from '@/lib/memory/types';

interface IncomingMessage {
  role: 'user' | 'assistant' | 'system';
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

function toCoreMessages(msgs: IncomingMessage[]) {
  return msgs.map((m) => ({
    role: m.role,
    content:
      m.content ??
      m.parts
        ?.filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text!)
        .join('') ??
      '',
  }));
}

function isEmbeddingReady(cfg?: EmbeddingConfig): cfg is EmbeddingConfig {
  return !!cfg && cfg.enabled && !!cfg.apiKey && !!cfg.model && !!cfg.apiUrl;
}

const MEM0_SERVICE_URL =
  process.env.MEM0_SERVICE_URL || 'http://127.0.0.1:3010';
const GRAPHITI_SEARCH_TIMEOUT_MS = 4000;
const knowledgeWarmupStatus = new Map<string, 'warming' | 'ready'>();

function getAppDataDir() {
  return (
    process.env.OPEN_MASTER_DATA_DIR ||
    path.join(os.homedir(), 'Library', 'Application Support', 'open-master')
  );
}

function getCustomKnowledgeMarkerPath(masterId: string) {
  return path.join(getAppDataDir(), 'graphiti', 'custom-knowledge', `${masterId}.json`);
}

function getKnowledgeHash(knowledgeBase: string) {
  return crypto.createHash('sha256').update(knowledgeBase).digest('hex');
}

async function getImportedKnowledgeHash(masterId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(getCustomKnowledgeMarkerPath(masterId), 'utf8');
    const data = JSON.parse(raw) as { hash?: string };
    return typeof data.hash === 'string' ? data.hash : null;
  } catch {
    return null;
  }
}

async function markKnowledgeImported(masterId: string, hash: string) {
  const markerPath = getCustomKnowledgeMarkerPath(masterId);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(
    markerPath,
    JSON.stringify({ hash, importedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function warmKnowledgeImport(
  master: Master,
  llmConfig: {
    provider: string;
    model: string;
    apiKey: string;
    apiUrl?: string;
  },
  embeddingConfig: {
    provider: string;
    model: string;
    apiKey: string;
    apiUrl: string;
  }
) {
  if (!master.isSystem) return;
  if (knowledgeWarmupStatus.has(master.id)) return;

  knowledgeWarmupStatus.set(master.id, 'warming');

  void importKnowledgeGraph(llmConfig, embeddingConfig, master.id)
    .then((result) => {
      const imported = result.imported ?? {};
      if (Object.prototype.hasOwnProperty.call(imported, master.id)) {
        knowledgeWarmupStatus.set(master.id, 'ready');
      } else {
        knowledgeWarmupStatus.delete(master.id);
      }
    })
    .catch((err) => {
      console.error('[graphiti] background import failed:', err);
      knowledgeWarmupStatus.delete(master.id);
    });
}

async function ensureCustomKnowledgeImported(
  master: Master,
  llmConfig: {
    provider: string;
    model: string;
    apiKey: string;
    apiUrl?: string;
  },
  embeddingConfig: {
    provider: string;
    model: string;
    apiKey: string;
    apiUrl: string;
  }
) {
  if (master.isSystem || !master.knowledgeBase.trim()) return;

  const knowledgeHash = getKnowledgeHash(master.knowledgeBase.trim());
  const statusKey = `${master.id}:${knowledgeHash}`;

  if (knowledgeWarmupStatus.get(statusKey) === 'ready') return;
  if (knowledgeWarmupStatus.get(statusKey) === 'warming') return;

  const importedHash = await getImportedKnowledgeHash(master.id);
  if (importedHash === knowledgeHash) {
    knowledgeWarmupStatus.set(statusKey, 'ready');
    return;
  }

  knowledgeWarmupStatus.set(statusKey, 'warming');

  try {
    const content = `角色：${master.name}\n头衔：${master.title}\n\n${master.knowledgeBase.trim()}`;
    const result = await addEpisode(
      master.id,
      content,
      llmConfig,
      embeddingConfig,
      `${master.name}-knowledge`,
      'custom_knowledge_base'
    );

    if (result.status === 'ok') {
      await markKnowledgeImported(master.id, knowledgeHash);
      knowledgeWarmupStatus.set(statusKey, 'ready');
      return;
    }
  } catch (err) {
    console.error('[graphiti] custom knowledge import failed:', err);
  }

  knowledgeWarmupStatus.delete(statusKey);
}

export async function POST(req: Request) {
  const { messages, masterId, provider, model, apiKey, customMasters, embeddingConfig } =
    await req.json();

  if (!apiKey) {
    return new Response('API key is required. Configure it in Settings.', {
      status: 401,
    });
  }

  const master = getMasterById(masterId, customMasters as Master[] | undefined);
  if (!master) {
    return new Response(`Master "${masterId}" not found`, { status: 404 });
  }

  const coreMessages = toCoreMessages(messages);
  const lastUserMessage = coreMessages.findLast((m) => m.role === 'user');
  const userText = (lastUserMessage?.content as string) ?? '';

  let systemPrompt = master.systemPrompt;

  if (master.knowledgeBase) {
    systemPrompt += `\n\n## 知识库\n${master.knowledgeBase}`;
  }

  // --- Memory retrieval via mem0-service (LanceDB) ---
  const embCfg = embeddingConfig as EmbeddingConfig | undefined;
  if (userText && isEmbeddingReady(embCfg)) {
    try {
      const searchRes = await fetch(`${MEM0_SERVICE_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterId,
          query: userText,
          embeddingConfig: embCfg,
          topK: 5,
          threshold: 0.25,
        }),
        cache: 'no-store',
      });

      if (searchRes.ok) {
        const { memories } = (await searchRes.json()) as {
          memories: { content: string; createdAt: string; similarity: number }[];
        };
        if (memories && memories.length > 0) {
          const memoryLines = memories
            .map((m) => `- [${m.createdAt}] ${m.content}`)
            .join('\n');
          systemPrompt += `\n\n## 对话记忆\n以下是与用户相关的记忆，请在回答时适当参考：\n${memoryLines}`;
        }
      }
    } catch (err) {
      console.error('[memory] search failed:', err);
    }
  }

  // --- Knowledge graph via Graphiti + Kuzu ---
  if (userText && isEmbeddingReady(embCfg)) {
    try {
      const LLM_BASE_URLS: Record<string, string> = {
        openai: 'https://api.openai.com/v1',
        openrouter: 'https://openrouter.ai/api/v1',
        deepseek: 'https://api.deepseek.com/v1',
        kimi: 'https://api.moonshot.cn/v1',
      };
      const llmConfig = { provider, model, apiKey, apiUrl: LLM_BASE_URLS[provider] };
      const graphEmbeddingConfig = {
        provider: embCfg!.provider,
        model: embCfg!.model,
        apiKey: embCfg!.apiKey,
        apiUrl: embCfg!.apiUrl,
      };

      if (master.isSystem) {
        // 系统知识包在后台预热，避免首次聊天被导入过程阻塞。
        warmKnowledgeImport(master, llmConfig, graphEmbeddingConfig);
      } else {
        await ensureCustomKnowledgeImported(master, llmConfig, graphEmbeddingConfig);
      }

      const graphResult = await withTimeout(
        searchKnowledgeGraph(
          masterId,
          userText,
          llmConfig,
          graphEmbeddingConfig,
          5
        ),
        GRAPHITI_SEARCH_TIMEOUT_MS
      );

      if (graphResult === null) {
        console.warn('[graphiti] search timed out, skipping this turn');
      } else if (graphResult.edges.length > 0) {
        const facts = graphResult.edges
          .map((e) => {
            let line = `- ${e.fact}`;
            if (e.validAt) line += ` (${e.validAt})`;
            return line;
          })
          .join('\n');
        systemPrompt += `\n\n## 相关知识（来自知识图谱）\n${facts}`;
      }
    } catch (err) {
      console.error('[graphiti] knowledge search failed:', err);
    }
  }

  const languageModel = getLanguageModel(
    provider as ProviderType,
    model,
    apiKey
  );

  try {
    const result = streamText({
      model: languageModel,
      system: systemPrompt,
      messages: coreMessages,
      maxOutputTokens: 2048,
    });

    return result.toTextStreamResponse();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown error occurred';
    return new Response(message, { status: 500 });
  }
}
