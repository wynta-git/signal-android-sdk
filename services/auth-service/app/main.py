import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.cache import close_redis, init_redis
from app.config import settings
from app.db import close_pool, init_pool
from app.dependencies import get_portal_token_context
from fastapi import Depends
from app.routes.brands import router as brands_router
from app.routes.client import router as client_router
from app.routes.exchange_token import router as exchange_token_router
from app.routes.pam_users import router as pam_users_router
from app.routes.portal_token import router as portal_token_router
from app.routes.ready import router as ready_router
from app.routes.token import router as token_router
from app.routes.users import router as users_router
from shared.clients.mongo import make_mongo_client
from shared.cors import CORS_ORIGINS
from shared.logging_config import configure_logging

configure_logging(debug=settings.debug, log_dir=settings.log_dir or None, log_level=settings.log_level)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.mongo = make_mongo_client(
        settings.mongo_url,
        min_pool_size=settings.mongo_min_pool_size,
        max_pool_size=settings.mongo_max_pool_size,
    )
    await init_pool()
    init_redis()
    log.info("startup_complete", version=settings.version)
    yield
    app.state.mongo.close()
    await close_pool()
    await close_redis()
    log.info("shutdown_complete")


app = FastAPI(
    title="PAM Auth Service",
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        
                    "http://localhost:3000", 
                   "http://127.0.0.1:3001",
                   "http://127.0.0.1:8081",
                   "http://127.0.0.1:8080",
                   "http://127.0.0.1:80"
                   
                   ],

    allow_methods=["*"],
    allow_headers=["*"],
)



app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next: object) -> Response:
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=str(uuid.uuid4()))
    return await call_next(request)  # type: ignore[operator]


route_prefix = "/api/v1/system"
app.include_router(token_router, prefix=route_prefix)
app.include_router(portal_token_router, prefix=route_prefix)
app.include_router(exchange_token_router, prefix=route_prefix)
app.include_router(ready_router, prefix=route_prefix)
_portal = [Depends(get_portal_token_context)]

app.include_router(users_router, prefix=route_prefix, dependencies=_portal)
app.include_router(brands_router, prefix=route_prefix, dependencies=_portal)
app.include_router(client_router, prefix=route_prefix, dependencies=_portal)
app.include_router(pam_users_router, prefix=route_prefix, dependencies=_portal)


@app.get(route_prefix+"/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.version}
