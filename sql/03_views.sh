#!/bin/bash
# Runs the SQL views in order during Docker initdb.
# PostgreSQL's initdb.d does not recurse into subdirectories,
# so this script explicitly applies each view file.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -f /docker-entrypoint-initdb.d/views/01_summary.sql \
    -f /docker-entrypoint-initdb.d/views/02_flags.sql \
    -f /docker-entrypoint-initdb.d/views/03_score.sql
