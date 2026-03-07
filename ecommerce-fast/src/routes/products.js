const { Router } = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');

const router = Router();

const productSchema = {
  name: { required: true, min: 1 },
  price: { required: true, type: 'number', min: 0.01 },
  stock: { required: true, type: 'number', min: 0 },
};

// GET /api/products — public, paginated, filterable
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    let query = db('products').where('active', true);
    let countQuery = db('products').where('active', true);

    if (req.query.category) {
      query = query.where('category', req.query.category);
      countQuery = countQuery.where('category', req.query.category);
    }
    if (req.query.search) {
      const term = `%${req.query.search}%`;
      query = query.where((qb) => {
        qb.whereILike('name', term).orWhereILike('description', term);
      });
      countQuery = countQuery.where((qb) => {
        qb.whereILike('name', term).orWhereILike('description', term);
      });
    }
    if (req.query.min_price) {
      query = query.where('price', '>=', parseFloat(req.query.min_price));
      countQuery = countQuery.where('price', '>=', parseFloat(req.query.min_price));
    }
    if (req.query.max_price) {
      query = query.where('price', '<=', parseFloat(req.query.max_price));
      countQuery = countQuery.where('price', '<=', parseFloat(req.query.max_price));
    }

    const sortFields = { price: 'price', name: 'name', created_at: 'created_at' };
    const sortBy = sortFields[req.query.sort] || 'created_at';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';

    const [products, [{ count }]] = await Promise.all([
      query.orderBy(sortBy, order).limit(limit).offset(offset),
      countQuery.count('* as count'),
    ]);

    res.json({
      products,
      pagination: {
        page,
        limit,
        total: parseInt(count, 10),
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const product = await db('products').where('id', req.params.id).first();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// POST /api/products — admin only
router.post(
  '/',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  validate(productSchema),
  async (req, res, next) => {
    try {
      const { name, description, price, stock, category } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

      const [product] = await db('products')
        .insert({
          name,
          description: description || null,
          price: parseFloat(price),
          stock: parseInt(stock, 10),
          category: category || null,
          image_url: imageUrl,
        })
        .returning('*');

      res.status(201).json({ product });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/products/:id — admin only
router.put('/:id', authenticate, authorize('admin'), upload.single('image'), async (req, res, next) => {
  try {
    const updates = {};
    const fields = ['name', 'description', 'category', 'active'];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (req.body.price !== undefined) updates.price = parseFloat(req.body.price);
    if (req.body.stock !== undefined) updates.stock = parseInt(req.body.stock, 10);
    if (req.file) updates.image_url = `/uploads/${req.file.filename}`;

    const [product] = await db('products')
      .where('id', req.params.id)
      .update({ ...updates, updated_at: db.fn.now() })
      .returning('*');

    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — admin only (soft delete)
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [product] = await db('products')
      .where('id', req.params.id)
      .update({ active: false, updated_at: db.fn.now() })
      .returning('*');

    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deactivated', product });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/image — upload image separately
router.post(
  '/:id/image',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No image file provided' });

      const [product] = await db('products')
        .where('id', req.params.id)
        .update({ image_url: `/uploads/${req.file.filename}`, updated_at: db.fn.now() })
        .returning('*');

      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json({ product });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
