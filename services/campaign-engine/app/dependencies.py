from aiokafka import AIOKafkaProducer
from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_producer(request: Request) -> AIOKafkaProducer:
    return request.app.state.producer
