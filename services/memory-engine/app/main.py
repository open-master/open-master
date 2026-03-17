import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.graphiti_manager import close_graphiti
from app.routers import graphiti_router

logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("memory-engine")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting memory-engine (Kuzu: %s, masters: %s)", settings.kuzu_db_path, settings.masters_dir)
    yield
    await close_graphiti()
    logger.info("memory-engine shut down")


app = FastAPI(
    title="Open Master Memory Engine",
    description="Temporal knowledge graph service for configurable AI mentor assistants",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graphiti_router.router, prefix="/graphiti", tags=["graphiti"])


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "memory-engine",
        "kuzu_path": settings.kuzu_db_path,
    }
