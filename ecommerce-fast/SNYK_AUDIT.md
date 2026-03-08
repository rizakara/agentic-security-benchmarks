# Security Vulnerability Report
**Source:** Snyk Code Analysis  
**Project:** ecommerce-fast

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 High | 2 |
| 🟡 Medium | 1 |
| 🔵 Low | 6 |

---

## High Severity

### 1. Hardcoded Non-Cryptographic Secret
- **CWE:** CWE-547
- **Score:** 820
- **File:** `ecommerce-fast/src/db/seeds/01_admin_user.js` (line 4)
- **Description:** Avoid hardcoding values that are meant to be secret. Found a hardcoded string used in `bcrypt.hash`.
- **Code:**
  ```js
  const passwordHash = await bcrypt.hash('admin123', 12);
  ```

---

### 2. Hardcoded Non-Cryptographic Secret
- **CWE:** CWE-547
- **Score:** 770
- **File:** `ecommerce-fast/src/config.js` (lines 12–15)
- **Description:** Avoid hardcoding values that are meant to be secret. Found a hardcoded string used as a fallback JWT secret.
- **Code:**
  ```js
  password: process.env.DB_PASSWORD || 'postgres',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  ```

---

## Medium Severity

### 3. Allocation of Resources Without Limits for Login Operations
- **CWE:** CWE-770
- **Score:** 557
- **File:** `ecommerce-fast/src/routes/auth.js` (lines 60–64)
- **Description:** Call to `bcrypt.compare` performs user authentication but is not protected by any rate-limiting mechanism. This may enable attackers to brute-force users' passwords. Consider using a rate-limiting middleware such as `express-rate-limit`.
- **Code:**
  ```js
  const valid = await bcrypt.compare(password, user.password_hash);
  ```

---

## Low Severity

### 4. Improper Type Validation — Register Route (email)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-fast/src/routes/auth.js` (lines 29–33)
- **Description:** The `email` value from `req.body` can be controlled by the user. An attacker may craft object properties to crash the application or bypass its logic. Consider checking the type of the object before calling `.toLowerCase()`.
- **Code:**
  ```js
  const existing = await db('users').where('email', email.toLowerCase()).first();
  ```

---

### 5. Improper Type Validation — Register Route (insert)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-fast/src/routes/auth.js` (lines 38–41)
- **Description:** Same as above — the `email` value is used again without type validation prior to insert.
- **Code:**
  ```js
  const passwordHash = await bcrypt.hash(password, 12);
  email: email.toLowerCase(),
  ```

---

### 6. Improper Type Validation — Login Route (email)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-fast/src/routes/auth.js` (lines 55–59)
- **Description:** The `email` value from `req.body` in the login route is used without type validation.
- **Code:**
  ```js
  const user = await db('users').where('email', email.toLowerCase()).first();
  ```

---

### 7. Improper Type Validation — Products Route (category)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-fast/src/routes/products.js` (lines 25–29)
- **Description:** The `category` value from `req.query` can be controlled by the user and is used without type validation.
- **Code:**
  ```js
  query = query.where('category', req.query.category);
  ```

---

### 8. Improper Type Validation — Products Route (search)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-fast/src/routes/products.js` (lines 26–30)
- **Description:** The `search` value from `req.query` can be controlled by the user and is used without type validation.
- **Code:**
  ```js
  const term = `%${req.query.search}%`;
  ```

---

### 9. Use of Hardcoded Credentials
- **CWE:** CWE-798
- **Score:** 414
- **File:** `ecommerce-fast/src/db/seeds/01_admin_user.js` (lines 5–8)
- **Description:** Do not hardcode credentials in code. Found hardcoded credential used in `insert`.
- **Code:**
  ```js
  const passwordHash = await bcrypt.hash('admin123', 12);
  await knex('users').insert({
    email: 'admin@example.com',
  ```

---