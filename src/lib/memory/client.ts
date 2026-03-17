const MEMORY_ENGINE_URL = process.env.MEMORY_ENGINE_URL || 'http://localhost:8000';

export interface GraphitiEdge {
  uuid: string;
  fact: string;
  validAt?: string | null;
  invalidAt?: string | null;
  sourceNodeName?: string | null;
  targetNodeName?: string | null;
}

export interface GraphitiSearchResult {
  edges: GraphitiEdge[];
}

export interface GraphResult {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relation: string;
  }>;
}

export interface LLMConfigPayload {
  provider: string;
  model: string;
  apiKey: string;
  apiUrl?: string;
}

export interface EmbeddingConfigPayload {
  provider: string;
  model: string;
  apiKey: string;
  apiUrl: string;
}

export async function searchKnowledgeGraph(
  masterId: string,
  query: string,
  llmConfig: LLMConfigPayload,
  embeddingConfig: EmbeddingConfigPayload,
  numResults = 5
): Promise<GraphitiSearchResult> {
  try {
    const res = await fetch(`${MEMORY_ENGINE_URL}/graphiti/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterId,
        query,
        numResults,
        llmConfig,
        embeddingConfig,
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('[graphiti] search failed:', res.status, res.statusText);
      return { edges: [] };
    }

    return res.json();
  } catch (err) {
    console.error('[graphiti] search error:', err);
    return { edges: [] };
  }
}

export async function addEpisode(
  masterId: string,
  content: string,
  llmConfig: LLMConfigPayload,
  embeddingConfig: EmbeddingConfigPayload,
  name?: string,
  sourceDescription = 'conversation'
): Promise<{ status: string }> {
  try {
    const res = await fetch(`${MEMORY_ENGINE_URL}/graphiti/add-episode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterId,
        content,
        name,
        sourceDescription,
        llmConfig,
        embeddingConfig,
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('[graphiti] add-episode failed:', res.status);
      return { status: 'error' };
    }

    return res.json();
  } catch (err) {
    console.error('[graphiti] add-episode error:', err);
    return { status: 'error' };
  }
}

export async function importKnowledgeGraph(
  llmConfig: LLMConfigPayload,
  embeddingConfig: EmbeddingConfigPayload,
  masterId?: string
): Promise<{ imported: Record<string, number> }> {
  try {
    const res = await fetch(`${MEMORY_ENGINE_URL}/graphiti/import-knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterId,
        llmConfig,
        embeddingConfig,
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('[graphiti] import-knowledge failed:', res.status, res.statusText);
      return { imported: {} };
    }

    return res.json();
  } catch (err) {
    console.error('[graphiti] import-knowledge error:', err);
    return { imported: {} };
  }
}

export async function queryKnowledgeGraph(params: {
  masterId: string;
  query: string;
  limit?: number;
}): Promise<GraphResult> {
  return { nodes: [], edges: [] };
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${MEMORY_ENGINE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
