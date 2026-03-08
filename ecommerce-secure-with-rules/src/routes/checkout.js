import { Router } from "express";
import Stripe from "stripe";
import pool from "../config/db.js";
import { authenticate, verifyTokenVersion } from "../middleware/auth.js";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /checkout — create order + Stripe PaymentIntent atomically
router.post("/", authenticate, verifyTokenVersion, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock cart items and their products atomically
    const { rows: cartItems } = await client.query(
      `SELECT ci.id AS cart_item_id, ci.quantity, ci.product_id,
              p.name, p.price_cents, p.stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id AND p.deleted_at IS NULL
       WHERE ci.user_id = $1
       FOR UPDATE OF ci, p`,
      [req.user.id]
    );

    if (!cartItems.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Validate stock for all items
    for (const item of cartItems) {
      if (item.stock < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Insufficient stock for "${item.name}". Available: ${item.stock}`,
        });
      }
    }

    // Calculate total in integer cents
    const totalCents = cartItems.reduce(
      (sum, item) => sum + item.price_cents * item.quantity,
      0
    );

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      metadata: { user_id: req.user.id },
    });

    // Create order
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (user_id, total_cents, stripe_payment_intent_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [req.user.id, totalCents, paymentIntent.id]
    );
    const orderId = orderRows[0].id;

    // Create order items and decrement stock atomically
    for (const item of cartItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price_cents)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price_cents]
      );

      const { rowCount } = await client.query(
        `UPDATE products SET stock = stock - $1
         WHERE id = $2 AND stock >= $1`,
        [item.quantity, item.product_id]
      );

      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Stock changed for "${item.name}", please retry`,
        });
      }
    }

    // Clear cart
    await client.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

    await client.query("COMMIT");

    res.status(201).json({
      order_id: orderId,
      total_cents: totalCents,
      client_secret: paymentIntent.client_secret,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// GET /checkout/orders — user's own orders
router.get("/orders", authenticate, verifyTokenVersion, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.status, o.total_cents, o.created_at,
       json_agg(json_build_object(
         'product_id', oi.product_id,
         'quantity', oi.quantity,
         'price_cents', oi.price_cents
       )) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json({ orders: rows });
});

export default router;
