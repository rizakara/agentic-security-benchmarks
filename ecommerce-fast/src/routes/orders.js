const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const { authenticate } = require('../middleware/auth');

const router = Router();

let stripe;
if (config.stripe.secretKey) {
  stripe = require('stripe')(config.stripe.secretKey);
}

router.use(authenticate);

// POST /api/orders/checkout — create order from cart + Stripe payment intent
router.post('/checkout', async (req, res, next) => {
  try {
    const { shipping_address } = req.body;
    if (!shipping_address) {
      return res.status(400).json({ error: 'shipping_address is required' });
    }

    const cartItems = await db('cart_items')
      .join('products', 'cart_items.product_id', 'products.id')
      .where('cart_items.user_id', req.user.id)
      .select(
        'cart_items.quantity',
        'products.id as product_id',
        'products.name',
        'products.price',
        'products.stock'
      );

    if (!cartItems.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Verify stock
    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        return res.status(400).json({
          error: `Insufficient stock for "${item.name}". Available: ${item.stock}`,
        });
      }
    }

    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalFixed = parseFloat(total.toFixed(2));

    // Create Stripe payment intent if configured
    let paymentIntent = null;
    if (stripe) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalFixed * 100), // cents
        currency: 'usd',
        metadata: { user_id: req.user.id },
      });
    }

    // Create order in a transaction
    const order = await db.transaction(async (trx) => {
      const [newOrder] = await trx('orders')
        .insert({
          user_id: req.user.id,
          total: totalFixed,
          status: stripe ? 'pending' : 'paid',
          stripe_payment_intent_id: paymentIntent?.id || null,
          shipping_address: JSON.stringify(shipping_address),
        })
        .returning('*');

      const orderItems = cartItems.map((item) => ({
        order_id: newOrder.id,
        product_id: item.product_id,
        product_name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));

      await trx('order_items').insert(orderItems);

      // Decrement stock
      for (const item of cartItems) {
        await trx('products')
          .where('id', item.product_id)
          .decrement('stock', item.quantity);
      }

      // Clear cart
      await trx('cart_items').where('user_id', req.user.id).del();

      return newOrder;
    });

    res.status(201).json({
      order,
      client_secret: paymentIntent?.client_secret || null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders — user's orders
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const [orders, [{ count }]] = await Promise.all([
      db('orders')
        .where('user_id', req.user.id)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      db('orders').where('user_id', req.user.id).count('* as count'),
    ]);

    res.json({
      orders,
      pagination: { page, limit, total: parseInt(count, 10), pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — order detail
router.get('/:id', async (req, res, next) => {
  try {
    const order = await db('orders')
      .where({ id: req.params.id, user_id: req.user.id })
      .first();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = await db('order_items').where('order_id', order.id);
    res.json({ order, items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
