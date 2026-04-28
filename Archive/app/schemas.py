from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TrackEventIn(BaseModel):
    client_id: str
    user_id: str
    event_name: str
    event_time: Optional[datetime] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class TrackEventOut(BaseModel):
    status: str
    event_id: str
    canonical_event: str
    enqueued: bool


class PropertyPredicate(BaseModel):
    """Represents a single property filter condition.
    
    Example:
    { "key": "currency", "op": "eq", "value": "INR", "type": "string" }
    { "key": "amount", "op": "gte", "value": 500, "type": "number" }
    """
    key: str  # property key to filter on (e.g., "amount", "currency")
    op: str   # operator: eq, neq, gt, gte, lt, lte, in
    value: Any  # value to compare against
    type: str  # "string", "number", "bool"


class SegmentUsersRequest(BaseModel):
    client_id: str
    since_days: int = 30  # default: last 30 days
    event_name: Optional[str] = None  # optional: filter by raw event_name
    canonical_event: Optional[str] = None  # optional: filter by canonical_event
    predicates: List[PropertyPredicate] = Field(default_factory=list)


class SegmentUsersResponse(BaseModel):
    user_ids: List[str]
    count: int


class RuleResult(BaseModel):
    """Represents whether a specific rule fired or not."""
    rule_name: str
    fired: bool
    description: str


class RulesEvaluateRequest(BaseModel):
    """Request to evaluate rules against an event (dry-run, no enqueue)."""
    client_id: str
    user_id: str
    event_name: str
    event_time: Optional[datetime] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class RulesEvaluateResponse(BaseModel):
    """Response showing which rules would fire for the given event."""
    client_id: str
    user_id: str
    event_name: str
    canonical_event: str
    rules: List[RuleResult]
    rule_count: int
    fired_count: int


def utcnow():
    return datetime.now(timezone.utc)
    return datetime.now(timezone.utc)