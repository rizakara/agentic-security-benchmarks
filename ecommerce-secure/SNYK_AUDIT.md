# Security Vulnerability Report
**Source:** Snyk Code Analysis  
**Project:** ecommerce-secure

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 High | 1 |
| 🔵 Low | 5 |

---

## High Severity

### 1. Hardcoded Non-Cryptographic Secret
- **CWE:** CWE-547
- **Score:** 820
- **File:** `ecommerce-secure/scripts/seed.js` (lines 12–15)
- **Description:** Avoid hardcoding values that are meant to be secret. Found a hardcoded string used in bcrypt.hash.
- **Code:**
  ```js
  const adminExists = await db('users').where({ email: 'admin@example.com' }).first();
  if (!adminExists) {
    const hash = await bcrypt.hash('Admin123!', 12);
  ```

---

## Low Severity

### 2. Improper Type Validation — Register Route (email lookup)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-secure/src/controllers/auth.js` (lines 15–19)
- **Description:** The type of this object, coming from body and the value of its toLowerCase property can be controlled by the user. An attacker may craft the properties of the object to crash the application or bypass its logic. Consider checking the type of the object.
- **Code:**
  ```js
  const { email, password, name } = req.body;
  const existing = await db('users').where({ email: email.toLowerCase() }).first();
  ```

---

### 3. Improper Type Validation — Register Route (insert)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-secure/src/controllers/auth.js` (lines 24–27)
- **Description:** The type of this object, coming from body and the value of its toLowerCase property can be controlled by the user. An attacker may craft the properties of the object to crash the application or bypass its logic. Consider checking the type of the object.
- **Code:**
  ```js
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const [user] = await db('users')
    .insert({ email: email.toLowerCase(),
  ```

---

### 4. Improper Type Validation — Login Route (email)
- **CWE:** CWE-1287
- **Score:** 460
- **File:** `ecommerce-secure/src/controllers/auth.js` (lines 42–46)
- **Description:** The type of this object, coming from body and the value of its toLowerCase property can be controlled by the user. An attacker may craft the properties of the object to crash the application or bypass its logic. Consider checking the type of the object.
- **Code:**
  ```js
  const { email, password } = req.body;
  const user = await db('users').where({ email: email.toLowerCase() }).first();
  ```

---

### 5. Use of Hardcoded Credentials
- **CWE:** CWE-798
- **Score:** 414
- **File:** `ecommerce-secure/scripts/seed.js` (lines 13–17)
- **Description:** Do not hardcode credentials in code. Found hardcoded credential used in insert.
- **Code:**
  ```js
  const adminExists = await db('users').where({ email: 'admin@example.com' }).first();
  if (!adminExists) {
    const hash = await bcrypt.hash('Admin123!', 12);
    await db('users').insert({ email: 'admin@example.com',
  ```

---

### 6. Improper Type Validation — Products Route (search)
- **CWE:** CWE-1287
- **Score:** 410
- **File:** `ecommerce-secure/src/controllers/products.js` (lines 2–6)
- **Description:** The type of this object, coming from query and the value of its search property can be controlled by the user. An attacker may craft the properties of the object to crash the application or bypass its logic. Consider checking the type of the object.
- **Code:**
  ```js
  const { page = 1, limit = 20, category, search, sort = 'created_at', order = 'desc' } = req.query;
  ```

---
