import { Router } from "express";
import pool from "../config/db.js";
import { authenticate, verifyTokenVersion, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  updateOrderStatusSchema,
  orderIdParamSchema,
  orderListQuerySchema,
} from "../schemas/admin.js";

const router = Router();

router.use(authenticate, verifyTokenVersion, requireRole("admin"));

// GET /admin/orders — cursor-based, filterable by status
router.get("/orders", validate(orderListQuerySchema, "query"), async (req, res) => {
  const { cursor, limit, status } = req.query;
  const params = [];
  const conditions = [];

  if (cursor) {
    params.push(cursor);
    conditions.push(`o.id < $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT o.id, o.user_id, o.status, o.total_cents, o.stripe_payment_intent_id,
            o.created_at, o.updated_at,
       json_agg(json_build_object(
         'product_id', oi.product_id,
         'quantity', oi.quantity,
         'price_cents', oi.price_cents
       )) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     ${where}
     GROUP BY o.id
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $${params.length}`,
    params
  );

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  res.json({ orders: rows, nextCursor });
});

// GET /admin/orders/:id
router.get(
  "/orders/:id",
  validate(orderIdParamSchema, "params"),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT o.id, o.user_id, o.status, o.total_cents, o.stripe_payment_intent_id,
              o.created_at, o.updated_at,
         json_agg(json_build_object(
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price_cents', oi.price_cents
         )) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    res.json(rows[0]);
  }
);

// PATCH /admin/orders/:id — update status
router.patch(
  "/orders/:id",
  validate(orderIdParamSchema, "params"),
  validate(updateOrderStatusSchema),
  async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, user_id, status, total_cents, updated_at`,
      [req.body.status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    res.json(rows[0]);
  }
);

// GET /admin/stats — dashboard summary
router.get("/stats", async (_req, res) => {
  const [ordersResult, revenueResult, usersResult] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM orders GROUP BY status`
    ),
    pool.query(
      `SELECT COALESCE(SUM(total_cents), 0)::bigint AS total_revenue_cents
       FROM orders WHERE status IN ('paid', 'shipped', 'delivered')`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL`
    ),
  ]);

  res.json({
    orders_by_status: ordersResult.rows,
    total_revenue_cents: revenueResult.rows[0].total_revenue_cents,
    total_users: usersResult.rows[0].count,
  });
});

export default router;
