FROM python:3.12-slim

WORKDIR /app

# System libs for WeasyPrint (needed by civitas-reports server)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# MCP dependencies
COPY requirements-mcp.txt .
RUN pip install --no-cache-dir -r requirements-mcp.txt

# Backend dependencies (needed by civitas-reports server for report/pdf services)
COPY backend/requirements.txt backend-requirements.txt
RUN pip install --no-cache-dir -r backend-requirements.txt

COPY mcp_servers/ mcp_servers/
COPY backend/ backend/

ENV PYTHONPATH=/app
ENV MCP_SERVER=civitas_db

CMD python -m mcp_servers.${MCP_SERVER}.server
