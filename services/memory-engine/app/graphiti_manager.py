"""Manages Graphiti lifecycle: KuzuDriver, LLM client, Embedder, instance caching."""

import os
import logging

from graphiti_core import Graphiti
from graphiti_core.driver.kuzu_driver import KuzuDriver
from graphiti_core.llm_client.config import LLMConfig
from app.compat_llm_client import CompatOpenAIClient
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient

from app.config import settings

logger = logging.getLogger("memory-engine")

LLM_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "kimi": "https://api.moonshot.cn/v1",
}

_kuzu_driver: KuzuDriver | None = None
_graphiti_instance: Graphiti | None = None
_config_key: str = ""


async def get_kuzu_driver() -> KuzuDriver:
    global _kuzu_driver
    if _kuzu_driver is not None:
        return _kuzu_driver

    db_path = settings.kuzu_db_path
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    for stale in (db_path + ".wal", db_path + ".lock"):
        if os.path.exists(stale):
            try:
                os.remove(stale)
                logger.info("Removed stale file %s", stale)
            except OSError:
                pass

    _kuzu_driver = KuzuDriver(db=db_path)
    if not hasattr(_kuzu_driver, "_database"):
        _kuzu_driver._database = _kuzu_driver.default_group_id or ""
    logger.info("KuzuDriver initialized at %s", db_path)
    return _kuzu_driver


async def _ensure_fts_indexes(driver: KuzuDriver) -> None:
    """Create FTS indexes required by Graphiti search (workaround for Kuzu driver bug)."""
    for table, index_name, columns in [
        ("Entity", "node_name_and_summary", ["name", "summary"]),
        ("RelatesToNode_", "edge_name_and_fact", ["name", "fact"]),
    ]:
        try:
            cols = ", ".join(f"'{c}'" for c in columns)
            await driver.execute_query(
                f"CALL CREATE_FTS_INDEX('{table}', '{index_name}', [{cols}])"
            )
            logger.info("Created FTS index %s on %s", index_name, table)
        except Exception as e:
            msg = str(e)
            if "already exists" in msg.lower() or "duplicate" in msg.lower():
                logger.debug("FTS index %s already exists", index_name)
            else:
                logger.warning("FTS index %s creation issue: %s", index_name, msg)


def _build_config_key(llm_cfg: dict, emb_cfg: dict) -> str:
    return f"{llm_cfg.get('provider')}:{llm_cfg.get('model')}:{emb_cfg.get('provider')}:{emb_cfg.get('model')}"


def _make_llm_client(llm_cfg: dict) -> CompatOpenAIClient:
    provider = llm_cfg.get("provider", "openai")
    base_url = llm_cfg.get("apiUrl") or LLM_BASE_URLS.get(provider, LLM_BASE_URLS["openai"])
    model = llm_cfg.get("model", "gpt-4o-mini")
    api_key = llm_cfg.get("apiKey", "")

    config = LLMConfig(
        api_key=api_key,
        model=model,
        base_url=base_url,
        small_model=model,
    )
    return CompatOpenAIClient(config=config)


def _make_embedder(emb_cfg: dict) -> OpenAIEmbedder:
    base_url = emb_cfg.get("apiUrl", "https://api.siliconflow.cn/v1").rstrip("/")
    model = emb_cfg.get("model", "BAAI/bge-m3")
    api_key = emb_cfg.get("apiKey", "")

    config = OpenAIEmbedderConfig(
        api_key=api_key,
        embedding_model=model,
        base_url=base_url,
    )
    return OpenAIEmbedder(config=config)


async def get_graphiti(llm_cfg: dict, emb_cfg: dict) -> Graphiti:
    """Get or create a Graphiti instance. Caches by config key."""
    global _graphiti_instance, _config_key

    new_key = _build_config_key(llm_cfg, emb_cfg)
    if _graphiti_instance is not None and _config_key == new_key:
        return _graphiti_instance

    driver = await get_kuzu_driver()
    llm_client = _make_llm_client(llm_cfg)
    embedder = _make_embedder(emb_cfg)
    cross_encoder = OpenAIRerankerClient(
        config=LLMConfig(
            api_key=llm_cfg.get("apiKey", ""),
            base_url=llm_cfg.get("apiUrl"),
            model=llm_cfg.get("model", "gpt-4o-mini"),
        ),
    )

    _graphiti_instance = Graphiti(
        graph_driver=driver,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=cross_encoder,
    )
    _config_key = new_key

    await _ensure_fts_indexes(driver)
    logger.info("Graphiti instance created (config: %s)", new_key)
    return _graphiti_instance


async def close_graphiti() -> None:
    global _graphiti_instance, _kuzu_driver
    if _graphiti_instance is not None:
        try:
            await _graphiti_instance.close()
        except Exception:
            pass
        _graphiti_instance = None
    _kuzu_driver = None
    logger.info("Graphiti closed")
