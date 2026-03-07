const { Router } = require('express');
const express = require('express');
const db = require('../db');
const config = require('../config');

const router = Router();

let stripe;
if (config.stripe.secretKey) {
  stripe = require('stripe')(config.stripe.secretKey);
}

// Stripe webhook — uses raw body
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe || !config.stripe.webhookSecret) {
      return res.status(400).json({ error: 'Stripe not configured' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        config.stripe.webhookSecret
      );
    } catch (err) {
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      await db('orders')
        .where('stripe_payment_intent_id', paymentIntent.id)
        .update({ status: 'paid', updated_at: db.fn.now() });
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      await db('orders')
        .where('stripe_payment_intent_id', paymentIntent.id)
        .update({ status: 'cancelled', updated_at: db.fn.now() });
    }

    res.json({ received: true });
  }
);

module.exports = router;
