const { Router } = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();

// All cart routes require authentication
router.use(authenticate);

// GET /api/cart
router.get('/', async (req, res, next) => {
  try {
    const items = await db('cart_items')
      .join('products', 'cart_items.product_id', 'products.id')
      .where('cart_items.user_id', req.user.id)
      .select(
        'cart_items.id',
        'cart_items.quantity',
        'products.id as product_id',
        'products.name',
        'products.price',
        'products.image_url',
        'products.stock'
      );

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    res.json({ items, total: parseFloat(total.toFixed(2)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/cart — add item
router.post('/', async (req, res, next) => {
  try {
    const { product_id, quantity = 1 } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });

    const product = await db('products').where({ id: product_id, active: true }).first();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const existing = await db('cart_items')
      .where({ user_id: req.user.id, product_id })
      .first();

    if (existing) {
      const newQty = existing.quantity + quantity;
      if (newQty > product.stock) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
      await db('cart_items').where('id', existing.id).update({ quantity: newQty, updated_at: db.fn.now() });
    } else {
      await db('cart_items').insert({ user_id: req.user.id, product_id, quantity });
    }

    res.status(201).json({ message: 'Item added to cart' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/cart/:id — update quantity
router.put('/:id', async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    const item = await db('cart_items')
      .where({ id: req.params.id, user_id: req.user.id })
      .first();
    if (!item) return res.status(404).json({ error: 'Cart item not found' });

    const product = await db('products').where('id', item.product_id).first();
    if (quantity > product.stock) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    await db('cart_items').where('id', req.params.id).update({ quantity, updated_at: db.fn.now() });
    res.json({ message: 'Cart updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cart/:id — remove item
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db('cart_items')
      .where({ id: req.params.id, user_id: req.user.id })
      .del();
    if (!deleted) return res.status(404).json({ error: 'Cart item not found' });
    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cart — clear cart
router.delete('/', async (req, res, next) => {
  try {
    await db('cart_items').where('user_id', req.user.id).del();
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
