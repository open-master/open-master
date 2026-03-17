"""Load master knowledge packs into Graphiti on first run."""

import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType

from app.config import settings

logger = logging.getLogger("memory-engine")

MARKER_FILE = ".imported"


def _get_marker_path(master_id: str) -> Path:
    state_dir = Path(settings.knowledge_state_dir) / master_id
    state_dir.mkdir(parents=True, exist_ok=True)
    return state_dir / MARKER_FILE


async def import_knowledge_pack(graphiti: Graphiti, master_id: str, knowledge_dir: str) -> int:
    marker = _get_marker_path(master_id)
    if marker.exists():
        logger.info("Knowledge pack for %s already imported, skipping", master_id)
        return 0

    knowledge_file = os.path.join(knowledge_dir, "knowledge.json")
    if not os.path.exists(knowledge_file):
        logger.warning("No knowledge.json found for %s at %s", master_id, knowledge_dir)
        return 0

    with open(knowledge_file, "r", encoding="utf-8") as f:
        episodes = json.load(f)

    imported = 0
    for ep in episodes:
        ref_time = datetime.now(timezone.utc)
        if ep.get("referenceTime"):
            try:
                ref_time = datetime.fromisoformat(ep["referenceTime"].replace("Z", "+00:00"))
            except ValueError:
                pass

        try:
            await graphiti.add_episode(
                name=ep["name"],
                episode_body=ep["content"],
                source=EpisodeType.text,
                source_description=ep.get("sourceDescription", "knowledge_pack"),
                reference_time=ref_time,
                group_id=master_id,
            )
            imported += 1
            logger.info("[%s] Imported: %s", master_id, ep["name"])
        except Exception as e:
            logger.error("[%s] Failed to import %s: %s", master_id, ep["name"], e)

    with open(marker, "w", encoding="utf-8") as f:
        f.write(datetime.now(timezone.utc).isoformat())

    logger.info("[%s] Knowledge import complete: %d/%d episodes", master_id, imported, len(episodes))
    return imported


async def import_all_knowledge_packs(graphiti: Graphiti) -> dict[str, int]:
    masters_dir = settings.masters_dir
    if not os.path.isdir(masters_dir):
        logger.warning("Masters directory not found: %s", masters_dir)
        return {}

    results = {}
    for master_id in sorted(os.listdir(masters_dir)):
        knowledge_dir = os.path.join(masters_dir, master_id)
        if not os.path.isdir(knowledge_dir):
            continue
        count = await import_knowledge_pack(graphiti, master_id, knowledge_dir)
        results[master_id] = count

    return results
