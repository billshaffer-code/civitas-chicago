FROM python:3.12-slim

WORKDIR /app

COPY requirements-tasks.txt .
RUN pip install --no-cache-dir -r requirements-tasks.txt

COPY tasks/ tasks/
COPY backend/ backend/

ENV PYTHONPATH=/app

CMD ["python", "-m", "tasks.common.runner", "--scheduler"]
