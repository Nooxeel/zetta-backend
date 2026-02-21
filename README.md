# Zetta Reports — Backend API

Multi-language reporting system backend. Connects to multiple SQL Server databases (hosted on SoMee) and exposes report data via REST API.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Databases | SQL Server (mssql) — multiple connections |
| Validation | Zod |
| Auth | Auth0 (planned) |
| Frontend | Next.js backoffice (separate project) |

## Quick Start

```bash
npm install
cp .env.example .env   # Fill in your database credentials
npm run dev             # Starts on http://localhost:3001
```

## Project Structure

```
src/
├── index.ts              # Express server entry point
├── lib/
│   ├── db.ts             # SQL Server multi-database connection manager
│   └── logger.ts         # Structured logger
├── middleware/            # Auth, rate limiting (to be added)
└── routes/
    ├── health.ts          # Health check + DB connectivity
    ├── databases.ts       # List/test registered databases
    └── reports.ts         # Report query endpoints
```

## Database Configuration

Each SQL Server database is registered via environment variables:

```env
DB_{NAME}_SERVER=sql.somee.com
DB_{NAME}_DATABASE=mydb
DB_{NAME}_USER=myuser
DB_{NAME}_PASSWORD=mypassword
DB_{NAME}_PORT=1433
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/health/db` | Test all DB connections |
| GET | `/api/databases` | List registered databases |
| GET | `/api/databases/:name/test` | Test specific DB connection |
| GET | `/api/reports/tables?db=name` | List tables in a database |
| GET | `/api/reports/columns?db=name&table=x` | List columns of a table |
| GET | `/api/reports/query?db=name` | Execute report query (WIP) |
