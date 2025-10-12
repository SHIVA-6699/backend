import express from 'express';
import { body, param, query } from 'express-validator';
import {
  // Customer controllers
  addToCart,
  getCustomerOrders,
  getOrderDetails,
  updateOrder,
  removeFromCart,
  placeOrder,
  processPayment,
  getPaymentStatus
} from '../controllers/order/customer.js';

import {
  // Vendor controllers
  getVendorOrders,
  getVendorOrderDetails,
  acceptOrder,
  rejectOrder,
  updateDeliveryTracking,
  getVendorOrderStats,
  getPendingOrders
} from '../controllers/order/vendor.js';

import {
  // Admin controllers
  getAllOrders,
  getOrderDetails as getAdminOrderDetails,
  getOrderStats,
  getOrdersByDateRange,
  cancelOrder,
  getPaymentStats,
  getDeliveryStats
} from '../controllers/order/admin.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// ==================== VALIDATION RULES ====================

const addToCartValidation = [
  body('itemCode')
    .isMongoId()
    .withMessage('Valid item code is required'),
  body('qty')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('deliveryAddress')
    .optional()
    .isString()
    .withMessage('Delivery address must be a string'),
  body('deliveryPincode')
    .optional()
    .custom((value) => {
      if (value && !/^[1-9][0-9]{5}$/.test(value)) {
        throw new Error('Valid pincode is required');
      }
      return true;
    }),
  body('deliveryExpectedDate')
    .optional()
    .isISO8601()
    .withMessage('Valid delivery date is required'),
  body('custPhoneNum')
    .optional()
    .custom((value) => {
      if (value && !/^[6-9]\d{9}$/.test(value)) {
        throw new Error('Valid phone number is required');
      }
      return true;
    }),
  body('receiverMobileNum')
    .optional()
    .custom((value) => {
      if (value && !/^[6-9]\d{9}$/.test(value)) {
        throw new Error('Valid receiver mobile number is required');
      }
      return true;
    })
];

const updateOrderValidation = [
  body('deliveryAddress')
    .optional()
    .isString()
    .withMessage('Delivery address must be a string'),
  body('deliveryPincode')
    .optional()
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Valid pincode is required'),
  body('deliveryExpectedDate')
    .optional()
    .isISO8601()
    .withMessage('Valid delivery date is required'),
  body('receiverMobileNum')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid receiver mobile number is required')
];

const placeOrderValidation = [
  body('deliveryAddress')
    .isString()
    .withMessage('Delivery address is required'),
  body('deliveryPincode')
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Valid pincode is required'),
  body('deliveryExpectedDate')
    .isISO8601()
    .withMessage('Valid delivery date is required'),
  body('receiverMobileNum')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid receiver mobile number is required')
];

const processPaymentValidation = [
  body('paymentType')
    .isIn(['credit_card', 'debit_card', 'upi', 'net_banking', 'wallet', 'cash_on_delivery', 'bank_transfer'])
    .withMessage('Valid payment type is required'),
  body('paymentMode')
    .isIn(['online', 'offline', 'cash_on_delivery'])
    .withMessage('Valid payment mode is required')
];

const updateDeliveryTrackingValidation = [
  body('trackingNumber')
    .optional()
    .isString()
    .withMessage('Tracking number must be a string'),
  body('courierService')
    .optional()
    .isString()
    .withMessage('Courier service must be a string'),
  body('trackingUrl')
    .optional()
    .isURL()
    .withMessage('Valid tracking URL is required'),
  body('deliveryStatus')
    .optional()
    .isIn(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'])
    .withMessage('Valid delivery status is required'),
  body('deliveryNotes')
    .optional()
    .isString()
    .withMessage('Delivery notes must be a string')
];

const leadIdValidation = [
  param('leadId')
    .isString()
    .withMessage('Valid lead ID is required')
];

// ==================== CUSTOMER ROUTES ====================

// Add item to cart (Create order)
router.post('/cart/add', 
  authenticateToken,
  addToCartValidation,
  addToCart
);

// Get customer's orders/cart
router.get('/customer/orders',
  authenticateToken,
  [
    query('status')
      .optional()
      .isIn(['pending', 'vendor_accepted', 'payment_done', 'order_confirmed', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Valid status is required'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  getCustomerOrders
);

// Get single order details
router.get('/customer/orders/:leadId',
  authenticateToken,
  leadIdValidation,
  getOrderDetails
);

// Update order (delivery info, etc.)
router.put('/customer/orders/:leadId',
  authenticateToken,
  leadIdValidation,
  updateOrderValidation,
  updateOrder
);

// Remove item from cart
router.delete('/customer/orders/:leadId/items',
  authenticateToken,
  leadIdValidation,
  [
    body('itemCode')
      .isMongoId()
      .withMessage('Valid item code is required')
  ],
  removeFromCart
);

// Place order (Move from cart to placed)
router.post('/customer/orders/:leadId/place',
  authenticateToken,
  leadIdValidation,
  placeOrderValidation,
  placeOrder
);

// Process payment
router.post('/customer/orders/:leadId/payment',
  authenticateToken,
  leadIdValidation,
  processPaymentValidation,
  processPayment
);

// Get payment status
router.get('/customer/orders/:leadId/payment',
  authenticateToken,
  leadIdValidation,
  getPaymentStatus
);

// ==================== VENDOR ROUTES ====================

// Get vendor order statistics (Must be BEFORE /:leadId)
router.get('/vendor/orders/stats',
  authenticateToken,
  requireRole(['vendor']),
  getVendorOrderStats
);

// Get pending orders for vendor (Must be BEFORE /:leadId)
router.get('/vendor/orders/pending',
  authenticateToken,
  requireRole(['vendor']),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  getPendingOrders
);

// Get vendor's orders
router.get('/vendor/orders',
  authenticateToken,
  requireRole(['vendor']),
  [
    query('status')
      .optional()
      .isIn(['pending', 'vendor_accepted', 'payment_done', 'order_confirmed', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Valid status is required'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  getVendorOrders
);

// Get single vendor order details (Must be AFTER specific routes)
router.get('/vendor/orders/:leadId',
  authenticateToken,
  requireRole(['vendor']),
  leadIdValidation,
  getVendorOrderDetails
);

// Accept order
router.post('/vendor/orders/:leadId/accept',
  authenticateToken,
  requireRole(['vendor']),
  leadIdValidation,
  [
    body('remarks')
      .optional()
      .isString()
      .withMessage('Remarks must be a string')
  ],
  acceptOrder
);

// Reject order
router.post('/vendor/orders/:leadId/reject',
  authenticateToken,
  requireRole(['vendor']),
  leadIdValidation,
  [
    body('remarks')
      .optional()
      .isString()
      .withMessage('Remarks must be a string')
  ],
  rejectOrder
);

// Update delivery tracking
router.put('/vendor/orders/:leadId/delivery',
  authenticateToken,
  requireRole(['vendor']),
  leadIdValidation,
  updateDeliveryTrackingValidation,
  updateDeliveryTracking
);

// ==================== ADMIN ROUTES ====================

// Get all orders
router.get('/admin/orders',
  authenticateToken,
  requireRole(['admin']),
  [
    query('status')
      .optional()
      .isIn(['pending', 'vendor_accepted', 'payment_done', 'order_confirmed', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Valid status is required'),
    query('vendorId')
      .optional()
      .isMongoId()
      .withMessage('Valid vendor ID is required'),
    query('customerId')
      .optional()
      .isMongoId()
      .withMessage('Valid customer ID is required'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  getAllOrders
);

// Get single order details (Admin)
router.get('/admin/orders/:leadId',
  authenticateToken,
  requireRole(['admin']),
  leadIdValidation,
  getAdminOrderDetails
);

// Get order statistics
router.get('/admin/orders/stats',
  authenticateToken,
  requireRole(['admin']),
  getOrderStats
);

// Get orders by date range
router.get('/admin/orders/date-range',
  authenticateToken,
  requireRole(['admin']),
  [
    query('startDate')
      .isISO8601()
      .withMessage('Valid start date is required'),
    query('endDate')
      .isISO8601()
      .withMessage('Valid end date is required'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  getOrdersByDateRange
);

// Cancel order (Admin)
router.post('/admin/orders/:leadId/cancel',
  authenticateToken,
  requireRole(['admin']),
  leadIdValidation,
  [
    body('reason')
      .optional()
      .isString()
      .withMessage('Reason must be a string')
  ],
  cancelOrder
);

// Get payment statistics
router.get('/admin/payments/stats',
  authenticateToken,
  requireRole(['admin']),
  getPaymentStats
);

// Get delivery statistics
router.get('/admin/deliveries/stats',
  authenticateToken,
  requireRole(['admin']),
  getDeliveryStats
);

export default router;
