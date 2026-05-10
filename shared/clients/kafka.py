from aiokafka import AIOKafkaProducer


async def make_kafka_producer(
    bootstrap_servers: str,
    *,
    acks: str | int = "all",
    compression_type: str = "lz4",
) -> AIOKafkaProducer:
    producer = AIOKafkaProducer(
        bootstrap_servers=bootstrap_servers,
        acks=acks,
        compression_type=compression_type,
    )
    await producer.start()
    return producer
