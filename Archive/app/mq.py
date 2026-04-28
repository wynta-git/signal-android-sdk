from __future__ import annotations

import json
import pika


def publish_event(rabbitmq_url: str, exchange: str, routing_key: str, message: dict) -> None:
    params = pika.URLParameters(rabbitmq_url)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    channel.exchange_declare(exchange=exchange, exchange_type="direct", durable=True)

    body = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    channel.basic_publish(
        exchange=exchange,
        routing_key=routing_key,
        body=body,
        properties=pika.BasicProperties(
            delivery_mode=2,  # persistent
            content_type="application/json",
        ),
    )

    connection.close()