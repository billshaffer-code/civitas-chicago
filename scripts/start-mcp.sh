#!/usr/bin/env bash
# Start all 4 CIVITAS MCP server containers
set -e

cd "$(dirname "$0")/.."

echo "Starting MCP server containers..."
docker compose up -d mcp-civitas-db mcp-chicago-data mcp-cook-county mcp-civitas-reports

echo ""
echo "MCP servers:"
docker compose ps --format "table {{.Name}}\t{{.Status}}" | grep mcp

echo ""
echo "To stop: docker compose stop mcp-civitas-db mcp-chicago-data mcp-cook-county mcp-civitas-reports"
