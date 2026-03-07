# Database Backups

This directory stores PostgreSQL database backups. Backup files (`.dump`) are
excluded from git due to their size (~665 MB).

## Create a backup

```bash
docker exec civitas_db pg_dump -U civitas -Fc civitas > backups/civitas_$(date +%Y%m%d).dump
```

## Restore a backup

Into a running PostgreSQL container (drops and recreates all objects):

```bash
docker exec -i civitas_db pg_restore -U civitas -d civitas --clean --if-exists < backups/civitas_20260307.dump
```

Into a fresh database:

```bash
docker compose up -d postgres
# Wait for healthy, then restore
docker exec -i civitas_db pg_restore -U civitas -d civitas < backups/civitas_20260307.dump
```

Backups use PostgreSQL custom format (`-Fc`), which is compressed and supports
selective restore. The backup includes all tables, indexes, views, seed data,
and ingested records.
