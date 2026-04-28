from __future__ import annotations

import os
import uuid
from datetime import timezone
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

from app.mq import publish_event
from app.schemas import (
    TrackEventIn,
    TrackEventOut,
    SegmentUsersRequest,
    SegmentUsersResponse,
    RulesEvaluateRequest,
    RulesEvaluateResponse,
    RuleResult,
    utcnow,
)
from app.clickhouse import segment_users
from app.rules import evaluate_all_rules
from app.config import load_mapper, get_canonical_event

load_dotenv()

RABBITMQ_URL = os.environ["RABBITMQ_URL"]
EXCHANGE = os.environ.get("RABBITMQ_EXCHANGE", "events")
ROUTING_KEY = os.environ.get("RABBITMQ_ROUTING_KEY", "track")


# Load canonical event mapping from config file
mapper = load_mapper("config/canonical_map.json")


app = FastAPI(title="MoEngage-like Event Ingest POC")


@app.post("/track", response_model=TrackEventOut)
def track(ev: TrackEventIn):
    event_id = uuid.uuid4()
    event_time = ev.event_time or utcnow()
    if event_time.tzinfo is None:
        # assume UTC if client sends naive datetime
        event_time = event_time.replace(tzinfo=timezone.utc)

    canonical_event = mapper.get_canonical_event(ev.client_id, ev.event_name)

    msg = {
        "client_id": ev.client_id,
        "user_id": ev.user_id,
        "event_id": str(event_id),
        "event_time": event_time.isoformat(),
        "event_name": ev.event_name,
        "canonical_event": canonical_event,
        "properties": ev.properties,
        "ingest_time": utcnow().isoformat(),
    }

    try:
        publish_event(RABBITMQ_URL, EXCHANGE, ROUTING_KEY, msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to enqueue event: {e}")

    return TrackEventOut(status="ok", event_id=str(event_id), canonical_event=canonical_event, enqueued=True)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/segment/users", response_model=SegmentUsersResponse)
def segment_users_endpoint(request: SegmentUsersRequest):
    """
    Segment users based on ad-hoc property filters.
    
    Query the poc.event_props table to find users matching the given criteria:
    - client_id: required
    - since_days: look back N days (default 30)
    - event_name or canonical_event: optional event name filter
    - predicates: list of property conditions (key, op, value, type)
    
    Example request:
    {
        "client_id": "client1",
        "since_days": 30,
        "event_name": "Deposit",
        "predicates": [
            {"key": "amount", "op": "gte", "value": 500, "type": "number"},
            {"key": "currency", "op": "eq", "value": "INR", "type": "string"}
        ]
    }
    
    Returns list of user_ids and count.
    """
    user_ids = segment_users(
        client_id=request.client_id,
        since_days=request.since_days,
        event_name=request.event_name,
        canonical_event=request.canonical_event,
        predicates=request.predicates,
    )
    return SegmentUsersResponse(user_ids=user_ids, count=len(user_ids))


@app.post("/rules/evaluate", response_model=RulesEvaluateResponse)
def rules_evaluate_endpoint(request: RulesEvaluateRequest):
    """
    Evaluate rules for an event without enqueuing it (dry-run).
    
    This endpoint takes the same event payload as /track, computes the canonical_event,
    and tests which predefined rules would fire based on the user's current data in ClickHouse.
    
    No side effects: does not enqueue to RabbitMQ, does not write to ClickHouse.
    
    Example request:
    {
        "client_id": "client1",
        "user_id": "u1",
        "event_name": "Deposit",
        "properties": {
            "amount": 750,
            "currency": "INR",
            "status": "success"
        }
    }
    
    Returns:
    {
        "client_id": "client1",
        "user_id": "u1",
        "event_name": "Deposit",
        "canonical_event": "money.deposit",
        "rules": [
            {
                "rule_name": "high_value_inr_depositor",
                "fired": true,
                "description": "User has a successful INR deposit with amount >= 500 in last 30 days"
            },
            {
                "rule_name": "recent_transfer",
                "fired": false,
                "description": "User has done a transfer in last 7 days"
            }
        ],
        "rule_count": 2,
        "fired_count": 1
    }
    """
    # Compute canonical event
    canonical_event = mapper.get_canonical_event(request.client_id, request.event_name)
    
    # Evaluate all rules
    rule_results = evaluate_all_rules(request.client_id, request.user_id, canonical_event)
    
    # Build response
    rules = [
        RuleResult(
            rule_name=r["rule_name"],
            fired=r["fired"],
            description=r["description"],
        )
        for r in rule_results
    ]
    
    fired_count = sum(1 for r in rules if r.fired)
    
    return RulesEvaluateResponse(
        client_id=request.client_id,
        user_id=request.user_id,
        event_name=request.event_name,
        canonical_event=canonical_event,
        rules=rules,
        rule_count=len(rules),
        fired_count=fired_count,
    )