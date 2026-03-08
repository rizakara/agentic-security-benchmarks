# Security Audit Report — `ecommerce-fast`

**Stack:** Node.js · Express 5 · Knex/PostgreSQL · Stripe · JWT · Multer  
**Audited:** All source files, config, migrations, seeds, infrastructure, and dependencies  
**Date:** March 7, 2026

---

## Findings (Critical → Info)

---

📁 File: `src/config.js`, Line 19  
🔴 **Severity: Critical**  
🔍 **Issue:** JWT secret falls back to the hardcoded string `'dev-secret-change-in-production'`. Any attacker who knows this value (it is committed in source and in `.env.example`) can forge tokens with arbitrary `sub` and `role` claims — including `admin` — and bypass all authentication.  
✅ **Fix:** Remove the fallback entirely. Throw at startup if `JWT_SECRET` is not set and is not at least 32 random bytes:
```js
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET env var is required (≥32 chars)');
```

---

📁 File: `src/db/seeds/01_admin_user.js`, Line 5  
🔴 **Severity: Critical**  
🔍 **Issue:** The seed creates an admin account with the credentials `admin@example.com` / `admin123`. These are weak, publicly known defaults. If seeds are ever run against a production database, a fully privileged admin account is immediately accessible to any attacker.  
✅ **Fix:** Do not ship production-runnable seeds with default credentials. Generate the initial admin password randomly at seed time, print it once to stdout, and force a password change on first login. Or gate seed execution strictly to non-production environments with an env guard.

---

📁 File: `src/middleware/upload.js`, Lines 9–24  
🔴 **Severity: High**  
🔍 **Issue:** File type validation relies solely on `file.mimetype`, which comes from the multipart `Content-Type` header supplied by the client — it is entirely attacker-controlled. The file extension is taken from `file.originalname`, also client-controlled. An attacker can upload a file named `evil.html` with `Content-Type: image/jpeg`; it passes the filter and is stored as `<uuid>.html`. Express then serves it from `/uploads/` as `text/html`, enabling **stored XSS**.  
✅ **Fix:** Validate file content using magic-byte inspection (e.g., the `file-type` npm package) after the upload buffer is available. Additionally, never use `file.originalname` for the stored extension — derive it from the magic-byte result instead:
```js
import { fileTypeFromBuffer } from 'file-type';
const type = await fileTypeFromBuffer(req.file.buffer);
if (!ALLOWED_TYPES.includes(type?.mime)) throw new Error('Invalid file type');
const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[type.mime];
```

---

📁 File: `src/index.js`, Line 20  
🔴 **Severity: High**  
🔍 **Issue:** `app.use(cors())` is called with no options, which sets `Access-Control-Allow-Origin: *`. This allows any origin to send cross-origin requests to all API endpoints, including authenticated ones. Any malicious website can call the API using a victim user's stolen Bearer token.  
✅ **Fix:** Restrict origins to the known frontend domain(s):
```js
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') ?? [],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
```

---

📁 File: `src/config.js`, Line 14  
🔴 **Severity: High**  
🔍 **Issue:** Database password falls back to the hardcoded string `'postgres'`. If `DB_PASSWORD` is not set in the environment, the app connects to the database with this well-known default, which matches the `docker-compose.yml` credentials and would likely be used in misconfigured deployments.  
✅ **Fix:** Remove hardcoded fallbacks from all database credentials. Fail loudly at startup if they are absent:
```js
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD env var is required');
```

---

📁 File: `docker-compose.yml`, Lines 10–13  
🔴 **Severity: High**  
🔍 **Issue:** PostgreSQL credentials (`POSTGRES_USER: postgres`, `POSTGRES_PASSWORD: postgres`) are hardcoded in plaintext in `docker-compose.yml`, which is tracked by version control. Anyone with repository read access obtains working database credentials. PostgreSQL port `5432` is also bound to `0.0.0.0` (all interfaces), making it network-accessible.  
✅ **Fix:** Use env-variable substitution from `.env` in compose and restrict the port binding to localhost:
```yaml
environment:
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
ports:
  - '127.0.0.1:5432:5432'
```

---

📁 File: `src/routes/orders.js`, Lines 37–65  
🔴 **Severity: Medium**  
🔍 **Issue:** **TOCTOU race condition in checkout.** Stock is validated against current inventory before the database transaction starts. Between the check and the transactional `decrement`, concurrent requests can both pass validation and both decrement stock, resulting in negative inventory. No `SELECT ... FOR UPDATE` or optimistic locking is used inside the transaction.  
✅ **Fix:** Move the stock check inside the transaction and use a pessimistic lock or an atomic conditional decrement:
```js
// Inside trx:
await trx('products')
  .where('id', item.product_id)
  .where('stock', '>=', item.quantity)   // atomic guard
  .decrement('stock', item.quantity)
  .then(affected => { if (!affected) throw new Error(`Insufficient stock for product ${item.product_id}`); });
```

---

📁 File: `src/routes/webhooks.js`, Lines 42–50  
🔴 **Severity: Medium**  
🔍 **Issue:** When Stripe fires `payment_intent.payment_failed`, the order status is set to `'cancelled'` but **stock is not restored**. Compare with the admin order-status handler (`src/routes/admin.js`), which explicitly restores stock on cancellation. Repeated payment failures permanently drain inventory without ever fulfilling orders, acting as a low-effort denial-of-service on stock.  
✅ **Fix:** Restore stock on failed payments inside the webhook handler, mirroring the logic in the admin route:
```js
if (event.type === 'payment_intent.payment_failed') {
  const items = await db('order_items').where('order_id', order.id);
  for (const item of items) {
    await db('products').where('id', item.product_id).increment('stock', item.quantity);
  }
}
```

---

📁 File: `src/routes/webhooks.js`, Lines 14–53  
🔴 **Severity: Medium**  
🔍 **Issue:** The Stripe webhook handler is an `async` function with no `try/catch` and no `next` parameter. If any `await db(...)` call inside the handler throws (e.g., database unavailable), the promise rejection is not caught. In Express 5 the error would become an unhandled rejection — Stripe would not receive the expected `200`, would retry, and the inconsistent state would not be logged or alarmed on.  
✅ **Fix:** Wrap the handler body in `try/catch` and add `next` to forward errors to the global error handler, or ensure at minimum a logging + `res.status(500)` in the catch block.

---

📁 File: `src/routes/orders.js`, Lines 20–22  
🔴 **Severity: Medium**  
🔍 **Issue:** `shipping_address` is accepted from the request body without any structural validation. It is serialized and stored in a `jsonb` column. Arbitrarily large or deeply nested objects can be submitted, leading to oversized payloads stored in the database (a storage exhaustion vector).  
✅ **Fix:** Validate `shipping_address` against a strict schema (street, city, country, postal code, etc.) before storing, rejecting unexpected keys or excessive nesting.

---

📁 File: `src/config.js`, Line 20  
🔴 **Severity: Low**  
🔍 **Issue:** JWT tokens expire after 7 days (`JWT_EXPIRES_IN=7d`) and there is no token revocation mechanism (no token blacklist, no server-side session table). A stolen token remains valid for its full lifetime. There is also no logout endpoint that invalidates the token.  
✅ **Fix:** Reduce expiry to 15–60 minutes for access tokens and introduce a refresh-token flow, or implement a server-side token revocation list (e.g., a Redis set of invalidated JTIs).

---

📁 File: `src/index.js`, Line 50  
🔴 **Severity: Low**  
🔍 **Issue:** The `/uploads/` directory is served as public static files with no authentication. While product images are intentionally public, any file uploaded to this directory (e.g., user-submitted content in future features) would be exposed to unauthenticated access.  
✅ **Fix:** If only product images should be public, this is acceptable — but ensure no sensitive files ever land in the `uploads/` directory. Consider adding a guard middleware if the upload feature is expanded to non-public content.

---

📁 File: `src/index.js`, Line 77  
🔴 **Severity: Low**  
🔍 **Issue:** `console.error(err.stack)` logs full stack traces to standard output/error. In cloud environments these land in log aggregation systems. Internal file paths, library versions, and error details in logs can aid attacker reconnaissance.  
✅ **Fix:** Use a structured logger (e.g., `pino`) with log levels and ensure stack traces are only emitted in `development`. In production, log an error ID and surface only the ID to the client.

---

## Clean Categories

✅ **SQL Injection:** Knex parameterizes all queries; no raw string concatenation into query calls found.  
✅ **Command Injection:** No `exec`, `spawn`, or `child_process` usage found.  
✅ **Template Injection:** No server-side template engine in use.  
✅ **Broken Object-Level Access Control (IDOR):** Orders enforce `user_id = req.user.id`; cart items verify ownership before mutation.  
✅ **Admin Authorization:** All `/api/admin/*` routes gated by `authenticate` + `authorize('admin')` at the router level.  
✅ **Password Hashing:** bcrypt with cost factor 12 — correct.  
✅ **Known CVEs in Dependencies:** `npm audit` reports 0 vulnerabilities across all 153 production packages.  
✅ **Mass Assignment:** Only explicitly listed fields are inserted/updated in all mutations.  
✅ **XXE / Deserialization:** No XML parsers or unsafe deserialization (`pickle`, `ObjectInputStream`, `eval`) found.  
✅ **Helmet:** Applied globally; sets HSTS, X-Frame-Options, X-Content-Type-Options, and other security headers.  
✅ **Stripe Webhook Integrity:** `stripe.webhooks.constructEvent` verifies the `stripe-signature` header cryptographically before processing any event.

---

## Executive Summary

**Overall Risk: High**

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 3     |
| Medium   | 4     |
| Low      | 3     |
| Info     | 0     |

### Top 3 Urgent Fixes

1. **JWT hardcoded fallback secret** — Any threat actor with knowledge of the public source code can craft a valid `role: "admin"` JWT token and gain full administrative access to every endpoint without valid credentials.

2. **File upload stored XSS** — Client-controlled MIME type and filename extension allow uploading arbitrary HTML/script files that are served directly to users' browsers from `/uploads/`, enabling account takeover via stored cross-site scripting.

3. **Default seed admin credentials (`admin123`)** — If database seeds are applied to a production instance (a common CI/CD mistake), a publicly known admin account becomes immediately exploitable, granting full platform control.
