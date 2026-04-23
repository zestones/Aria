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

## Managed Agents (Investigator — optional)

The Investigator can run on Claude Managed Agents instead of the default Messages API loop. This unlocks hosted MCP (Anthropic calls our endpoint directly) and hosted session persistence (the reasoning trace survives for 30 days). Off by default — flip with a single env var.

### 1. Set the path secret

`/mcp` becomes a public endpoint once it is tunneled. Anthropic's `mcp_servers` config does not forward custom HTTP headers, so the URL itself carries the secret. Generate a 32-byte token and put it in `.env`:

```bash
echo "ARIA_MCP_PATH_SECRET=$(openssl rand -hex 32)" >> .env
```

### 2. Expose `/mcp` via Cloudflare Tunnel

Two options:

**Option A — Persistent tunnel (stable hostname, needs Cloudflare dashboard setup).** Create a tunnel in the Cloudflare Zero Trust dashboard mapping a hostname to `http://backend:8000`, copy the token, then:

```bash
echo "CF_TUNNEL_TOKEN=<token-from-dashboard>" >> .env
docker compose --profile tunnel up -d tunnel
```

**Option B — Quick tunnel (ephemeral URL, no account needed).** Run one-off:

```bash
docker run --rm --network aria_aria cloudflare/cloudflared:latest \
  tunnel --url http://backend:8000
```

Either way, copy the tunneled URL and append the path secret — this becomes `ARIA_MCP_PUBLIC_URL`:

```bash
ARIA_MCP_PUBLIC_URL=https://<your-tunnel>.trycloudflare.com/mcp/<ARIA_MCP_PATH_SECRET>/
```

Verify with `curl $ARIA_MCP_PUBLIC_URL` — you should see an MCP protocol response, not 404.

### 3. Flip the flag

```bash
INVESTIGATOR_USE_MANAGED=true
```

Restart the backend. Sentinel-triggered investigations now run on Managed Agents. Flip back to `false` and restart for a <5 min rollback to the Messages API path.
