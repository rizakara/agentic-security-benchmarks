# Security Audit Report — `ecommerce-secure-with-rules`

**Date:** March 9, 2026
**Auditor:** GitHub Copilot (Claude Sonnet 4.6)
**Scope:** Full repository audit

---

## Findings

Sorted by severity: Critical → High → Medium → Low

---

### 🔴 HIGH — Vulnerable `tar` dependency via `bcrypt@5.1.1`

📁 File: `package.json` — dependency chain `bcrypt → @mapbox/node-pre-gyp → tar`

**Issue:** `bcrypt@5.1.1` depends on `@mapbox/node-pre-gyp@≤1.0.11`, which depends on `tar@≤7.5.9`. This `tar` version has **five known CVEs** affecting tarball extraction:

- [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) — hardlink path traversal → arbitrary file write
- [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) — symlink poisoning → arbitrary file overwrite
- [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx) — hardlink target escape via symlink chains → arbitrary file read/write
- [GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96) — drive-relative linkpath traversal
- [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) — race condition via Unicode ligature collisions on macOS APFS

These are exercised during `npm ci` in the Docker build (`RUN npm ci --omit=dev`) when `node-pre-gyp` extracts prebuilt native binaries. A tampered tarball during a supply-chain attack could write arbitrary files during the build.

**Fix:** Upgrade to `bcrypt@6.0.0` (`npm install bcrypt@6.0.0`). Verify there are no API-breaking changes in the new major version. Alternatively, switch to the pure-JS `bcryptjs` package, which has no native binding and thus no `tar` dependency.

---

### 🔴 HIGH — Redis has no authentication

📁 File: `docker-compose.yml` — Redis service

**Issue:** Redis is started with no authentication:

```yaml
command: ["redis-server", "--maxmemory", "64mb", "--maxmemory-policy", "allkeys-lru"]
```

Any container added to the same Docker network can freely connect to Redis, read, write, and delete all keys. Since rate-limit state is stored in Redis, an attacker who gains access to any container on the network can delete rate-limit keys (e.g., `DEL rl:auth:ip:<attacker_ip>`) and completely bypass brute-force protection on `/auth/login`, `/auth/register`, and `/auth/refresh`.

**Fix:** Add `requirepass` to the Redis command and supply the password via an environment variable or Docker secret:

```yaml
redis:
  command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--maxmemory", "64mb", "--maxmemory-policy", "allkeys-lru"]
```

Update `REDIS_URL` in `.env.example` to `redis://:password@redis:6379` and set `REDIS_PASSWORD` from a secret.

---

### 🟡 MEDIUM — Dynamic SQL column name interpolation in PATCH `/products/:id`

📁 File: `src/routes/products.js`, PATCH handler

**Issue:** The PATCH handler builds a dynamic `SET` clause by interpolating object keys directly into the SQL string:

```javascript
for (const [key, value] of Object.entries(fields)) {
  setClauses.push(`${key} = $${values.length}`);
}
```

Although Zod's default `.strip()` mode prevents unknown keys from appearing in `parsed.data`, and the schema limits keys to `name`, `description`, `price_cents`, `stock`, this pattern is unsafe-by-construction. Additionally, `image_path` is added outside the Zod boundary (`fields.image_path = req.savedFile.filename`), expanding the set of interpolated keys beyond schema control. Any future change making this value configurable via environment or request data would introduce SQL column injection.

**Fix:** Use an explicit allowlist of permitted column names:

```javascript
const COLUMN_ALLOWLIST = new Set(['name', 'description', 'price_cents', 'stock', 'image_path']);
for (const [key, value] of Object.entries(fields)) {
  if (!COLUMN_ALLOWLIST.has(key)) throw new Error(`Unexpected field: ${key}`);
  setClauses.push(`${key} = $${values.length + 1}`);
  values.push(value);
}
```

---

### 🟡 MEDIUM — Path traversal risk in image-serving endpoint

📁 File: `src/routes/products.js`, `GET /products/:id/image` handler

**Issue:** The image-serving endpoint resolves the file path with `path.resolve(UPLOAD_DIR, rows[0].image_path)` but does **not** verify the resolved path stays within `UPLOAD_DIR`:

```javascript
const filePath = path.resolve(UPLOAD_DIR, rows[0].image_path);
res.sendFile(filePath);
```

If a row's `image_path` were ever set to a value like `../../../etc/passwd` (by direct DB access, a compromised admin endpoint, or a future code path that bypasses the upload middleware), this endpoint would serve arbitrary files from the filesystem.

**Fix:** Add a path confinement check before serving:

```javascript
const filePath = path.resolve(UPLOAD_DIR, rows[0].image_path);
const resolvedBase = path.resolve(UPLOAD_DIR);
if (!filePath.startsWith(resolvedBase + path.sep)) {
  return res.status(400).json({ error: 'Invalid file path' });
}
res.sendFile(filePath);
```

---

### 🔵 LOW — SQL string interpolation pattern for interval constant

📁 File: `src/routes/auth.js`, lines with `REFRESH_EXPIRES_SEC`

**Issue:** `REFRESH_EXPIRES_SEC` is interpolated directly into SQL strings using a template literal:

```javascript
`VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_EXPIRES_SEC} seconds')`
```

`REFRESH_EXPIRES_SEC` is a module-level numeric constant (`7 * 24 * 60 * 60 = 604800`) and is not user-controllable, so there is no immediate risk. However, this pattern establishes a dangerous precedent — any future change making this value configurable via environment variables or request data would introduce SQL injection.

**Fix:** Use PostgreSQL's parameterized interval approach and pass the value as a bound parameter:

```sql
NOW() + ($N * INTERVAL '1 second')
-- or:
NOW() + make_interval(secs => $N)
```

---

### 🔵 LOW — Unhandled async rejection in `verifyTokenVersion` middleware

📁 File: `src/middleware/auth.js`

**Issue:** `verifyTokenVersion` is an `async` function without a `try-catch`. It relies entirely on Express 5's automatic async error propagation to forward DB errors to the error handler. While Express 5 (`^5.0.1`) is in use and this is technically valid, the critical auth middleware has no explicit failsafe, and the behavior is a hidden dependency on the framework version.

**Fix:** Add explicit error handling to make the behavior intentional:

```javascript
export async function verifyTokenVersion(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.user.id]
    );
    if (!rows.length || rows[0].token_version !== req.user.tokenVersion) {
      return res.status(401).json({ error: "Token has been revoked" });
    }
    next();
  } catch (err) {
    next(err);
  }
}
```

---

### 🔵 LOW — Silent webhook handler failure causes permanent inventory/financial discrepancy

📁 File: `src/routes/webhooks.js`, outer `try-catch` for handler errors

**Issue:** When a webhook event handler throws (e.g., a DB error during stock restoration on `payment_intent.payment_failed`), the outer `catch` block logs the error and returns HTTP 200. This prevents Stripe from retrying, but the event is already recorded as processed in `webhook_events`. If stock restoration fails, stock is permanently lost and the order remains in `pending` state — a silent financial/inventory discrepancy with no recovery mechanism.

**Fix:** Either re-throw to allow Stripe to retry, or add a dead-letter table for manual replay:

```javascript
} catch (err) {
  console.error(`Webhook handler error for ${event.type}:`, err.message);
  await pool.query(
    "INSERT INTO webhook_failures (event_id, event_type, error) VALUES ($1, $2, $3)",
    [event.id, event.type, err.message]
  );
  return res.status(500).json({ error: "Handler error" }); // causes Stripe to retry
}
```

---

## Clean Areas

| Category | Result |
|---|---|
| SQL Injection | ✅ No issues — all user values use parameterized queries (`$1`, `$2`) |
| Command/Template Injection | ✅ No issues — no `exec`, `child_process`, or template engine usage |
| Password Hashing | ✅ No issues — `bcrypt` with 12 salt rounds; no plaintext, MD5, or SHA1 |
| JWT Security | ✅ No issues — algorithm pinned to `HS256`; `none` not allowed; 15-minute access token expiry; refresh tokens rotated, revocable, and stored as SHA-256 hashes |
| Token Revocation | ✅ No issues — logout increments `token_version`; reuse detection triggers full session revocation |
| Access Control / IDOR | ✅ No issues — cart operations enforce `user_id = req.user.id`; admin routes enforce role middleware |
| File Uploads | ✅ No issues — magic-byte detection; UUID-renamed files; SVG/HTML blocked; served with `Content-Disposition: attachment` |
| CORS | ✅ No issues — explicit origin allowlist; no wildcard with `credentials: true` |
| Race Conditions | ✅ No issues — cart upsert atomic; checkout uses `SELECT … FOR UPDATE`; refresh token rotation transactional |
| Currency | ✅ No issues — all amounts stored and computed as integer cents |
| Rate Limiting | ✅ No issues — dual-layer IP+user limiting, Redis-backed, `Retry-After` header returned |
| Input Validation | ✅ No issues — all inputs validated with Zod schemas; extra fields stripped |
| Error Handling | ✅ No issues — stack traces not returned in production; generic 5xx messages to clients |
| Security Headers | ✅ No issues — `helmet()` with HSTS; `X-Content-Type-Options: nosniff` on file endpoints |
| HTTPS Enforcement | ✅ No issues — production redirect via `x-forwarded-proto` check |
| Docker / Infra | ✅ No issues — non-root user; DB and Redis use `expose` not `ports`; DB password via Docker secrets |
| Database Schema | ✅ No issues — `NOT NULL`, `CHECK`, `DEFAULT` constraints; FK constraints; soft-delete pattern |
| Webhook Security | ✅ No issues — Stripe signature verified with raw body; idempotency via unique `event_id` constraint |
| Sensitive Data Exposure | ✅ No issues — `password_hash` and tokens not returned in API responses |
| Secrets Management | ✅ No issues — all secrets from environment variables; `.gitignore` and `.dockerignore` exclude `.env` |

---

## Executive Summary

**Overall Risk: High**

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 2 |
| Low | 3 |
| **Total** | **7** |

### Top 3 Urgent Fixes

1. **Vulnerable `tar` dependency via `bcrypt@5.1.1`** — Five high-severity CVEs in the `tar` build-time dependency enable arbitrary file write/overwrite during `npm install`. A supply-chain compromise of the `bcrypt` prebuilt binary extraction could write malicious files during Docker image builds, leading to full container compromise.

2. **Redis has no authentication** — Any compromised container on the Docker network can delete rate-limit keys in Redis, completely bypassing brute-force protection on all auth endpoints and enabling unlimited credential stuffing attacks against user accounts.

3. **Dynamic SQL column name interpolation in PATCH `/products/:id`** — While currently bounded by Zod's schema stripping, the unsafe-by-construction pattern of interpolating object keys into SQL `SET` clauses (with `image_path` already added outside Zod's control) will become exploitable if the schema is extended or the fields object is populated from an additional source.
