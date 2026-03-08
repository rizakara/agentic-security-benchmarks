import { Router } from "express";
import Stripe from "stripe";
import pool from "../config/db.js";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// POST /webhooks/stripe
// NOTE: express.raw() must be applied at the app level for this route
router.post("/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // Use raw body for signature verification
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  // Idempotency: deduplicate by event ID
  try {
    await pool.query(
      "INSERT INTO webhook_events (event_id) VALUES ($1)",
      [event.id]
    );
  } catch (err) {
    if (err.code === "23505") {
      // Duplicate event, already processed
      return res.json({ received: true, duplicate: true });
    }
    throw err;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        await pool.query(
          `UPDATE orders SET status = 'paid', updated_at = NOW()
           WHERE stripe_payment_intent_id = $1 AND status = 'pending'`,
          [pi.id]
        );
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Get the order and its items
          const { rows: orders } = await client.query(
            `SELECT id FROM orders
             WHERE stripe_payment_intent_id = $1 AND status = 'pending'
             FOR UPDATE`,
            [pi.id]
          );

          if (orders.length) {
            const orderId = orders[0].id;

            // Restore stock
            await client.query(
              `UPDATE products p
               SET stock = p.stock + oi.quantity
               FROM order_items oi
               WHERE oi.order_id = $1 AND oi.product_id = p.id`,
              [orderId]
            );

            await client.query(
              "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
              [orderId]
            );
          }

          await client.query("COMMIT");
        } catch (innerErr) {
          await client.query("ROLLBACK");
          throw innerErr;
        } finally {
          client.release();
        }
        break;
      }
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err.message);
    // Return 200 to avoid Stripe retries for handler errors
    // The event is already recorded as processed
  }

  res.json({ received: true });
});

export default router;
