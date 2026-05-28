FROM python:3.11-slim

WORKDIR /app

RUN pip install uv

COPY shared/ /shared/
COPY services/notifications-engine/ /app/

RUN uv pip install --system -e /shared -e /app

CMD ["python", "-m", "app.main"]
