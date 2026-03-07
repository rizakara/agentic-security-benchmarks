const { Router } = require('express');
const { param, body, query } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const adminController = require('../controllers/admin');

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/dashboard', adminController.getDashboardStats);

router.get(
  '/orders',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn([
      'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled',
    ]),
  ],
  validate,
  adminController.listOrders
);

router.get(
  '/orders/:id',
  [param('id').isUUID()],
  validate,
  adminController.getOrder
);

router.patch(
  '/orders/:id/status',
  [
    param('id').isUUID(),
    body('status')
      .isIn(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Invalid order status'),
  ],
  validate,
  adminController.updateOrderStatus
);

module.exports = router;
