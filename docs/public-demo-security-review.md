# Public demo security review

Review date: 2026-08-22

This review covers the contest-demo application boundary. It is a source/configuration review and
local production smoke test, not a third-party penetration test.

## Verified controls

- Only `GET /api/catalog`, `GET /api/health`, and Better Auth's own endpoints are intentionally
  public. Personal-data and recommendation APIs require a valid session; promotion and card-benefit
  administration APIs additionally require administrator authorization.
- Every personal-data query includes the authenticated user ID or an ownership/visibility guard.
- Public catalog output contains system catalog fields and reviewed public evidence URLs only. It
  excludes user rows, source hashes, candidate raw content, reviewer IDs, and internal review state.
- Public sign-up is closed unless `ALLOW_SIGN_UP` is exactly `true`. The managed production image
  fixes it to `false` after the private bootstrap flow.
- `ADMIN_ACCESS_MODE=FIRST_USER` is accepted only when no email allowlist exists and public sign-up
  is closed. An explicit `ADMIN_EMAILS` allowlist always takes precedence.
- Authenticated write APIs enforce a same-origin `Origin` and `Sec-Fetch-Site` check, a 256 KiB JSON
  body limit, and per-user request limits. Managed deployments use the platform-provided
  `APP_BASE_URL` as the trusted origin when `BETTER_AUTH_URL` is not set.
- Better Auth enables its production rate limiter, including stricter default sign-in/sign-up
  limits. Passwords have an eight-character minimum and are handled by Better Auth.
- Global responses disable the framework signature and add MIME-sniffing, framing, referrer,
  permissions, and HSTS headers.
- The SQLite database, WAL files, backups, `.env` files, and secret values are excluded from Git and
  the Docker build context. The managed deployment reports its required auth secret as ready.
- Core demo logos are same-origin static assets. The checked SVG files contain no script,
  `foreignObject`, or event-handler content.

## Dependency review

`npm audit --omit=dev --audit-level=high` reports five moderate findings through Drizzle Kit's
legacy `esbuild` dependency. The advisory concerns the esbuild development server. The application
does not start an esbuild server in production, and npm currently reports no available fix for that
dependency path. Drizzle Kit and `tsx` remain in the runtime image because startup applies reviewed
migrations and idempotent seed data. Track the upstream dependency and upgrade when the path is
removed or patched.

## Accepted demo limitations

- A strict Content Security Policy is not enabled yet. Adding one requires a nonce-based Next.js
  policy and regression testing of framework scripts and authentication.
- Non-core brands still use Google's favicon service, so those image requests disclose the visitor's
  IP address to Google. The seven contest-demo brands use local reviewed assets; localize the rest
  before a broad consumer launch.
- The in-process API rate limiter assumes the current single-instance SQLite deployment. A scaled
  multi-instance service needs a shared atomic limiter and a database designed for that topology.
- Published card and promotion accuracy is a data-quality concern rather than an authorization
  boundary. Continue the planned full-catalog evidence review before presenting the service as a
  production financial authority.
