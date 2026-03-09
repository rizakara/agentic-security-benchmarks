# Security Vulnerability Report
**Source:** Snyk Code Analysis  
**Project:** ecommerce-secure-with-rules

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 High | 1 |
| 🟡 Medium | 3 |
| 🔵 Low | 1 |

---

## High Severity

### 1. Path Traversal
- **CWE:** CWE-23
- **Score:** 805
- **File:** `ecommerce-secure-with-rules/src/routes/products.js` (lines 163–166)
- **Description:** Unsanitized input from an HTTP parameter flows into sendFile, where it is used as a path. This may result in a Path Traversal vulnerability and allow an attacker to read arbitrary files.
- **Code:**
  ```js
  const filePath = path.resolve(UPLOAD_DIR, rows[0].image_path);
  res.set("Content-Disposition", "attachment");
  res.set("X-Content-Type-Options", "nosniff");
  res.sendFile(filePath);
  ```

---

## Medium Severity

### 2. Use of Externally-Controlled Format String
- **CWE:** CWE-134
- **Score:** 510
- **File:** `ecommerce-secure-with-rules/src/middleware/errorHandler.js` (lines 1–2)
- **Description:** Unsanitized user input from the request URL flows into error, where it is used as a format string. This may allow a user to inject unexpected content into an application log.
- **Code:**
  ```js
  export function errorHandler(err, req, res, _next) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.message, err.stack);
  ```

---

### 3. Use of Externally-Controlled Format String
- **CWE:** CWE-134
- **Score:** 510
- **File:** `ecommerce-secure-with-rules/src/routes/webhooks.js` (lines 87–91)
- **Description:** Unsanitized user input from the HTTP request body flows into error, where it is used as a format string. This may allow a user to inject unexpected content into an application log.
- **Code:**
  ```js
      break;
    }
  }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err.message);
  ```

---

### 4. Allocation of Resources Without Limits or Throttling
- **CWE:** CWE-770
- **Score:** 555
- **File:** `ecommerce-secure-with-rules/src/routes/products.js` (lines 150–154)
- **Description:** Expensive operation (a file system operation) is performed by an endpoint handler which does not use a rate-limiting mechanism. It may enable the attackers to perform Denial-of-service attacks. Consider using a rate-limiting middleware such as express-limit.
- **Code:**
  ```js
  // GET /products/:id/image — serve with safe headers
  router.get(
    "/:id/image",
    validate(productIdParamSchema, "params"),
    async (req, res) => {
  ```

---

## Low Severity

### 5. Improper Type Validation — Products Route (search)
- **CWE:** CWE-1287
- **Score:** 450
- **File:** `ecommerce-secure-with-rules/src/routes/products.js` (lines 15–19)
- **Description:** The type of this object, coming from query and the value of its search property can be controlled by the user. An attacker may craft the properties of the object to crash the application or bypass its logic. Consider checking the type of the object.
- **Code:**
  ```js
  const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
  // GET /products — public, cursor-based pagination
  router.get("/", validate(productListQuerySchema, "query"), async (req, res) => {
    const { cursor, limit, search } = req.query;
  ```

---

## Dependency Vulnerabilities

---

**H — bcrypt@5.1.1**
- 6 transitive issues
- Priority Score (MAX): 813
- Fixable issues: 6
- Issues with no supported fix: 0

> Upgrading to bcrypt@6.0.0 fixes 6 issues — Major Upgrade

| Severity | Issue | Dependency | CWE | CVSS | Priority Score |
|----------|-------|------------|-----|------|----------------|
| H | Directory Traversal | tar@6.2.1 | CWE-22 | 8.4 | 813 |
| H | Symlink Attack | tar@6.2.1 | CWE-22 + 1 more | 8.2 | 803 |
| M | Improper Handling of Unicode Encoding | tar@6.2.1 | CWE-176 + 1 more | 6.4 | 641 |
| M | Missing Release of Resource after Effective Lifetime | inflight@1.0.6 | CWE-772 | 6.2 | 631 |
| M | Directory Traversal | tar@6.2.1 | CWE-22 | 6.0 | 621 |
| M | Directory Traversal | tar@6.2.1 | CWE-22 | 6.2 | 524 |

---

**C — multer@1.4.5-lts.2**
- 7 direct issues
- Priority Score (MAX): 756
- Fixable issues: 7
- Issues with no supported fix: 0

> Upgrading to multer@2.0.0 fixes 2 issues — Major Upgrade

| Severity | Issue | CWE | CVSS | Priority Score |
|----------|-------|-----|------|----------------|
| H | Uncaught Exception | CWE-248 | 8.7 | 756 |
| H | Missing Release of Memory after Effective Lifetime | CWE-401 | 8.7 | 649 |

> Upgrading to multer@2.0.1 fixes 1 issue — Major Upgrade

| Severity | Issue | CWE | CVSS | Priority Score |
|----------|-------|-----|------|----------------|
| C | Uncaught Exception | CWE-248 | 9.2 | 674 |

> Upgrading to multer@2.0.2 fixes 1 issue — Major Upgrade

| Severity | Issue | CWE | CVSS | Priority Score |
|----------|-------|-----|------|----------------|
| H | Uncaught Exception | CWE-248 | 8.7 | 649 |

> Upgrading to multer@2.1.0 fixes 2 issues — Major Upgrade

| Severity | Issue | CWE | CVSS | Priority Score |
|----------|-------|-----|------|----------------|
| H | Incomplete Cleanup | CWE-459 | 8.7 | 721 |
| H | Missing Release of Resource after Effective Lifetime | CWE-772 | 8.7 | 721 |

> Upgrading to multer@2.1.1 fixes 1 issue — Major Upgrade

| Severity | Issue | CWE | CVSS | Priority Score |
|----------|-------|-----|------|----------------|
| H | Uncontrolled Recursion | CWE-674 | 8.7 | 721 |
