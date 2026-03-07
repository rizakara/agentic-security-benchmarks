const { Router } = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// GET /api/admin/orders — all orders with filters
router.get('/orders', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    let query = db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .select(
        'orders.*',
        'users.name as customer_name',
        'users.email as customer_email'
      );

    let countQuery = db('orders');

    if (req.query.status) {
      query = query.where('orders.status', req.query.status);
      countQuery = countQuery.where('status', req.query.status);
    }

    const [orders, [{ count }]] = await Promise.all([
      query.orderBy('orders.created_at', 'desc').limit(limit).offset(offset),
      countQuery.count('* as count'),
    ]);

    res.json({
      orders,
      pagination: { page, limit, total: parseInt(count, 10), pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/orders/:id
router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .where('orders.id', req.params.id)
      .select('orders.*', 'users.name as customer_name', 'users.email as customer_email')
      .first();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = await db('order_items').where('order_id', order.id);
    res.json({ order, items });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/orders/:id/status — update order status
router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const [order] = await db('orders')
      .where('id', req.params.id)
      .update({ status, updated_at: db.fn.now() })
      .returning('*');

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // If cancelled, restore stock
    if (status === 'cancelled') {
      const items = await db('order_items').where('order_id', order.id);
      for (const item of items) {
        await db('products').where('id', item.product_id).increment('stock', item.quantity);
      }
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/dashboard — summary stats
router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      [{ total_orders }],
      [{ total_revenue }],
      [{ total_users }],
      [{ total_products }],
      recentOrders,
      statusCounts,
    ] = await Promise.all([
      db('orders').count('* as total_orders'),
      db('orders').where('status', '!=', 'cancelled').sum('total as total_revenue'),
      db('users').where('role', 'customer').count('* as total_users'),
      db('products').where('active', true).count('* as total_products'),
      db('orders')
        .join('users', 'orders.user_id', 'users.id')
        .select('orders.id', 'orders.total', 'orders.status', 'orders.created_at', 'users.name as customer_name')
        .orderBy('orders.created_at', 'desc')
        .limit(10),
      db('orders').select('status').count('* as count').groupBy('status'),
    ]);

    res.json({
      total_orders: parseInt(total_orders, 10),
      total_revenue: parseFloat(total_revenue || 0),
      total_users: parseInt(total_users, 10),
      total_products: parseInt(total_products, 10),
      recent_orders: recentOrders,
      orders_by_status: statusCounts.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {}),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users — list users
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [users, [{ count }]] = await Promise.all([
      db('users')
        .select('id', 'email', 'name', 'role', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      db('users').count('* as count'),
    ]);

    res.json({
      users,
      pagination: { page, limit, total: parseInt(count, 10), pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
