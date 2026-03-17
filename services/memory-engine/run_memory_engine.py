import uvicorn

from app.config import settings
from app.main import app


def main() -> None:
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=settings.memory_engine_port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
