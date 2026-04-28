from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

import pika
import clickhouse_connect
from dotenv import load_dotenv

from worker.flatten import flatten_properties
from worker.rules import (
    segment_high_value_inr_deposit_query,
    rule_trigger_on_transfer_query,
    kyc_initiated_query,
    kyc_documents_uploaded_query,
    kyc_completed_success_query,
    kyc_completed_failed_query,
    kyc_cancelled_query,
)
from worker.dedupe import should_process_event

load_dotenv()

CLICKHOUSE_HOST = os.environ["CLICKHOUSE_HOST"]
CLICKHOUSE_PORT = int(os.environ.get("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_DATABASE = os.environ.get("CLICKHOUSE_DATABASE", "poc")
CLICKHOUSE_USERNAME = os.environ.get("CLICKHOUSE_USERNAME", "default")
CLICKHOUSE_PASSWORD = os.environ.get("CLICKHOUSE_PASSWORD", "")

RABBITMQ_URL = os.environ["RABBITMQ_URL"]
EXCHANGE = os.environ.get("RABBITMQ_EXCHANGE", "events")
QUEUE = os.environ.get("RABBITMQ_QUEUE", "events_ingest")
ROUTING_KEY = os.environ.get("RABBITMQ_ROUTING_KEY", "track")


def utcnow():
    return datetime.now(timezone.utc)


def parse_dt(s: str) -> datetime:
    # Expect ISO8601 from API
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def clickhouse_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST,
        port=CLICKHOUSE_PORT,
        username=CLICKHOUSE_USERNAME,
        password=CLICKHOUSE_PASSWORD,
        database=CLICKHOUSE_DATABASE,
    )


def ensure_queue(channel):
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(queue=QUEUE, durable=True)
    channel.queue_bind(queue=QUEUE, exchange=EXCHANGE, routing_key=ROUTING_KEY)
    channel.basic_qos(prefetch_count=100)


def insert_raw(ch, ev: dict):
    ch.insert(
        "events_raw",
        [
            (
                ev["client_id"],
                ev["user_id"],
                uuid.UUID(ev["event_id"]),
                parse_dt(ev["event_time"]),
                ev["event_name"],
                ev.get("canonical_event", f"custom.{ev['event_name'].lower()}"),
                json.dumps(ev.get("properties", {}), separators=(",", ":"), ensure_ascii=False),
                utcnow(),
            )
        ],
        column_names=[
            "client_id",
            "user_id",
            "event_id",
            "event_time",
            "event_name",
            "canonical_event",
            "props_json",
            "ingest_time",
        ],
    )


def insert_props(ch, ev: dict):
    props = ev.get("properties", {}) or {}
    flat = flatten_properties(props, max_depth=3)

    rows = []
    for k, v in flat:
        vs = vn = vb = None

        if isinstance(v, bool):
            vb = 1 if v else 0
        elif isinstance(v, (int, float)):
            vn = float(v)
        elif v is None:
            pass
        else:
            vs = str(v)

        rows.append(
            (
                ev["client_id"],
                ev["user_id"],
                uuid.UUID(ev["event_id"]),
                parse_dt(ev["event_time"]),
                ev["event_name"],
                k,
                vs,
                vn,
                vb,
                utcnow(),
            )
        )

    if rows:
        ch.insert(
            "event_props",
            rows,
            column_names=[
                "client_id",
                "user_id",
                "event_id",
                "event_time",
                "event_name",
                "key",
                "value_string",
                "value_number",
                "value_bool",
                "ingest_time",
            ],
        )


def evaluate_rules(ch, ev: dict):
    client_id = ev["client_id"]
    user_id = ev["user_id"]
    canonical_event = ev.get("canonical_event", "")

    # ========== MONEY RULES ==========
    # Rule 1: High-value INR depositor
    if canonical_event == "money.deposit":
        q = segment_high_value_inr_deposit_query(client_id, user_id)
        res = ch.query(q)
        if res.result_rows:
            print(f"[RULE] User {user_id} in segment high_value_inr_depositor => TRIGGER campaign_x")

    # Rule 2: Recent transfer
    q2 = rule_trigger_on_transfer_query(client_id, user_id)
    res2 = ch.query(q2)
    if res2.result_rows:
        print(f"[RULE] User {user_id} has recent transfer => TRIGGER webhook_y")

    # ========== KYC RULES ==========
    # Rule 3: KYC Initiated
    if canonical_event == "kyc.initiated":
        print(f"[RULE] User {user_id} initiated KYC => TRIGGER kyc_welcome_email")
    
    # Rule 4: Documents Uploaded
    if canonical_event == "kyc.uploaded":
        print(f"[RULE] User {user_id} uploaded KYC documents => TRIGGER kyc_verify_notification")
    
    # Rule 5: KYC Completed - Success
    if canonical_event == "kyc.completed":
        q_success = kyc_completed_success_query(client_id, user_id)
        res_success = ch.query(q_success)
        if res_success.result_rows:
            print(f"[RULE] User {user_id} KYC verified (success) => TRIGGER kyc_success_celebration")
            # Could trigger: unlock premium features, send certificate, etc.
        
        # Rule 6: KYC Completed - Failed
        q_failed = kyc_completed_failed_query(client_id, user_id)
        res_failed = ch.query(q_failed)
        if res_failed.result_rows:
            print(f"[RULE] User {user_id} KYC rejected (failed) => TRIGGER kyc_failed_retry_prompt")
            # Could trigger: request resubmission, customer support follow-up, etc.
    
    # Rule 7: KYC Cancelled
    if canonical_event == "kyc.cancelled":
        print(f"[RULE] User {user_id} cancelled KYC => TRIGGER kyc_cancellation_feedback")


def main():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    ensure_queue(channel)
    ch = clickhouse_client()

    def on_message(chx, method, properties, body: bytes):
        try:
            ev = json.loads(body.decode("utf-8"))
            
            # Dedupe check: skip if (client_id, event_id) already processed
            if not should_process_event(ev["client_id"], ev["event_id"]):
                print(f"[DEDUPE] Skipping duplicate event: {ev['event_id']}")
                chx.basic_ack(delivery_tag=method.delivery_tag)
                return
            
            insert_raw(ch, ev)
            insert_props(ch, ev)
            evaluate_rules(ch, ev)
            chx.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as e:
            print("[ERROR] failed processing:", e)
            # POC choice: nack and drop (avoid infinite poison-loop)
            chx.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    channel.basic_consume(queue=QUEUE, on_message_callback=on_message)
    print("Worker consuming... Ctrl+C to stop")
    channel.start_consuming()


if __name__ == "__main__":
    main()