# myfullstackapp — Cognitive Cost Logger

Myfullstackapp is designaanded to manage your tasks easily.
It consists of docker, docker-compose, prometheus, react as frontend and nodejs as backend.

---

## How it works

1. Build an image using the Dockerfile
2. Run docker compose up -d in your terminal
3. Rate how draining it was on a scale of 1 (barely noticed) to 5 (completely wiped)
4. Optionally add a short label or note for context
5. Check **View insights** to see your patterns across the last 30 days

---

## Architecture

```
Browser
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  Nginx (port 80)                                    │
│  Serves index.html for all routes                  │
│  Proxies /api/* → FastAPI (strips /api prefix)     │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  FastAPI — Nodejs (port 5000)               │
│                                                     │
│  GET  /tasks          Kubernetes health probe      │
│  POST /tasks          Post a task │
│  POST /events          Logs a new event             │
│  GET  /events/today    Returns today's events       │
│  GET  /insights        30-day aggregated patterns   │
│  GET  /metrics         Prometheus scrape endpoint   │
└─────────────────────────────────────────────────────┘
```

---

## Request flow

```
User taps "Log it"
    │
    ▼
POST /api/events  →  Nginx strips /api  →  POST /events on FastAPI
    │
    ├─ Pydantic validates the body (category string, depletion 1–5)
    ├─ Category key checked against the CATEGORIES dict
    ├─ Document inserted into MongoDB events collection
    ├─ Prometheus EVENTS_LOGGED counter incremented (by category)
    ├─ Today's total depletion recalculated from DB
    └─ Prometheus DAILY_DEPLETION_SCORE gauge updated
    │
    ▼
201 Created  →  JavaScript calls GET /api/events/today  →  Home screen refreshes
```

---

## Project structure

```
.
├── app/
│   ├── main.py          FastAPI application — routes and business logic
│   ├── database.py      MongoDB connection helper
│   ├── metrics.py       Prometheus counters, histograms, and gauges
│   ├── test_unit.py     Unit tests — pure Python, no database needed
│   ├── test_api.py      Integration tests — FastAPI TestClient + real MongoDB
│   └── test_e2e.py      End-to-end tests — full stack via HTTP
├── nginx/
│   ├── nginx.conf       Nginx config — serves HTML, proxies /api/* to FastAPI
│   └── index.html       Single-page frontend — 4 screens, no build step needed
├── Dockerfile           Multi-stage build for the FastAPI backend
├── docker-compose.yaml  Local full-stack: nginx + FastAPI + MongoDB
└── .github/
    └── workflows/
        └── ci.yml       CI/CD pipeline — test, build, push to GHCR
```

---

## CI/CD pipeline

```
Push to main
    │
    ├─ unit-tests        pytest test_unit.py  (pure Python, no containers)
    ├─ integration-tests pytest test_api.py   (docker-compose up, real MongoDB)
    ├─ e2e-tests         pytest test_e2e.py   (full stack, curl against nginx)
    │
    ├─ build-backend     docker build + push lingua-backend to GHCR
    ├─ build-nginx       docker build + push lingua-nginx to GHCR
    │
    └─ deploy-images     clone GitOps repo → yq update image tags → push
                         (triggers ArgoCD sync to Kubernetes)
```

---

## Local installation

### Prerequisites

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) (fast Python package manager)
- MongoDB 7.0 running locally **or** Docker (to run only MongoDB as a container)
- Git

### 1 — Clone the repository

```bash
git clone https://github.com/mild-byte/language-learning-app.git
cd language-learning-app
```

### 2 — Start MongoDB

**Option A — MongoDB installed locally:**

```bash
sudo systemctl start mongod
```

**Option B — MongoDB in Docker only (simpler):**

```bash
docker run -d --name volt-mongo -p 27017:27017 mongo:7.0
```

### 3 — Install Python dependencies

```bash
uv venv .venv
source .venv/bin/activate
uv pip install fastapi uvicorn pymongo python-multipart prometheus-client pytest
```

### 4 — Run the backend

```bash
cd app
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

The API is now available at `http://localhost:5000`.

The `--reload` flag restarts the server automatically every time you save a Python file.

### 5 — Run the unit tests

In a separate terminal (while still inside `app/`):

```bash
cd app
pytest test_unit.py -v
```

### 6 — Run the full stack with Docker Compose

To run nginx + FastAPI + MongoDB together exactly as they run in production:

```bash
docker-compose up --build
```

Open `http://localhost` in your browser.

---

## Environment variables

| Variable    | Default                     | Description               |
| ----------- | --------------------------- | ------------------------- |
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection string |

In Docker Compose this is set to `mongodb://mongodb:27017` to reach the `mongodb` service on the internal Docker network.

---

## Observability

Prometheus scrapes `http://backend-service:5000/metrics` every 15 seconds. The following metrics are exported:

| Metric                          | Type      | Description                                         |
| ------------------------------- | --------- | --------------------------------------------------- |
| `http_requests_total`           | Counter   | Total HTTP requests, by method and endpoint         |
| `http_request_duration_seconds` | Histogram | Request duration in seconds, by method and endpoint |
| `cognitive_events_logged_total` | Counter   | Events logged, broken down by category              |
| `daily_depletion_score_total`   | Gauge     | Today's cumulative depletion score                  |
