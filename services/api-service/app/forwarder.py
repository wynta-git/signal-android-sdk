import httpx
import structlog

log = structlog.get_logger()


class EventForwarder:
    """HTTPX async client for forwarding validated events to event-handler."""

    def __init__(self, base_url: str, timeout: float = 5.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    async def send_events(self, events: list[dict]) -> None:
        try:
            resp = await self._client.post("/internal/events", json={"events": events})
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            log.error("forwarder_http_error", status=e.response.status_code, detail=e.response.text)
            raise
        except httpx.TimeoutException:
            log.error("forwarder_timeout")
            raise
        except httpx.RequestError as e:
            log.error("forwarder_request_error", error=str(e))
            raise

    async def aclose(self) -> None:
        await self._client.aclose()
