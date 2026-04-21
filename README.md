<img src="docs/assets/banner.png" alt="ARIA Logo" class="w-32 mb-4" />

# ARIA

> Industrial reliability copilot — predictive maintenance, OEE, and shop-floor knowledge surfaced through agents.

## Quickstart

```bash
make install   # one-time: backend venv + frontend node_modules on host (for IDE)
make up        # docker compose stack with hot reload
```

| Service     | URL                                                              |
|-------------|------------------------------------------------------------------|
| Frontend    | [http://localhost:5173](http://localhost:5173)                   |
| Backend API | [http://localhost:8000](http://localhost:8000) — docs at `/docs` |

Default seed users: `admin/admin123`, `operator/operator123`, `viewer/viewer123`.

## Hot reload

Both backend (`uvicorn --reload`) and frontend (`vite` HMR) bind-mount the source from the host, so any edit triggers an instant reload inside the container — no rebuild needed.

## Useful targets

```bash
make help            # full target list
make ps              # service status
make logs            # tail all logs
make down            # stop stack
make e2e             # backend smoke test (66 assertions)

make check           # all quality gates (CI parity)
make format          # auto-format backend (black) + frontend (biome)
make backend.test    # pytest unit suite
make db.shell        # psql into the database
```

## Stack

- **Backend** — FastAPI, asyncpg, TimescaleDB / PostgreSQL · black + flake8 + pyright
- **Frontend** — React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query · Biome
- **Infra** — Docker Compose, GitHub Actions CI
