from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    kuzu_db_path: str = "/data/graphiti.kuzu"
    masters_dir: str = "/app/masters"
    knowledge_state_dir: str = "/data/knowledge-state"
    memory_engine_port: int = 8000
    log_level: str = "debug"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
