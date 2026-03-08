# Security Rules

Follow every rule below. No exceptions.

## Secrets
- Never hardcode secrets, keys, tokens or passwords in source code.
- Read all sensitive values from environment variables.
- Never log secrets or tokens.
- Never put credentials in Dockerfiles or docker-compose files.

## Input Validation
- Never trust req.body, req.query, or req.params directly.
- Validate all inputs with a schema library (zod, joi, yup) before use.
- Check for array injection in query parameters.

## File Upload
- Validate file type by magic bytes, not Content-Type header. Use `file-type` package.
- Rename uploaded files with UUID. Never use the original filename.
- Block SVG and HTML uploads.
- Serve files with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Never write uploads directly to a public directory.

## CORS
- Never use wildcard (`*`) origin.
- Define an explicit origin whitelist.
- Wildcard is strictly forbidden when `credentials: true`.

## Race Conditions
- All check-then-act operations (balance, stock, coupon) must be atomic.
- Use `SELECT ... FOR UPDATE` or atomic `UPDATE ... WHERE` with conditions.
- Never read a value, check it in application code, then write it back separately.

## JWT & Sessions
- Access token expiry: max 15 minutes.
- Implement refresh token rotation.
- Tokens must be revocable via blacklist or versioning.
- Set algorithm explicitly. Never allow `"none"`.
- Invalidate tokens on logout.

## Rate Limiting
- Rate-limit all auth endpoints: login, register, forgot-password.
- Use dual-layer limiting: IP-based and user-based.
- Store rate-limit state in Redis, not in-memory.
- Return `Retry-After` header on limit hit.

## Error Handling
- Never expose stack traces in production responses.
- Return generic error messages to client, log details server-side only.
- Wrap all async handlers in try-catch or use Express 5 async propagation.
- Webhook handlers must have their own error handling.

## Currency
- Never use floating-point for money.
- Store and compute all amounts as integer cents.
- Convert to decimal only in the presentation layer.

## Docker & Network
- Never expose database or Redis ports to the host.
- Use `expose` instead of `ports` for internal services.
- Run containers as non-root user.

## TLS
- Enforce HTTPS in production.
- Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` in production.
- Enable HSTS.

## Database Integrity
- Define NOT NULL, DEFAULT, and CHECK constraints on all columns.
- Enforce foreign key constraints.
- Prefer soft-delete over hard-delete.

## Static Files
- Serve only a dedicated public directory.
- Set `dotfiles: "deny"` on static middleware.
- Verify `.env`, `package.json`, `node_modules` are not accessible.

## N+1 & Performance
- Fetch related data with JOIN or eager loading, never in loops.
- Always apply LIMIT and pagination on list endpoints.
- Prefer cursor-based pagination for large datasets.

## Webhooks
- Verify webhook signatures before processing.
- Use raw body for signature verification, not parsed JSON.
- Make webhook handlers idempotent. Deduplicate by event ID.
