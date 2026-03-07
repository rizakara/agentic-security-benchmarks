const { Router } = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const cartController = require('../controllers/cart');

const router = Router();

router.use(authenticate);

router.get('/', cartController.getCart);

router.post(
  '/items',
  [
    body('product_id').isUUID().withMessage('Valid product ID is required'),
    body('quantity').optional().isInt({ min: 1, max: 99 }).withMessage('Quantity must be between 1 and 99'),
  ],
  validate,
  cartController.addItem
);

router.put(
  '/items/:itemId',
  [
    param('itemId').isUUID(),
    body('quantity').isInt({ min: 0, max: 99 }).withMessage('Quantity must be between 0 and 99'),
  ],
  validate,
  cartController.updateItem
);

router.delete(
  '/items/:itemId',
  [param('itemId').isUUID()],
  validate,
  cartController.removeItem
);

router.delete('/', cartController.clearCart);

module.exports = router;
