import Inventory from '../models/Inventory.js';
import InventoryPrice from '../models/InventoryPrice.js';
import InventoryShipPrice from '../models/InventoryShipPrice.js';
import Promo from '../models/Promo.js';
import User from '../models/User.js';
import { deleteImageFromS3, deleteMultipleImagesFromS3 } from '../utils/awsS3.js';

// ========================================
// INVENTORY CONTROLLERS
// ========================================

// Create Inventory Item
export const createInventory = async (req, res, next) => {
  try {
    const {
      itemDescription,
      category,
      subCategory,
      grade,
      units,
      details,
      specification,
      deliveryInformation,
      hscCode,
      vendorId
    } = req.body;

    // Check if vendor exists and is a vendor role
    const vendor = await User.findById(vendorId);
    if (!vendor || vendor.role !== 'vendor') {
      return res.status(400).json({ 
        message: "Invalid vendor ID or vendor not found" 
      });
    }

    // Check permissions
    if (req.user.role === 'vendor' && req.user._id.toString() !== vendorId) {
      return res.status(403).json({ 
        message: "You can only create inventory for your own vendor account" 
      });
    }

    const inventory = new Inventory({
      itemDescription,
      category,
      subCategory,
      grade,
      units,
      details,
      specification,
      deliveryInformation,
      hscCode,
      vendorId,
      createdBy: req.user.userId
    });

    await inventory.save();

    // Populate vendor information
    await inventory.populate('vendorId', 'name email role');

    res.status(201).json({
      message: "Inventory item created successfully",
      inventory
    });
  } catch (error) {
    next(error);
  }
};

// Get All Inventory Items
export const getAllInventory = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      subCategory, 
      vendorId, 
      search,
      isActive 
    } = req.query;

    const filter = {};
    
    // Only filter by isActive if explicitly provided
    if (isActive !== undefined && isActive !== null) {
      filter.isActive = isActive === 'true';
    }

    // Apply filters based on user role
    if (req.user.role === 'vendor') {
      filter.vendorId = req.user._id;
    } else if (vendorId) {
      filter.vendorId = vendorId;
    }

    if (category) filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
    if (search) {
      filter.$or = [
        { itemDescription: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { subCategory: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const inventory = await Inventory.find(filter)
      .populate('vendorId', 'name email role')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Inventory.countDocuments(filter);

    res.status(200).json({
      inventory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + inventory.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get Inventory Item by ID
export const getInventoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const inventory = await Inventory.findById(id)
      .populate('vendorId', 'name email role')
      .populate('createdBy', 'name email role');

    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json({ inventory });
  } catch (error) {
    next(error);
  }
};

// Update Inventory Item
export const updateInventory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Remove fields that shouldn't be updated
    delete updateData.itemCode;
    delete updateData.vendorId;
    delete updateData.createdBy;

    Object.assign(inventory, updateData);
    await inventory.save();

    await inventory.populate('vendorId', 'name email role');

    res.status(200).json({
      message: "Inventory item updated successfully",
      inventory
    });
  } catch (error) {
    next(error);
  }
};

// Delete/Deactivate Inventory Item
export const deleteInventory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Soft delete by setting isActive to false
    inventory.isActive = false;
    await inventory.save();

    res.status(200).json({ message: "Inventory item deactivated successfully" });
  } catch (error) {
    next(error);
  }
};

// ========================================
// INVENTORY PRICE CONTROLLERS
// ========================================

// Create/Update Inventory Price
export const createInventoryPrice = async (req, res, next) => {
  try {
    const {
      itemCode,
      unitPrice,
      margin,
      marginPercentage,
      cgst,
      sgst,
      igst,
      tax
    } = req.body;

    // Check if inventory item exists
    const inventory = await Inventory.findById(itemCode);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if price already exists
    let inventoryPrice = await InventoryPrice.findOne({ itemCode });

    if (inventoryPrice) {
      // Update existing price
      Object.assign(inventoryPrice, {
        unitPrice,
        margin,
        marginPercentage,
        cgst,
        sgst,
        igst,
        tax
      });
    } else {
      // Create new price
      inventoryPrice = new InventoryPrice({
        itemCode,
        unitPrice,
        margin,
        marginPercentage,
        cgst,
        sgst,
        igst,
        tax,
        vendorId: inventory.vendorId,
        createdBy: req.user.userId
      });
    }

    await inventoryPrice.save();

    await inventoryPrice.populate('itemCode', 'itemDescription category subCategory units');
    await inventoryPrice.populate('vendorId', 'name email role');

    res.status(201).json({
      message: "Inventory price created/updated successfully",
      inventoryPrice
    });
  } catch (error) {
    next(error);
  }
};

// Get Inventory Prices
export const getInventoryPrices = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      vendorId, 
      minPrice, 
      maxPrice,
      isActive = true 
    } = req.query;

    const filter = { isActive: isActive === 'true' };

    // Apply filters based on user role
    if (req.user.role === 'vendor') {
      filter.vendorId = req.user._id;
    } else if (vendorId) {
      filter.vendorId = vendorId;
    }

    if (minPrice || maxPrice) {
      filter.unitPrice = {};
      if (minPrice) filter.unitPrice.$gte = parseFloat(minPrice);
      if (maxPrice) filter.unitPrice.$lte = parseFloat(maxPrice);
    }

    const skip = (page - 1) * limit;

    const prices = await InventoryPrice.find(filter)
      .populate('itemCode', 'itemDescription category subCategory units')
      .populate('vendorId', 'name email role')
      .sort({ unitPrice: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await InventoryPrice.countDocuments(filter);

    res.status(200).json({
      prices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + prices.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// INVENTORY SHIPPING PRICE CONTROLLERS
// ========================================

// Create/Update Inventory Shipping Price
export const createInventoryShipPrice = async (req, res, next) => {
  try {
    const {
      itemCode,
      price0to50k,
      price50kto100k,
      price100kto150k,
      price150kto200k,
      priceAbove200k
    } = req.body;

    // Check if inventory item exists
    const inventory = await Inventory.findById(itemCode);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if shipping price already exists
    let shipPrice = await InventoryShipPrice.findOne({ itemCode });

    if (shipPrice) {
      // Update existing shipping price
      Object.assign(shipPrice, {
        price0to50k,
        price50kto100k,
        price100kto150k,
        price150kto200k,
        priceAbove200k
      });
    } else {
      // Create new shipping price
      shipPrice = new InventoryShipPrice({
        itemCode,
        price0to50k,
        price50kto100k,
        price100kto150k,
        price150kto200k,
        priceAbove200k,
        vendorId: inventory.vendorId,
        createdBy: req.user.userId
      });
    }

    await shipPrice.save();

    await shipPrice.populate('itemCode', 'itemDescription category subCategory units');
    await shipPrice.populate('vendorId', 'name email role');

    res.status(201).json({
      message: "Inventory shipping price created/updated successfully",
      shipPrice
    });
  } catch (error) {
    next(error);
  }
};

// Get Shipping Price for Order
export const getShippingPrice = async (req, res, next) => {
  try {
    const { itemCode, orderValue } = req.query;

    if (!itemCode || !orderValue) {
      return res.status(400).json({ 
        message: "Item code and order value are required" 
      });
    }

    const shipPrice = await InventoryShipPrice.findOne({ 
      itemCode, 
      isActive: true 
    });

    if (!shipPrice) {
      return res.status(404).json({ 
        message: "Shipping price not found for this item" 
      });
    }

    const shippingCost = shipPrice.getShippingPrice(parseFloat(orderValue));

    res.status(200).json({
      itemCode,
      orderValue: parseFloat(orderValue),
      shippingCost,
      shippingTiers: shipPrice.shippingTiers
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// PROMO CONTROLLERS
// ========================================

// Create Promo
export const createPromo = async (req, res, next) => {
  try {
    const {
      itemCode,
      promoName,
      discount,
      discountAmount,
      discountType,
      startDate,
      endDate,
      minOrderValue,
      maxDiscountAmount,
      usageLimit
    } = req.body;

    // Check if inventory item exists
    const inventory = await Inventory.findById(itemCode);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const promo = new Promo({
      itemCode,
      promoName,
      discount,
      discountAmount,
      discountType,
      startDate,
      endDate,
      minOrderValue,
      maxDiscountAmount,
      usageLimit,
      createdBy: req.user.userId
    });

    await promo.save();

    await promo.populate('itemCode', 'itemDescription category subCategory');
    await promo.populate('createdBy', 'name email role');

    res.status(201).json({
      message: "Promo created successfully",
      promo
    });
  } catch (error) {
    next(error);
  }
};

// Get Active Promos
export const getActivePromos = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, itemCode } = req.query;

    let filter = {};
    if (itemCode) {
      filter.itemCode = itemCode;
    }

    const skip = (page - 1) * limit;

    const promos = await Promo.getActivePromos()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Promo.countDocuments({
      ...filter,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    res.status(200).json({
      promos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + promos.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

// Calculate Promo Discount
export const calculatePromoDiscount = async (req, res, next) => {
  try {
    const { promoId, orderValue } = req.body;

    const promo = await Promo.findById(promoId);
    if (!promo) {
      return res.status(404).json({ message: "Promo not found" });
    }

    const discountAmount = promo.calculateDiscount(parseFloat(orderValue));

    res.status(200).json({
      promoId,
      promoName: promo.promoName,
      orderValue: parseFloat(orderValue),
      discountAmount,
      finalAmount: parseFloat(orderValue) - discountAmount,
      isValid: promo.isValid()
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// UTILITY CONTROLLERS
// ========================================

// Get All Categories and Subcategories
export const getAllCategories = async (req, res, next) => {
  try {
    const categories = Inventory.getAllCategories();
    
    res.status(200).json({
      message: "Categories retrieved successfully",
      categories
    });
  } catch (error) {
    next(error);
  }
};

// Get All Vendors (for admin to select when creating inventory)
export const getAllVendors = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    
    const filter = { role: 'vendor', isActive: true };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const vendors = await User.find(filter)
      .select('_id name email companyName phone address isActive createdAt')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      message: "Vendors retrieved successfully",
      vendors,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + vendors.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get Subcategories for a Category
export const getSubCategories = async (req, res, next) => {
  try {
    const { category } = req.params;
    
    if (!['Cement', 'Iron', 'Concrete Mixer'].includes(category)) {
      return res.status(400).json({ 
        message: "Invalid category. Valid categories: Cement, Iron, Concrete Mixer" 
      });
    }
    
    const subCategories = Inventory.getSubCategories(category);
    
    res.status(200).json({
      message: "Subcategories retrieved successfully",
      category,
      subCategories
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// IMAGE MANAGEMENT CONTROLLERS
// ========================================

// Add Images to Inventory Item
export const addImagesToInventory = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No images provided" });
    }

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Process uploaded images
    const imageData = req.files.map(file => {
      // Handle both S3 and local storage
      const isS3 = file.location && file.key;
      const isLocal = file.path && file.filename;
      
      return {
        url: isS3 ? file.location : `http://localhost:${process.env.PORT || 5000}/${file.path}`,
        key: isS3 ? file.key : file.filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
        isPrimary: false
      };
    });

    // Add images to inventory
    for (const image of imageData) {
      await inventory.addImage(image);
    }

    await inventory.populate('vendorId', 'name email role');

    res.status(200).json({
      message: "Images added successfully",
      inventory,
      addedImages: imageData.length
    });
  } catch (error) {
    next(error);
  }
};

// Remove Image from Inventory Item
export const removeImageFromInventory = async (req, res, next) => {
  try {
    const { id, imageKey } = req.params;

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Find the image
    const image = inventory.images.find(img => img.key === imageKey);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    // Remove from S3
    const s3Deleted = await deleteImageFromS3(imageKey);
    if (!s3Deleted) {
      console.warn(`Failed to delete image ${imageKey} from S3`);
    }

    // Remove from database
    await inventory.removeImage(imageKey);

    await inventory.populate('vendorId', 'name email role');

    res.status(200).json({
      message: "Image removed successfully",
      inventory
    });
  } catch (error) {
    next(error);
  }
};

// Set Primary Image
export const setPrimaryImage = async (req, res, next) => {
  try {
    const { id, imageKey } = req.params;

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Set primary image
    const success = await inventory.setPrimaryImage(imageKey);
    if (!success) {
      return res.status(404).json({ message: "Image not found" });
    }

    await inventory.populate('vendorId', 'name email role');

    res.status(200).json({
      message: "Primary image updated successfully",
      inventory
    });
  } catch (error) {
    next(error);
  }
};

// Get Images for Inventory Item
export const getInventoryImages = async (req, res, next) => {
  try {
    const { id } = req.params;

    const inventory = await Inventory.findById(id).select('images primaryImage');
    if (!inventory) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    // Check access permissions
    if (!inventory.canAccess(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const images = inventory.getImageUrls();

    res.status(200).json({
      message: "Images retrieved successfully",
      images,
      primaryImage: inventory.primaryImage,
      totalImages: images.length
    });
  } catch (error) {
    next(error);
  }
};

// Get Inventory Statistics
export const getInventoryStats = async (req, res, next) => {
  try {
    const filter = { isActive: true };

    // Apply vendor filter for vendor role
    if (req.user.role === 'vendor') {
      filter.vendorId = req.user._id;
    }

    const totalItems = await Inventory.countDocuments(filter);
    const totalPrices = await InventoryPrice.countDocuments(filter);
    const totalShipPrices = await InventoryShipPrice.countDocuments(filter);
    const activePromos = await Promo.countDocuments({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    // Category breakdown
    const categoryStats = await Inventory.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      stats: {
        totalItems: totalItems || 0,
        totalPrices: totalPrices || 0,
        totalShipPrices: totalShipPrices || 0,
        activePromos: activePromos || 0,
        categoryBreakdown: categoryStats || []
      }
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// SINGLE ITEM DATA CONTROLLERS (FOR EDIT MODAL)
// ========================================

// Get pricing data for a single inventory item
export const getSingleItemPrice = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find pricing data for this specific item
    const pricing = await InventoryPrice.findOne({ itemCode: id })
      .populate('itemCode', 'itemDescription category subCategory')
      .populate('vendorId', 'name email');

    if (!pricing) {
      return res.status(404).json({
        message: 'No pricing data found for this inventory item',
        pricing: null
      });
    }

    res.json({
      message: 'Pricing data retrieved successfully',
      pricing
    });
  } catch (error) {
    next(error);
  }
};

// Get shipping data for a single inventory item
export const getSingleItemShipping = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find shipping data for this specific item
    const shipping = await InventoryShipPrice.findOne({ itemCode: id })
      .populate('itemCode', 'itemDescription category subCategory')
      .populate('vendorId', 'name email');

    if (!shipping) {
      return res.status(404).json({
        message: 'No shipping data found for this inventory item',
        shipping: null
      });
    }

    res.json({
      message: 'Shipping data retrieved successfully',
      shipping
    });
  } catch (error) {
    next(error);
  }
};

// Get promo data for a single inventory item
export const getSingleItemPromos = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { active = true } = req.query;

    let filter = { itemCode: id };
    
    // Filter by active status if specified
    if (active === 'true') {
      filter.isActive = true;
      filter.startDate = { $lte: new Date() };
      filter.endDate = { $gte: new Date() };
    }

    // Find all promos for this specific item
    const promos = await Promo.find(filter)
      .populate('itemCode', 'itemDescription category subCategory')
      .populate('vendorId', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      message: 'Promo data retrieved successfully',
      promos,
      count: promos.length
    });
  } catch (error) {
    next(error);
  }
};
