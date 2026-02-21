# Zetta Reports — Backend API

## Project Overview
Backend API para Zetta Reports — sistema de reportes multi-idioma que se conecta a múltiples bases de datos SQL Server alojadas en SoMee.

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js 5
- **Databases**: SQL Server (mssql) — múltiples conexiones simultáneas
- **Validation**: Zod
- **Auth**: Auth0 (planned)

## Frontend
El frontend (backoffice) está en un proyecto separado: `backoffice/`
- Frontend URL: `http://localhost:3000`
- Stack: Next.js 16 + React 19 + shadcn/ui + TanStack Table

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
Cada DB SQL Server se configura via env vars:
```
DB_{NAME}_SERVER=sql.somee.com
DB_{NAME}_DATABASE=mydb
DB_{NAME}_USER=user
DB_{NAME}_PASSWORD=pass
```

## API Endpoints
- `GET /api/health` — Health check
- `GET /api/health/db` — Test all DB connections
- `GET /api/databases` — List registered databases
- `GET /api/databases/:name/test` — Test specific DB
- `GET /api/reports/tables?db=name` — List tables
- `GET /api/reports/columns?db=name&table=x` — List columns
- `GET /api/reports/query?db=name` — Execute report (WIP)

## Development Commands
- `npm run dev` — Start with hot reload (port 3001)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled version
