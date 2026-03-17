"""Graphiti knowledge graph router — real implementation with Kuzu backend."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from graphiti_core.nodes import EpisodeType

from app.graphiti_manager import get_graphiti

logger = logging.getLogger("memory-engine")
router = APIRouter()


# --------------- Request / Response Models ---------------

class LLMConfig(BaseModel):
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    apiKey: str = ""
    apiUrl: str | None = None


class EmbeddingConfig(BaseModel):
    provider: str = "siliconflow"
    model: str = "BAAI/bge-m3"
    apiKey: str = ""
    apiUrl: str = "https://api.siliconflow.cn/v1"


class AddEpisodeRequest(BaseModel):
    masterId: str
    content: str
    name: str | None = None
    sourceDescription: str = "conversation"
    referenceTime: str | None = None
    llmConfig: LLMConfig
    embeddingConfig: EmbeddingConfig


class SearchRequest(BaseModel):
    masterId: str
    query: str
    numResults: int = 5
    llmConfig: LLMConfig
    embeddingConfig: EmbeddingConfig


class NodeResult(BaseModel):
    id: str
    name: str
    summary: str
    labels: list[str] = []


class EdgeResult(BaseModel):
    uuid: str
    fact: str
    validAt: str | None = None
    invalidAt: str | None = None
    sourceNodeName: str | None = None
    targetNodeName: str | None = None


class SearchResponse(BaseModel):
    edges: list[EdgeResult] = []
    nodes: list[NodeResult] = []


class BulkEpisode(BaseModel):
    name: str
    content: str
    sourceDescription: str = "knowledge_pack"
    referenceTime: str | None = None


class BulkImportRequest(BaseModel):
    masterId: str
    episodes: list[BulkEpisode]
    llmConfig: LLMConfig
    embeddingConfig: EmbeddingConfig


# --------------- Endpoints ---------------

@router.post("/add-episode")
async def add_episode(req: AddEpisodeRequest):
    try:
        graphiti = await get_graphiti(req.llmConfig.model_dump(), req.embeddingConfig.model_dump())
    except Exception as e:
        logger.error("graphiti init failed in add_episode: %s", e, exc_info=True)
        return {"status": "error", "error": f"graphiti init failed: {e}"}

    ref_time = datetime.now(timezone.utc)
    if req.referenceTime:
        try:
            ref_time = datetime.fromisoformat(req.referenceTime.replace("Z", "+00:00"))
        except ValueError:
            pass

    episode_name = req.name or f"{req.masterId}_{int(ref_time.timestamp())}"

    try:
        await graphiti.add_episode(
            name=episode_name,
            episode_body=req.content,
            source=EpisodeType.text,
            source_description=req.sourceDescription,
            reference_time=ref_time,
            group_id=req.masterId,
        )
        return {"status": "ok", "masterId": req.masterId, "name": episode_name}
    except Exception as e:
        logger.error("add_episode failed: %s", e, exc_info=True)
        return {"status": "error", "error": str(e)}


@router.post("/search", response_model=SearchResponse)
async def search_knowledge(req: SearchRequest):
    try:
        graphiti = await get_graphiti(req.llmConfig.model_dump(), req.embeddingConfig.model_dump())
    except Exception as e:
        logger.error("graphiti init failed in search: %s", e, exc_info=True)
        return SearchResponse()

    try:
        results = await graphiti.search(
            req.query,
            num_results=req.numResults,
            group_ids=[req.masterId],
        )

        edges = []
        for r in results:
            edges.append(EdgeResult(
                uuid=str(getattr(r, "uuid", "")),
                fact=getattr(r, "fact", ""),
                validAt=str(getattr(r, "valid_at", "")) if getattr(r, "valid_at", None) else None,
                invalidAt=str(getattr(r, "invalid_at", "")) if getattr(r, "invalid_at", None) else None,
                sourceNodeName=getattr(r, "source_node_name", None),
                targetNodeName=getattr(r, "target_node_name", None),
            ))

        return SearchResponse(edges=edges)
    except Exception as e:
        logger.error("search failed: %s", e, exc_info=True)
        return SearchResponse()


@router.post("/bulk-import")
async def bulk_import(req: BulkImportRequest):
    try:
        graphiti = await get_graphiti(req.llmConfig.model_dump(), req.embeddingConfig.model_dump())
    except Exception as e:
        logger.error("graphiti init failed in bulk_import: %s", e, exc_info=True)
        return {"imported": 0, "total": len(req.episodes), "errors": [{"name": "init", "error": str(e)}]}

    imported = 0
    errors = []
    for ep in req.episodes:
        ref_time = datetime.now(timezone.utc)
        if ep.referenceTime:
            try:
                ref_time = datetime.fromisoformat(ep.referenceTime.replace("Z", "+00:00"))
            except ValueError:
                pass

        try:
            await graphiti.add_episode(
                name=ep.name,
                episode_body=ep.content,
                source=EpisodeType.text,
                source_description=ep.sourceDescription,
                reference_time=ref_time,
                group_id=req.masterId,
            )
            imported += 1
            logger.info("Imported episode: %s for %s", ep.name, req.masterId)
        except Exception as e:
            errors.append({"name": ep.name, "error": str(e)})
            logger.error("Failed to import %s: %s", ep.name, e)

    return {"imported": imported, "total": len(req.episodes), "errors": errors}


class ImportKnowledgeRequest(BaseModel):
    llmConfig: LLMConfig
    embeddingConfig: EmbeddingConfig
    masterId: str | None = None


@router.post("/import-knowledge")
async def import_knowledge(req: ImportKnowledgeRequest):
    from app.knowledge_loader import import_all_knowledge_packs, import_knowledge_pack
    import os
    from app.config import settings

    try:
        graphiti = await get_graphiti(req.llmConfig.model_dump(), req.embeddingConfig.model_dump())
    except Exception as e:
        logger.error("graphiti init failed in import_knowledge: %s", e, exc_info=True)
        return {"imported": {}, "error": str(e)}

    if req.masterId:
        knowledge_dir = os.path.join(settings.masters_dir, req.masterId)
        count = await import_knowledge_pack(graphiti, req.masterId, knowledge_dir)
        return {"imported": {req.masterId: count}}

    results = await import_all_knowledge_packs(graphiti)
    return {"imported": results}


@router.get("/status")
async def graphiti_status():
    from app.graphiti_manager import _graphiti_instance, _kuzu_driver
    return {
        "status": "ready" if _graphiti_instance else "not_initialized",
        "backend": "kuzu",
        "kuzu_connected": _kuzu_driver is not None,
    }
