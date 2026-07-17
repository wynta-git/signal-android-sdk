import inspect
import logging
import logging.handlers
import os
import sys
from pathlib import Path

import structlog


def _detect_service_name() -> str:
    for frame in inspect.stack():
        parts = Path(frame.filename).parts
        if "services" in parts:
            idx = list(parts).index("services")
            if idx + 1 < len(parts):
                return parts[idx + 1]
    return "app"


def _project_root() -> Path:
    for frame in inspect.stack():
        parts = Path(frame.filename).parts
        if "services" in parts:
            idx = list(parts).index("services")
            return Path(*parts[:idx])
    return Path.cwd()


def configure_logging(
    debug: bool = False,
    log_dir: str | None = None,
    log_level: str = "INFO",
    max_bytes: int = 50 * 1024 * 1024,  # 50 MB
    backup_count: int = 7,
    log_to_stdout: bool = True,
    log_to_file: bool = True,
    service_name: str | None = None,
) -> None:
    if debug:
        level = logging.DEBUG
    else:
        level = getattr(logging, log_level.upper(), logging.INFO)

    # Auto-detection walks the call stack for a services/<name> path segment —
    # override it explicitly for tools nested deeper than services/<name>/
    # (e.g. services/bonus/test/webhook-receiver would otherwise misdetect as "bonus").
    service_name = service_name or _detect_service_name()

    # Default to {project_root}/logs/; override with log_dir env var
    log_folder = Path(log_dir) if log_dir else _project_root() / "logs"
    log_folder.mkdir(parents=True, exist_ok=True)
    log_file = log_folder / f"{service_name}.log"

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.CallsiteParameterAdder(
            [structlog.processors.CallsiteParameter.FUNC_NAME]
        ),
    ]

    json_processors: list[structlog.types.Processor] = [
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ]

    # File formatter always uses JSON — no ANSI codes in log files
    file_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=json_processors,
    )

    # Stdout formatter uses colored output in debug, JSON in prod
    stdout_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer() if debug else structlog.processors.JSONRenderer(),
        ],
    )

    structlog.configure(
        processors=shared_processors
        + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    root = logging.getLogger()
    root.handlers.clear()

    if log_to_stdout:
        stdout_handler = logging.StreamHandler(sys.stdout)
        stdout_handler.setFormatter(stdout_formatter)
        root.addHandler(stdout_handler)

    if log_to_file:
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setFormatter(file_formatter)
        root.addHandler(file_handler)

    root.setLevel(level)

    # Silence noisy third-party protocol-level debug logs
    for noisy in ("aiokafka", "kafka", "clickhouse_connect", "motor", "pymongo", "aiomysql"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
