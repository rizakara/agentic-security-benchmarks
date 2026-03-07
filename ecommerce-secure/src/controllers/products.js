const db = require('../models/db');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const { page = 1, limit = 20, category, search, sort = 'created_at', order = 'desc' } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const allowedSorts = ['price', 'name', 'created_at'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';

    let query = db('products').where({ active: true });
    let countQuery = db('products').where({ active: true });

    if (category) {
      query = query.where({ category });
      countQuery = countQuery.where({ category });
    }

    if (search) {
      const term = `%${search}%`;
      query = query.where(function () {
        this.whereILike('name', term).orWhereILike('description', term);
      });
      countQuery = countQuery.where(function () {
        this.whereILike('name', term).orWhereILike('description', term);
      });
    }

    const [{ count }] = await countQuery.count();
    const products = await query
      .select('id', 'name', 'description', 'price', 'stock', 'image_url', 'category', 'created_at')
      .orderBy(sortCol, sortOrder)
      .limit(limitNum)
      .offset(offset);

    res.json({
      products,
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

async function getById(req, res, next) {
  try {
    const product = await db('products')
      .where({ id: req.params.id, active: true })
      .first();
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, description, price, stock, category } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const [product] = await db('products')
      .insert({ name, description, price, stock: stock || 0, category, image_url: imageUrl })
      .returning('*');

    logger.info('Product created', { productId: product.id });
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const updates = {};
    const allowed = ['name', 'description', 'price', 'stock', 'category', 'active'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.file) {
      updates.image_url = `/uploads/${req.file.filename}`;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = db.fn.now();
    const [product] = await db('products')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    logger.info('Product updated', { productId: product.id });
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const [product] = await db('products')
      .where({ id: req.params.id })
      .update({ active: false, updated_at: db.fn.now() })
      .returning('id');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    logger.info('Product deactivated', { productId: product.id });
    res.json({ message: 'Product removed' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
