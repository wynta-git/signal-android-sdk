import time
from dataclasses import dataclass, field
from enum import Enum


class State(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


_FAILURE_THRESHOLD = 5
_COOLDOWN_SECONDS = 30


@dataclass
class CircuitBreaker:
    _state: State = field(default=State.CLOSED, init=False)
    _failures: int = field(default=0, init=False)
    _opened_at: float = field(default=0.0, init=False)

    def allow(self) -> bool:
        if self._state == State.CLOSED:
            return True
        if self._state == State.OPEN:
            if time.monotonic() - self._opened_at >= _COOLDOWN_SECONDS:
                self._state = State.HALF_OPEN
                return True
            return False
        # HALF_OPEN: allow one probe
        return True

    def record_success(self) -> None:
        self._failures = 0
        self._state = State.CLOSED

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= _FAILURE_THRESHOLD:
            self._state = State.OPEN
            self._opened_at = time.monotonic()


# Global registry: provider name → breaker instance
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(provider: str) -> CircuitBreaker:
    if provider not in _breakers:
        _breakers[provider] = CircuitBreaker()
    return _breakers[provider]
