# Security Audit Report — `ecommerce-secure`

**Stack:** Node.js / Express 5 / Knex / PostgreSQL / Stripe / JWT / Multer  
**Audit Date:** 2026-03-07

---

## Findings

---

### 🔴 Critical

---

#### CRIT-1 — Hardcoded Weak Database Password in docker-compose.yml

**📁 File:** [`docker-compose.yml`](docker-compose.yml), Lines 9 & 31  
**🔍 Issue:** The database password `"changeme"` is hardcoded in source and used for both the PostgreSQL service and the API service environment variables. Any developer with repository access or anyone who obtains the image can authenticate directly to the database.  
**✅ Fix:** Remove all hardcoded credentials from `docker-compose.yml`. Use Docker secrets or a secrets manager and reference them via `${DB_PASSWORD}` with no fallback. Rotate the password before any deployment.

---

#### CRIT-2 — Predictable JWT_SECRET Fallback Value in docker-compose.yml

**📁 File:** [`docker-compose.yml`](docker-compose.yml), Line 32  
**🔍 Issue:** `JWT_SECRET` has a predictable plaintext fallback: `${JWT_SECRET:-change-this-to-a-long-random-string-in-production}`. If the variable is unset at runtime, JWTs can be forged with the known fallback secret, granting arbitrary access to any account including admin.  
**✅ Fix:** Remove the `:-...` default entirely. `JWT_SECRET` must be a required, externally injected secret (≥ 32 random bytes). The app already throws if `JWT_SECRET` is absent from `.env` — apply the same enforcement in Compose by omitting the fallback entirely.

---

### 🟠 High

---

#### HIGH-1 — Stored XSS via File Upload Extension Bypass

**📁 File:** [`src/middleware/upload.js`](src/middleware/upload.js), Lines 12–13 & 21–23  
**🔍 Issue:** The `fileFilter` validates `file.mimetype` (a client-controlled HTTP header), but the stored filename extension is taken from `path.extname(file.originalname)` (also client-controlled). An attacker can upload an HTML or SVG payload with `Content-Type: image/jpeg` and filename `evil.html` — multer accepts it (MIME check passes), stores it as `{uuid}.html`, and `express.static` serves it with `Content-Type: text/html`, executing arbitrary JavaScript for any visitor.  
**✅ Fix:** Derive the extension from the validated MIME type rather than the original filename:

```js
const MIME_TO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
filename: (_req, file, cb) => { cb(null, `${uuidv4()}${MIME_TO_EXT[file.mimetype]}`); }
```

Additionally, serve uploads with `Content-Disposition: attachment` and an explicit, restricted `Content-Type` response header to prevent browser rendering.

---

#### HIGH-2 — SSL Certificate Validation Disabled for Production Database

**📁 File:** [`knexfile.js`](knexfile.js), Line 28  
**🔍 Issue:** `ssl: { rejectUnauthorized: false }` disables TLS certificate validation on the production database connection, allowing a man-in-the-middle attacker to intercept and tamper with all database traffic, including credentials, PII, and order data.  
**✅ Fix:** Set `rejectUnauthorized: true` and supply the DB server's CA certificate:

```js
ssl: { rejectUnauthorized: true, ca: fs.readFileSync('/path/to/server-ca.pem') }
```

---

#### HIGH-3 — Race Condition (TOCTOU) in Stock Management During Checkout

**📁 File:** [`src/controllers/checkout.js`](src/controllers/checkout.js), Lines 31–37 & 62–66  
**🔍 Issue:** Stock availability is checked outside the database transaction (lines 31–37), then decremented inside the transaction (lines 62–66) with no lower-bound guard. Two concurrent checkout requests for the same item can both pass the stock check, then both decrement — driving stock negative and overselling inventory.  
**✅ Fix:** Move the stock check inside the transaction and use a conditional `UPDATE` that enforces the constraint at the DB level:

```sql
UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?
```

Check the number of affected rows; if 0, abort the transaction and return an insufficient-stock error.

---

#### HIGH-4 — Hardcoded Admin Credentials Seeded and Logged in Plaintext

**📁 File:** [`scripts/seed.js`](scripts/seed.js), Lines 15 & 22  
**🔍 Issue:** A hardcoded admin account (`admin@example.com` / `Admin123!`) is seeded into the database and the plaintext password is printed to stdout, which appears in container logs. Any developer or log-aggregation system with access to the logs obtains the admin password.  
**✅ Fix:** Do not hardcode or log credentials. Generate a random password at seed time, print it once to the operator terminal (not persistent logs), and enforce a mandatory password change on first login. Never log plaintext credentials.

---

#### HIGH-5 — PostgreSQL Port Exposed to All Host Interfaces

**📁 File:** [`docker-compose.yml`](docker-compose.yml), Line 8  
**🔍 Issue:** PostgreSQL port 5432 is bound to all host interfaces via `ports: '5432:5432'`. In a cloud or shared environment this exposes the database directly to the network, bypassing all application-layer security controls.  
**✅ Fix:** Remove the `ports` mapping from the `db` service entirely. The API container can reach PostgreSQL over the internal Docker network by service name without publishing the port to the host.

---

### 🟡 Medium

---

#### MED-1 — CORS Defaults to Wildcard `*` in Production

**📁 File:** [`src/app.js`](src/app.js), Line 25  
**🔍 Issue:** When `CORS_ORIGIN` is not set, the CORS origin defaults to `*`. The `docker-compose.yml` production configuration does not set `CORS_ORIGIN`, so every production response is served with `Access-Control-Allow-Origin: *`. This allows any malicious website to make authenticated API calls on behalf of a visitor via their stored JWT.  
**✅ Fix:** Set `CORS_ORIGIN` to the explicit production frontend domain in `docker-compose.yml`. Use an allowlist and reject unknown origins. Never fall back to `*` in production.

---

#### MED-2 — Database Schema Contradiction: `NOT NULL` with `ON DELETE SET NULL`

**📁 File:** [`migrations/20260307000001_initial_schema.js`](migrations/20260307000001_initial_schema.js), Line 43  
**🔍 Issue:** `orders.user_id` is declared `.notNullable()` but the foreign key uses `.onDelete('SET NULL')`. PostgreSQL will reject the `SET NULL` cascade with a `NOT NULL` constraint violation when a referenced user is deleted, causing an unhandled DB error.  
**✅ Fix:** Choose one approach consistently: allow `NULL` (make `user_id` nullable to support `SET NULL` and preserve order history), or change the cascade to `.onDelete('RESTRICT')`. For an e-commerce audit trail, `SET NULL` with a nullable column is the correct choice.

---

#### MED-3 — Rate Limiter `trust proxy` Not Configured

**📁 File:** [`src/app.js`](src/app.js) (rate limiting setup, no `trust proxy`)  
**🔍 Issue:** `express-rate-limit` uses `req.ip` for client identification, but `app.set('trust proxy', ...)` is never called. When deployed behind a reverse proxy or load balancer, `req.ip` resolves to the proxy's IP, causing all clients to share one rate limit bucket. An attacker can also spoof `X-Forwarded-For` to bypass per-IP limits.  
**✅ Fix:** Add `app.set('trust proxy', 1)` (or the correct hop count) before the rate limiter middleware. Configure trusted proxy IPs explicitly. Use a Redis store for rate limit state across multiple API instances.

---

#### MED-4 — No JWT Revocation / Logout Mechanism

**📁 File:** [`src/middleware/auth.js`](src/middleware/auth.js) (no token revocation)  
**🔍 Issue:** JWTs are valid for 7 days with no revocation mechanism and no logout endpoint. A stolen or compromised token cannot be invalidated before its expiry. There is no account suspension or forced re-authentication path.  
**✅ Fix:** Implement a token blocklist (Redis or DB table) for logout and account suspension events. Alternatively, reduce JWT expiry to 15–30 minutes and issue short-lived refresh tokens with server-side revocation support.

---

### 🔵 Low

---

#### LOW-1 — Floating-Point Arithmetic for Monetary Totals

**📁 File:** [`src/controllers/checkout.js`](src/controllers/checkout.js), Line 38  
**🔍 Issue:** Monetary totals are computed using JavaScript floating-point arithmetic (`item.price * item.quantity`) before conversion to cents. IEEE 754 rounding can cause ±1 cent errors at scale (e.g., `0.1 + 0.2 ≠ 0.3`), leading to price discrepancies between the DB total and the Stripe charge amount.  
**✅ Fix:** Perform all monetary arithmetic in integer cents. Store prices as integers in the database, or use a decimal arithmetic library (e.g., `decimal.js`). Convert to cents before any addition.

---

#### LOW-2 — File Type Validated by MIME Header Only, Not Magic Bytes

**📁 File:** [`src/middleware/upload.js`](src/middleware/upload.js), Lines 21–23  
**🔍 Issue:** MIME type validation relies solely on the `Content-Type` header sent by the client — the actual file magic bytes are never inspected. A malicious client can upload arbitrary binary content by declaring a whitelisted MIME type.  
**✅ Fix:** Use a library such as [`file-type`](https://github.com/sindresorhus/file-type) to inspect the first few bytes of the file stream and verify the detected MIME type matches the declared one before accepting the upload.

---

### ℹ️ Info

---

#### INFO-1 — N+1 Query Pattern in Order History

**📁 File:** [`src/controllers/checkout.js`](src/controllers/checkout.js), `getOrderHistory`  
**🔍 Issue:** `getOrderHistory` fetches all orders then fires one additional DB query per order inside `Promise.all` to retrieve items. With many orders this is an N+1 query pattern that degrades performance under load.  
**✅ Fix:** Join `order_items` in a single query grouped by `order_id` and aggregate results in JavaScript, or use a subquery/CTE.

---

## Clean Areas

| Category | Status |
|---|---|
| SQL Injection | ✅ All queries use Knex parameterized builder. No string concatenation into raw SQL. `sort`/`order` column values are allowlisted. |
| Command Injection | ✅ No `exec()`, `spawn(shell:true)`, `child_process`, or `eval()` calls found. |
| Password Hashing | ✅ bcrypt with cost factor 12 used correctly. No MD5/SHA1 for passwords. |
| JWT Algorithm | ✅ `jwt.verify()` called with the secret — no `alg: none` bypass possible. Token expiry enforced. |
| Access Control | ✅ Admin routes apply `authenticate` + `authorize('admin')` globally via `router.use()`. Cart routes scope ownership via `cart_id` → authenticated user. |
| Input Validation | ✅ `express-validator` applied on all mutation endpoints with allowlisted sort columns, UUID path params, and bounded pagination. |
| Mass Assignment | ✅ Product update uses an explicit field allowlist instead of spreading `req.body`. |
| Sensitive Response Data | ✅ Login response selects only `id, email, name, role` — `password_hash` never returned to clients. |
| Stripe Webhook | ✅ Webhook signature verified via `stripe.webhooks.constructEvent()` before processing. Raw body correctly preserved. |
| Error Handling | ✅ Stack traces suppressed from client responses in production. Logged server-side only. |
| Dependencies | ✅ `npm audit` reports zero known CVEs. All packages are current as of audit date. |
| Docker Hardening | ✅ Container runs as non-root (`USER node`). `dumb-init` used as PID 1 for proper signal handling. |
| Secrets in Source | ✅ `.env` correctly listed in `.gitignore`. No private keys or API secrets committed to source. |

---

## Executive Summary

**Overall Risk: High**

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 5 |
| Medium | 4 |
| Low | 2 |
| Info | 1 |
| **Total** | **14** |

### Top 3 Urgent Fixes

1. **Hardcoded credentials + weak JWT_SECRET fallback (`docker-compose.yml`)** — Any developer with repository access or anyone who obtains the Docker image can fully compromise the database and forge admin-level JWTs, leading to total data breach and privilege escalation.

2. **Stored XSS via file upload extension bypass (`src/middleware/upload.js`)** — An attacker can upload an HTML payload that is stored on disk and served by `express.static` with `Content-Type: text/html`, executing arbitrary JavaScript in victims' browsers and enabling session hijacking.

3. **Race condition in stock decrement (`src/controllers/checkout.js`)** — Concurrent checkout requests bypass the stock availability check, allowing deliberate purchase of more units than exist. This drives inventory to negative values and causes direct financial and fulfillment loss.
