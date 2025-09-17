import express from 'express';
import { check, validationResult } from 'express-validator';
import {
  createInventory,
  getAllInventory,
  getInventoryById,
  updateInventory,
  deleteInventory,
  createInventoryPrice,
  getInventoryPrices,
  createInventoryShipPrice,
  getShippingPrice,
  createPromo,
  getActivePromos,
  calculatePromoDiscount,
  getAllCategories,
  getSubCategories,
  getAllVendors,
  getInventoryStats,
  addImagesToInventory,
  removeImageFromInventory,
  setPrimaryImage,
  getInventoryImages,
  getSingleItemPrice,
  getSingleItemShipping,
  getSingleItemPromos
} from '../controllers/inventory.js';
import {
  authenticateToken,
  requireAdmin,
  requireManager,
  requireVendor,
  requireInventoryPage,
  requireAdminOrManager,
  requireAdminManagerOrVendor
} from '../middleware/auth.js';
import { uploadMultiple, handleMulterError } from '../utils/awsS3.js';

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// ========================================
// INVENTORY ROUTES
// ========================================

// Create Inventory Item (Admin, Manager, Vendor)
router.post('/',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('itemDescription').notEmpty().withMessage('Item description is required'),
    check('category').isIn(['Cement', 'Iron', 'Concrete Mixer']).withMessage('Category must be: Cement, Iron, or Concrete Mixer'),
    check('subCategory').notEmpty().withMessage('Sub category is required'),
    check('units').notEmpty().withMessage('Units is required'),
    check('vendorId').isMongoId().withMessage('Valid vendor ID is required')
  ],
  validate,
  createInventory
);

// Get All Categories and Subcategories (All authenticated users)
router.get('/categories',
  authenticateToken,
  getAllCategories
);

// Get Subcategories for a Category (All authenticated users)
router.get('/categories/:category/subcategories',
  authenticateToken,
  [
    check('category').isIn(['Cement', 'Iron', 'Concrete Mixer']).withMessage('Invalid category')
  ],
  validate,
  getSubCategories
);

// Get All Vendors (Admin and Manager only)
router.get('/vendors',
  authenticateToken,
  requireAdminOrManager,
  [
    check('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    check('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  getAllVendors
);

// Get All Inventory Items (All authenticated users)
router.get('/',
  authenticateToken,
  [
    check('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    check('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  getAllInventory
);

// Get Inventory Item by ID (All authenticated users)
router.get('/:id',
  authenticateToken,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required')
  ],
  validate,
  getInventoryById
);

// Get pricing data for a single inventory item (All authenticated users)
router.get('/:id/price',
  authenticateToken,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required')
  ],
  validate,
  getSingleItemPrice
);

// Get shipping data for a single inventory item (All authenticated users)
router.get('/:id/shipping',
  authenticateToken,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required')
  ],
  validate,
  getSingleItemShipping
);

// Get promo data for a single inventory item (All authenticated users)
router.get('/:id/promo',
  authenticateToken,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required'),
    check('active').optional().isBoolean().withMessage('Active must be a boolean')
  ],
  validate,
  getSingleItemPromos
);

// Update Inventory Item (Admin, Manager, Vendor - own items only)
router.put('/:id',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required'),
    check('itemDescription').optional().notEmpty().withMessage('Item description cannot be empty'),
    check('category').optional().isIn(['Cement', 'Iron', 'Concrete Mixer']).withMessage('Category must be: Cement, Iron, or Concrete Mixer'),
    check('subCategory').optional().notEmpty().withMessage('Sub category cannot be empty'),
    check('units').optional().notEmpty().withMessage('Units cannot be empty')
  ],
  validate,
  updateInventory
);

// Delete/Deactivate Inventory Item (Admin, Manager, Vendor - own items only)
router.delete('/:id',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required')
  ],
  validate,
  deleteInventory
);

// ========================================
// INVENTORY PRICE ROUTES
// ========================================

// Create/Update Inventory Price (Admin, Manager, Vendor - own items only)
router.post('/price',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('itemCode').isMongoId().withMessage('Valid item code is required'),
    check('unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
    check('margin').optional().isFloat({ min: 0 }).withMessage('Margin must be a positive number'),
    check('marginPercentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Margin percentage must be between 0 and 100'),
    check('cgst').optional().isFloat({ min: 0 }).withMessage('CGST must be a positive number'),
    check('sgst').optional().isFloat({ min: 0 }).withMessage('SGST must be a positive number'),
    check('igst').optional().isFloat({ min: 0 }).withMessage('IGST must be a positive number'),
    check('tax').optional().isFloat({ min: 0 }).withMessage('Tax must be a positive number')
  ],
  validate,
  createInventoryPrice
);

// Get Inventory Prices (All authenticated users)
router.get('/price/list',
  authenticateToken,
  [
    check('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    check('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    check('minPrice').optional().isFloat({ min: 0 }).withMessage('Min price must be a positive number'),
    check('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be a positive number')
  ],
  validate,
  getInventoryPrices
);

// ========================================
// INVENTORY SHIPPING PRICE ROUTES
// ========================================

// Create/Update Inventory Shipping Price (Admin, Manager, Vendor - own items only)
router.post('/shipping',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('itemCode').isMongoId().withMessage('Valid item code is required'),
    check('price0to50k').isFloat({ min: 0 }).withMessage('Price for 0-50K must be a positive number'),
    check('price50kto100k').isFloat({ min: 0 }).withMessage('Price for 50K-100K must be a positive number'),
    check('price100kto150k').isFloat({ min: 0 }).withMessage('Price for 100K-150K must be a positive number'),
    check('price150kto200k').isFloat({ min: 0 }).withMessage('Price for 150K-200K must be a positive number'),
    check('priceAbove200k').isFloat({ min: 0 }).withMessage('Price for above 200K must be a positive number')
  ],
  validate,
  createInventoryShipPrice
);

// Get Shipping Price for Order (All authenticated users)
router.get('/shipping/calculate',
  authenticateToken,
  [
    check('itemCode').isMongoId().withMessage('Valid item code is required'),
    check('orderValue').isFloat({ min: 0 }).withMessage('Order value must be a positive number')
  ],
  validate,
  getShippingPrice
);

// ========================================
// PROMO ROUTES
// ========================================

// Create Promo (Admin, Manager, Vendor - own items only)
router.post('/promo',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('itemCode').isMongoId().withMessage('Valid item code is required'),
    check('promoName').notEmpty().withMessage('Promo name is required'),
    check('discountType').isIn(['percentage', 'fixed']).withMessage('Discount type must be percentage or fixed'),
    check('startDate').isISO8601().withMessage('Valid start date is required'),
    check('endDate').isISO8601().withMessage('Valid end date is required'),
    check('minOrderValue').optional().isFloat({ min: 0 }).withMessage('Min order value must be a positive number'),
    check('maxDiscountAmount').optional().isFloat({ min: 0 }).withMessage('Max discount amount must be a positive number'),
    check('usageLimit').optional().isInt({ min: 0 }).withMessage('Usage limit must be a non-negative integer')
  ],
  validate,
  createPromo
);

// Get Active Promos (All authenticated users)
router.get('/promo/active',
  authenticateToken,
  [
    check('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    check('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    check('itemCode').optional().isMongoId().withMessage('Valid item code is required')
  ],
  validate,
  getActivePromos
);

// Calculate Promo Discount (All authenticated users)
router.post('/promo/calculate',
  authenticateToken,
  [
    check('promoId').isMongoId().withMessage('Valid promo ID is required'),
    check('orderValue').isFloat({ min: 0 }).withMessage('Order value must be a positive number')
  ],
  validate,
  calculatePromoDiscount
);

// ========================================
// IMAGE MANAGEMENT ROUTES
// ========================================

// Add Images to Inventory Item (Admin, Manager, Vendor - own items only)
router.post('/:id/images',
  authenticateToken,
  requireAdminManagerOrVendor,
  uploadMultiple,
  handleMulterError,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required')
  ],
  validate,
  addImagesToInventory
);

// Get Images for Inventory Item (All authenticated users)
router.get('/:id/images',
  authenticateToken,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required')
  ],
  validate,
  getInventoryImages
);

// Remove Image from Inventory Item (Admin, Manager, Vendor - own items only)
router.delete('/:id/images/:imageKey',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required'),
    check('imageKey').notEmpty().withMessage('Image key is required')
  ],
  validate,
  removeImageFromInventory
);

// Set Primary Image (Admin, Manager, Vendor - own items only)
router.put('/:id/images/:imageKey/primary',
  authenticateToken,
  requireAdminManagerOrVendor,
  [
    check('id').isMongoId().withMessage('Valid inventory ID is required'),
    check('imageKey').notEmpty().withMessage('Image key is required')
  ],
  validate,
  setPrimaryImage
);

// Get Inventory Statistics (Admin, Manager, Vendor - own items only)
router.get('/stats/overview',
  authenticateToken,
  requireInventoryPage,
  getInventoryStats
);

export default router;
