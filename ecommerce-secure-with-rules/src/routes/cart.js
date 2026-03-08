import { Router } from "express";
import pool from "../config/db.js";
import { authenticate, verifyTokenVersion } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { addToCartSchema, updateCartItemSchema, cartItemParamSchema } from "../schemas/cart.js";

const router = Router();

router.use(authenticate, verifyTokenVersion);

// GET /cart
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ci.id, ci.quantity, p.id AS product_id, p.name, p.price_cents, p.stock
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id AND p.deleted_at IS NULL
     WHERE ci.user_id = $1
     ORDER BY ci.created_at`,
    [req.user.id]
  );
  res.json({ items: rows });
});

// POST /cart — add item (upsert, atomic)
router.post("/", validate(addToCartSchema), async (req, res) => {
  const { product_id, quantity } = req.body;

  // Verify product exists and has stock
  const { rows: products } = await pool.query(
    "SELECT id, stock FROM products WHERE id = $1 AND deleted_at IS NULL",
    [product_id]
  );
  if (!products.length) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Atomic upsert
  const { rows } = await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
     RETURNING id, product_id, quantity`,
    [req.user.id, product_id, quantity]
  );

  res.status(201).json(rows[0]);
});

// PATCH /cart/:itemId
router.patch("/:itemId", validate(cartItemParamSchema, "params"), validate(updateCartItemSchema), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE cart_items SET quantity = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id, product_id, quantity`,
    [req.body.quantity, req.params.itemId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Cart item not found" });
  res.json(rows[0]);
});

// DELETE /cart/:itemId
router.delete("/:itemId", validate(cartItemParamSchema, "params"), async (req, res) => {
  const { rows } = await pool.query(
    "DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.itemId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Cart item not found" });
  res.json({ message: "Item removed" });
});

export default router;
