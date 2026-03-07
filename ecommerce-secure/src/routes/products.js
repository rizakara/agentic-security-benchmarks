const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const productsController = require('../controllers/products');

const router = Router();

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('category').optional().trim().isLength({ max: 100 }),
    query('search').optional().trim().isLength({ max: 200 }),
    query('sort').optional().isIn(['price', 'name', 'created_at']),
    query('order').optional().isIn(['asc', 'desc']),
  ],
  validate,
  productsController.list
);

router.get(
  '/:id',
  [param('id').isUUID()],
  validate,
  productsController.getById
);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Product name is required'),
    body('price').isFloat({ min: 0.01 }).withMessage('Valid price is required'),
    body('description').optional().trim().isLength({ max: 5000 }),
    body('stock').optional().isInt({ min: 0 }),
    body('category').optional().trim().isLength({ max: 100 }),
  ],
  validate,
  productsController.create
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  [
    param('id').isUUID(),
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('price').optional().isFloat({ min: 0.01 }),
    body('description').optional().trim().isLength({ max: 5000 }),
    body('stock').optional().isInt({ min: 0 }),
    body('category').optional().trim().isLength({ max: 100 }),
    body('active').optional().isBoolean(),
  ],
  validate,
  productsController.update
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').isUUID()],
  validate,
  productsController.remove
);

module.exports = router;
