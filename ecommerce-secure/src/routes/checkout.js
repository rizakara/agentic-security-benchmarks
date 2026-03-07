const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const checkoutController = require('../controllers/checkout');

const router = Router();

router.post(
  '/',
  authenticate,
  [
    body('shipping_address').isObject().withMessage('Shipping address is required'),
    body('shipping_address.street').trim().notEmpty().withMessage('Street is required'),
    body('shipping_address.city').trim().notEmpty().withMessage('City is required'),
    body('shipping_address.state').trim().notEmpty().withMessage('State is required'),
    body('shipping_address.zip').trim().notEmpty().withMessage('Zip code is required'),
    body('shipping_address.country').trim().notEmpty().withMessage('Country is required'),
  ],
  validate,
  checkoutController.createCheckout
);

router.get('/orders', authenticate, checkoutController.getOrderHistory);

module.exports = router;
