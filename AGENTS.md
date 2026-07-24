# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js App Router application for credit-card benefit management. Core application code lives in `src/`:

- `src/app/` contains routes, layouts, global CSS, and page components.
- `src/components/` contains reusable UI and feature components, grouped by domain such as `layout/`, `settings/`, and `ui/`.
- `src/store/` contains Zustand stores; `src/hooks/` contains React hooks.
- `src/utils/` contains calculation and seed-data logic; `src/types/` centralizes shared TypeScript types.
- `src/db/` contains the Drizzle schemas and SQLite connection; `src/lib/` contains API, auth, and data-access helpers.
- `src/proxy.ts` protects page routes. Drizzle migrations live in `drizzle/`; `schema.sql` and `migration_*.sql` are legacy Supabase references.

## Build, Test, and Development Commands

- `npm install` installs dependencies from `package-lock.json`.
- `npm run dev` starts the local Next.js development server at `http://localhost:3000`.
- `npm run build` creates a production build and catches many type/runtime integration issues.
- `npm run start` serves the production build after `npm run build`.
- `npm run lint` runs ESLint using `eslint.config.mjs`.
- `npm run db:setup` applies migrations and idempotently seeds system data.
- `npm run db:generate -- --name=<change>` generates a reviewed migration after schema edits.

No automated test script is currently configured in `package.json`; use lint and build as the baseline validation before submitting changes.

## Coding Style & Naming Conventions

Use TypeScript and React functional components. Keep `strict` TypeScript compatibility intact and prefer the `@/` path alias for imports from `src/`. Existing source files generally use single quotes, semicolons, and 4-space indentation in TS/TSX files; match nearby code when editing. Name components and types in `PascalCase`, hooks as `useSomething`, stores as `useSomethingStore`, and utility functions in `camelCase`.

## Testing Guidelines

Until a test framework is added, manually verify affected flows with `npm run dev`. Always run `npm run lint` and `npm run build` for logic, routing, auth, or database changes.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style messages with `feat:`, `fix:`, `refactor:`, or `docs:` prefixes. Pull requests should summarize the change, list validation, link issues, and include screenshots for UI work.

## Security & Configuration Tips

Keep deployment settings and secrets in `.env` or the service environment only:

```env
DATABASE_PATH=data/cherrypicker.db
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
ALLOW_SIGN_UP=true
```

Do not commit secrets, generated `.next/` output, SQLite databases, WAL files, or backups. Keep SQLite access server-side, enforce ownership in every API query, and review generated Drizzle migrations before applying them.
