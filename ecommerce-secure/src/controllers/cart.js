const db = require('../models/db');

async function getOrCreateCart(userId) {
  let cart = await db('carts').where({ user_id: userId }).first();
  if (!cart) {
    [cart] = await db('carts').insert({ user_id: userId }).returning('*');
  }
  return cart;
}

async function getCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const items = await db('cart_items')
      .join('products', 'cart_items.product_id', 'products.id')
      .where({ cart_id: cart.id })
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

    res.json({ cart_id: cart.id, items, total: parseFloat(total.toFixed(2)) });
  } catch (err) {
    next(err);
  }
}

async function addItem(req, res, next) {
  try {
    const { product_id, quantity = 1 } = req.body;

    const product = await db('products').where({ id: product_id, active: true }).first();
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const cart = await getOrCreateCart(req.user.id);

    const existing = await db('cart_items')
      .where({ cart_id: cart.id, product_id })
      .first();

    if (existing) {
      const newQty = existing.quantity + quantity;
      if (product.stock < newQty) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
      await db('cart_items')
        .where({ id: existing.id })
        .update({ quantity: newQty, updated_at: db.fn.now() });
    } else {
      await db('cart_items').insert({ cart_id: cart.id, product_id, quantity });
    }

    res.json({ message: 'Item added to cart' });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const { quantity } = req.body;
    const cart = await getOrCreateCart(req.user.id);

    const item = await db('cart_items')
      .where({ id: req.params.itemId, cart_id: cart.id })
      .first();
    if (!item) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    const product = await db('products').where({ id: item.product_id }).first();
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    if (quantity <= 0) {
      await db('cart_items').where({ id: item.id }).del();
      return res.json({ message: 'Item removed from cart' });
    }

    await db('cart_items')
      .where({ id: item.id })
      .update({ quantity, updated_at: db.fn.now() });

    res.json({ message: 'Cart updated' });
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const deleted = await db('cart_items')
      .where({ id: req.params.itemId, cart_id: cart.id })
      .del();

    if (!deleted) {
      return res.status(404).json({ error: 'Cart item not found' });
    }
    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    next(err);
  }
}

async function clearCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user.id);
    await db('cart_items').where({ cart_id: cart.id }).del();
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
