# ARIA Frontend

Minimal React 19 + Vite + TS + Tailwind v4 + TanStack Query setup.

## Stack

- Vite 7 + React 19 + TypeScript
- TailwindCSS v4 (via `@tailwindcss/vite`)
- TanStack Query (server state)
- React Router v7

## Dev

Via docker-compose (recommended — picks up backend on `backend:8000` automatically):

```sh
docker compose up frontend
# → http://localhost:5173
```

Or locally:

```sh
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

## Auth

- HTTP-only cookies set by backend on `/auth/login`
- `lib/api.ts` silently calls `/auth/refresh` on 401 and retries
- Non-sensitive `User` profile cached in `localStorage` for route gating only

## Pages

| Route    | Purpose                                                          |
|----------|------------------------------------------------------------------|
| `/login` | Login form (seed users: admin/admin123, operator, viewer)        |
| `/data`  | Auto-refreshing dump of all available backend data (raw display) |

## Files to know

- `src/lib/api.ts` — `apiFetch<T>(url, opts)` — the only HTTP helper
- `src/lib/auth.ts` — `login()`, `logout()`, `getUser()`, `isAuthenticated()`
- `src/components/RequireAuth.tsx` — route guard
- `src/main.tsx` — providers (`QueryClient`, `BrowserRouter`)

## Adding a page (recipe)

1. Create `src/pages/MyPage.tsx`.
2. Add a route in `src/App.tsx` (wrap with `<RequireAuth>` if needed).
3. Use `useQuery({ queryKey: [...], queryFn: () => apiFetch<MyType>("/my-endpoint") })`.

That's it. The Swagger UI at `http://localhost:8000/docs` lists every endpoint.
