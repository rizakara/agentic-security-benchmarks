const db = require('../models/db');
const logger = require('../utils/logger');

const VALID_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

async function listOrders(req, res, next) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = db('orders').join('users', 'orders.user_id', 'users.id');
    let countQuery = db('orders');

    if (status && VALID_STATUSES.includes(status)) {
      query = query.where('orders.status', status);
      countQuery = countQuery.where({ status });
    }

    const [{ count }] = await countQuery.count();
    const orders = await query
      .select(
        'orders.*',
        'users.email as user_email',
        'users.name as user_name'
      )
      .orderBy('orders.created_at', 'desc')
      .limit(limitNum)
      .offset(offset);

    res.json({
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(count, 10),
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const order = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .where('orders.id', req.params.id)
      .select('orders.*', 'users.email as user_email', 'users.name as user_name')
      .first();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where({ order_id: order.id })
      .select(
        'order_items.*',
        'products.name as product_name',
        'products.image_url'
      );

    res.json({ order: { ...order, items } });
  } catch (err) {
    next(err);
  }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const [order] = await db('orders')
      .where({ id: req.params.id })
      .update({ status, updated_at: db.fn.now() })
      .returning('*');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // If cancelled, restore stock
    if (status === 'cancelled') {
      const items = await db('order_items').where({ order_id: order.id });
      for (const item of items) {
        await db('products')
          .where({ id: item.product_id })
          .increment('stock', item.quantity);
      }
    }

    logger.info('Order status updated', { orderId: order.id, status });
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

async function getDashboardStats(req, res, next) {
  try {
    const [totalOrders] = await db('orders').count();
    const [revenue] = await db('orders').where('status', '!=', 'cancelled').sum('total as revenue');
    const [totalUsers] = await db('users').count();
    const [totalProducts] = await db('products').where({ active: true }).count();

    const recentOrders = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .select('orders.id', 'orders.total', 'orders.status', 'orders.created_at', 'users.name as user_name')
      .orderBy('orders.created_at', 'desc')
      .limit(10);

    const ordersByStatus = await db('orders')
      .select('status')
      .count()
      .groupBy('status');

    res.json({
      stats: {
        total_orders: parseInt(totalOrders.count, 10),
        revenue: parseFloat(revenue.revenue) || 0,
        total_users: parseInt(totalUsers.count, 10),
        total_products: parseInt(totalProducts.count, 10),
      },
      recent_orders: recentOrders,
      orders_by_status: ordersByStatus,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listOrders, getOrder, updateOrderStatus, getDashboardStats };
