const db = require('../models/db');
const config = require('../config');
const logger = require('../utils/logger');

const stripe = config.stripe.secretKey ? require('stripe')(config.stripe.secretKey) : null;

async function createCheckout(req, res, next) {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' });
    }

    const { shipping_address } = req.body;
    const userId = req.user.id;

    const cart = await db('carts').where({ user_id: userId }).first();
    if (!cart) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const items = await db('cart_items')
      .join('products', 'cart_items.product_id', 'products.id')
      .where({ cart_id: cart.id })
      .select('cart_items.*', 'products.price', 'products.stock', 'products.name');

    if (items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Verify stock availability
    for (const item of items) {
      if (item.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for "${item.name}". Available: ${item.stock}`,
        });
      }
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalCents = Math.round(total * 100);

    // Create order in a transaction
    const order = await db.transaction(async (trx) => {
      const [newOrder] = await trx('orders')
        .insert({
          user_id: userId,
          status: 'pending',
          total,
          shipping_address: JSON.stringify(shipping_address),
        })
        .returning('*');

      const orderItems = items.map((item) => ({
        order_id: newOrder.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_purchase: item.price,
      }));
      await trx('order_items').insert(orderItems);

      // Decrement stock
      for (const item of items) {
        await trx('products')
          .where({ id: item.product_id })
          .decrement('stock', item.quantity);
      }

      // Clear cart
      await trx('cart_items').where({ cart_id: cart.id }).del();

      return newOrder;
    });

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      metadata: { order_id: order.id, user_id: userId },
    });

    await db('orders')
      .where({ id: order.id })
      .update({ stripe_payment_intent_id: paymentIntent.id });

    logger.info('Checkout initiated', { orderId: order.id, total });

    res.status(201).json({
      order_id: order.id,
      client_secret: paymentIntent.client_secret,
      total,
    });
  } catch (err) {
    next(err);
  }
}

async function stripeWebhook(req, res, next) {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment service not configured' });
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
    } catch (err) {
      logger.warn('Webhook signature verification failed', { error: err.message });
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      await db('orders')
        .where({ stripe_payment_intent_id: paymentIntent.id })
        .update({ status: 'paid', updated_at: db.fn.now() });

      logger.info('Payment succeeded', { paymentIntentId: paymentIntent.id });
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      await db('orders')
        .where({ stripe_payment_intent_id: paymentIntent.id })
        .update({ status: 'cancelled', updated_at: db.fn.now() });

      logger.warn('Payment failed', { paymentIntentId: paymentIntent.id });
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}

async function getOrderHistory(req, res, next) {
  try {
    const orders = await db('orders')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc');

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await db('order_items')
          .join('products', 'order_items.product_id', 'products.id')
          .where({ order_id: order.id })
          .select(
            'order_items.quantity',
            'order_items.price_at_purchase',
            'products.name',
            'products.image_url'
          );
        return { ...order, items };
      })
    );

    res.json({ orders: ordersWithItems });
  } catch (err) {
    next(err);
  }
}

module.exports = { createCheckout, stripeWebhook, getOrderHistory };
