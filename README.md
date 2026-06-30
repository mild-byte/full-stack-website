# Task Manager

A full-stack task manager: React frontend, Node/Express backend, MySQL for storage. Task changes (create/update/delete) are also streamed off the MySQL binlog through Debezium and Kafka to a consumer that logs every change (CDC).

Run all commands from the **repository root** (where `docker-compose.yaml` lives), one level above `my-fullstack-app/`.

## Project structure

```
.
├── docker-compose.yaml      All services: frontend, backend, mysql, kafka, connect, cdc-consumer
├── init.sql                 Schema (users / user_tokens / tasks), loaded into mysql on first boot
├── my-fullstack-app/
│   ├── .env                 Config for mysql / kafka / connect
│   ├── backend/
│   │   ├── server.js        Express API: /login + /tasks CRUD, emits Kafka events on writes
│   │   ├── cdc-consumer.js  Logs Debezium change events for the tasks table
│   │   └── Dockerfile
│   └── frontend/
│       └── src/App.js       Login screen + task dashboard
```

## Prerequisites

- Docker and Docker Compose v2 — everything else runs in containers

## Setup and first run

1. **Start everything** (from the repo root):

   ```bash
   docker compose up -d --build
   ```

   Check status with `docker compose ps` — `mysql` should show `(healthy)`, the rest `Up`.

2. **Register the Debezium connector** (one-time, only needed again if the `kafka` container is ever removed — `docker compose restart` / `up -d` don't affect it):

   ```bash
   curl -s -X POST http://localhost:8083/connectors \
     -H "Content-Type: application/json" \
     -d '{
       "name": "tasks-mysql-connector",
       "config": {
         "connector.class": "io.debezium.connector.mysql.MySqlConnector",
         "database.hostname": "mysql",
         "database.port": "3306",
         "database.user": "root",
         "database.password": "password",
         "database.server.id": "184054",
         "topic.prefix": "cdc",
         "database.include.list": "mydatabase",
         "table.include.list": "mydatabase.tasks",
         "include.schema.changes": "false",
         "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
         "schema.history.internal.kafka.topic": "schema-changes.mydatabase"
       }
     }'
   ```

3. **Open the app**: `http://localhost:3000`

   Default login: `admin` / `password` (seeded automatically by the backend on startup).

4. **Watch CDC events** as you create/update/delete tasks:

   ```bash
   docker compose logs -f cdc-consumer
   ```

## Ports

| Service | Port | Notes |
| --- | --- | --- |
| frontend | 3000 | |
| backend | 5000 | REST API |
| mysql | 3306 | |
| kafka | 9094 | internal traffic uses `kafka:9092` |
| connect | 8083 | Kafka Connect REST API |

## Useful commands

```bash
docker compose logs -f backend          # tail logs for a service
docker compose up -d --build backend    # rebuild after code changes
docker compose down                     # stop, keep data
docker compose down -v                  # stop, wipe mysql data + Kafka/connector state
```

## Troubleshooting

- **`mysql` won't start (`ERROR 1410 ... GRANT`)**: don't remove the `empty.sql` volume mount in `docker-compose.yaml` — it disables a built-in demo init script that's incompatible with this MySQL version.
- **Frontend shows `Unexpected token '<' ... not valid JSON`**: the backend isn't responding properly — check `docker compose logs backend`.
- **`kafka` exits citing `process.roles`**: its KRaft env vars are missing from `my-fullstack-app/.env`.
- **No CDC events show up**: the connector probably isn't registered — redo step 2 above.
