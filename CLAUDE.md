# Zetta Reports Backend

## Purpose & Boundaries

**What this service does:**
- REST API that connects to multiple SQL Server databases and exposes endpoints for the backoffice to consume
- Manages database connections, introspection (tables, columns), and report data queries
- Provides health checks and connectivity monitoring for all registered databases
- Serves as the data gateway for the Zetta Reports backoffice (Next.js frontend at `../backoffice`)

**What this service does NOT do:**
- Does not serve a UI — the frontend is a separate Next.js project (`../backoffice`)
- Does not use an ORM — all database access is raw SQL via `mssql` connection pools
- Does not manage user authentication yet (Auth0 planned, not implemented)
- Does not write to databases — all current endpoints are read-only (SELECT queries)

---

## Repo Map

```
backendZetta/
├── agent/                     # AI development team agent definitions
│   ├── dt-orchestrator.md     # Dev lifecycle coordinator
│   ├── dt-architect.md        # Architecture design
│   ├── dt-implementer.md      # Code implementation
│   ├── dt-tester.md           # Test writing and running
│   ├── dt-qa.md               # QA/acceptance validation
│   ├── dt-delivery.md         # Docs, versioning, commit/push
│   └── dt-init.md             # Project bootstrapper
├── src/
│   ├── index.ts               # Express 5 entry point (middleware + routes)
│   ├── lib/
│   │   ├── db.ts              # DatabaseManager — multi-DB SQL Server pool manager
│   │   └── logger.ts          # Namespaced structured logger (level-aware)
│   └── routes/
│       ├── health.ts          # GET /api/health, GET /api/health/db
│       ├── databases.ts       # GET /api/databases, GET /api/databases/:name/test
│       └── reports.ts         # GET /api/reports/query|tables|columns
├── .env                       # Environment variables (git-ignored)
├── .env.example               # Env var documentation/template
├── package.json               # zetta-reports-backend v0.1.1
└── tsconfig.json              # TypeScript config (ES2020, CommonJS, strict)
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js + TypeScript | TS 5.9 |
| Framework | Express | 5.2.x |
| Database | SQL Server (mssql) | 11.x |
| Validation | Zod | 4.x (installed, not yet wired) |
| Security | Helmet + CORS | helmet 8.x, cors 2.x |
| Compression | compression | 1.8.x |
| Rate limiting | express-rate-limit | 8.x (installed, not yet wired) |
| Package manager | npm | — |
| Dev server | tsx watch | — |

**No ORM.** Direct SQL via `mssql` parameterized queries. No Prisma, TypeORM, or migration system.

**No test framework installed yet.** When adding tests, use Vitest (preferred) or Jest.

---

## Golden Commands

```bash
# Development
npm run dev          # Start dev server with hot reload (tsx watch, port 3001)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled output (node dist/index.js)

# Dependencies
npm install          # Install all dependencies
npm install <pkg>    # Add production dependency
npm install -D <pkg> # Add dev dependency
```

---

## Architectural Conventions

### Database Connection Pattern

Databases are registered by name via environment variables following the pattern:
```
DB_{NAME}_SERVER=host
DB_{NAME}_DATABASE=dbname
DB_{NAME}_USER=user
DB_{NAME}_PASSWORD=password
DB_{NAME}_PORT=1433
```

Register in `src/index.ts`:
```ts
dbManager.registerFromEnv(['ESAABBIONET', 'ANOTHER_DB'])
```

Access in routes:
```ts
const pool = await dbManager.getPool('esaabbionet')
const result = await pool.request().input('param', value).query('SELECT ...')
```

### Route Pattern

- Routes live in `src/routes/{resource}.ts`
- Each file exports a default `Router()`
- Mounted in `src/index.ts` under `/api` prefix
- All routes are currently GET (read-only)
- Use parameterized queries (`pool.request().input(name, value).query(...)`) — **never** concatenate user input into SQL

### Logger Pattern

Use the namespaced logger, never `console.log`:
```ts
import { createLogger } from '../lib/logger'
const logger = createLogger('MyModule')
logger.info('message')
logger.error('failed:', error)
```

### Adding a New Database

1. Add env vars to `.env`: `DB_NEWDB_SERVER`, `DB_NEWDB_DATABASE`, etc.
2. Document in `.env.example`
3. Register in `src/index.ts`: add `'NEWDB'` to the `registerFromEnv` array

### Adding a New Route

1. Create `src/routes/{resource}.ts` with an Express `Router()`
2. Import and mount in `src/index.ts`: `app.use('/api/{resource}', newRoutes)`
3. All query endpoints require `?db=<name>` to specify the target database

---

## Interfaces & Contracts

### API Endpoints

| Method | Path | Query Params | Description |
|--------|------|-------------|-------------|
| GET | `/api/health` | — | Service health + registered DB names |
| GET | `/api/health/db` | — | Test all DB connections (200 ok / 503 degraded) |
| GET | `/api/databases` | — | List registered database names |
| GET | `/api/databases/:name/test` | — | Test single DB connectivity + latency |
| GET | `/api/reports/query` | `db` | Placeholder — `SELECT 1` (TODO: real report queries) |
| GET | `/api/reports/tables` | `db` | List all BASE TABLEs from INFORMATION_SCHEMA |
| GET | `/api/reports/columns` | `db`, `table` | List columns for a table from INFORMATION_SCHEMA |

### Response Format

All endpoints return JSON. Error responses follow:
```json
{ "error": "Description", "details": "optional error message" }
```

### CORS

- Dev: all origins allowed
- Production: only `http://localhost:3000` and `FRONTEND_URL` env var

---

## Security & Compliance

- **No auth implemented yet** — Auth0 is planned (env vars stubbed in `.env.example`)
- **All queries MUST use parameterized inputs** — `pool.request().input(name, value)` — never string concatenation
- **SQL Server connections use `trustServerCertificate: true`** for self-signed certs
- **Helmet** provides security headers (CSP disabled for API-only service)
- **No PII in logs** — the logger masks sensitive data
- **Body size limited** to 10MB for JSON and URL-encoded payloads
- **Trust proxy** is enabled (`app.set('trust proxy', 1)`) for cloud deployments

---

## Observability

- **Logger:** `src/lib/logger.ts` — namespaced, level-aware (debug/info in dev, warn/error in prod)
- **Health endpoint:** `/api/health` — basic service status
- **DB health:** `/api/health/db` — tests all connections, returns latency per database
- **No APM or tracing** — consider adding if needed

---

## Git & Delivery Conventions

- **Branch naming:** `feat/{feature-name}`, `fix/{bug-name}`, `hotfix/{issue}`
- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
- **Never commit** `.env` files — only `.env.example`
- **Version:** in `package.json` — patch for fixes, minor for features

---

## Subagent Orchestration

| Intent | Agent | Output |
|--------|-------|--------|
| Full task lifecycle | `dt-orchestrator` | Coordinates all phases |
| Architecture/design/review | `dt-architect` | Architecture proposal + risk assessment |
| Feature implementation | `dt-implementer` | Production code |
| Test strategy & execution | `dt-tester` | Test plan + tests with factory mocks |
| Acceptance criteria & validation | `dt-qa` | QA checklist + validation report |
| Docs + version + commit + push | `dt-delivery` | Docs + CHANGELOG + version bump + commit |

---

## When to Ask Humans

- **Unclear requirements** — ask before implementing
- **New database registration** — confirm DB name, credentials, and access scope
- **Authentication decisions** — Auth0 integration approach needs human input
- **Schema changes** — any DDL operations require explicit approval (this service is read-only by design)
- **Breaking API changes** — any endpoint signature change affects the backoffice
- **Security-sensitive changes** — credential handling, new auth flows
