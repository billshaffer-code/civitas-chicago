FROM python:3.12-slim

WORKDIR /app

COPY requirements-mcp.txt .
RUN pip install --no-cache-dir -r requirements-mcp.txt

COPY mcp_servers/ mcp_servers/
COPY backend/ backend/

ENV PYTHONPATH=/app
ENV MCP_SERVER=civitas_db

CMD python -m mcp_servers.${MCP_SERVER}.server
