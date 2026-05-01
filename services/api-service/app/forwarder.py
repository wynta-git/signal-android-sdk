import httpx
import structlog

log = structlog.get_logger()


class EventForwarder:
    """HTTPX async client for forwarding validated payloads to event-handler."""

    def __init__(self, base_url: str, timeout: float = 5.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    async def _post(self, path: str, payload: dict) -> None:
        try:
            resp = await self._client.post(path, json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            log.error("forwarder_http_error", path=path, status=e.response.status_code, detail=e.response.text)
            raise
        except httpx.TimeoutException:
            log.error("forwarder_timeout", path=path)
            raise
        except httpx.RequestError as e:
            log.error("forwarder_request_error", path=path, error=str(e))
            raise

    async def send_events(self, events: list[dict]) -> None:
        await self._post("/internal/events", {"events": events})

    async def send_identify(self, payload: dict) -> None:
        await self._post("/internal/identify", payload)

    async def aclose(self) -> None:
        await self._client.aclose()
