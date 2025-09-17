import mongoose from "mongoose";

const inventoryShipPriceSchema = new mongoose.Schema(
  {
    // Reference to Inventory
    itemCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
      unique: true
    },
    
    // Shipping Price Tiers (in INR)
    price0to50k: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price50kto100k: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price100kto150k: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price150kto200k: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    priceAbove200k: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    // Relationships
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Status
    isActive: {
      type: Boolean,
      default: true
    },

    // Audit Fields
    updateDate: {
      type: Date,
      default: Date.now
    },
    updateTime: {
      type: Date,
      default: Date.now
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for shipping price tiers
inventoryShipPriceSchema.virtual('shippingTiers').get(function() {
  return {
    '0-50K': this.price0to50k,
    '50K-100K': this.price50kto100k,
    '100K-150K': this.price100kto150k,
    '150K-200K': this.price150kto200k,
    'Above 200K': this.priceAbove200k
  };
});

// Method to get shipping price based on order value
inventoryShipPriceSchema.methods.getShippingPrice = function(orderValue) {
  if (orderValue <= 50000) return this.price0to50k;
  if (orderValue <= 100000) return this.price50kto100k;
  if (orderValue <= 150000) return this.price100kto150k;
  if (orderValue <= 200000) return this.price150kto200k;
  return this.priceAbove200k;
};

// Pre-save middleware to update timestamps
inventoryShipPriceSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updateDate = new Date();
    this.updateTime = new Date();
  }
  next();
});

// Indexes for better performance
inventoryShipPriceSchema.index({ itemCode: 1 });
inventoryShipPriceSchema.index({ vendorId: 1, isActive: 1 });
inventoryShipPriceSchema.index({ createdBy: 1 });

// Static method to get shipping prices by vendor
inventoryShipPriceSchema.statics.getByVendor = function(vendorId) {
  return this.find({ vendorId, isActive: true })
    .populate('itemCode', 'itemDescription category subCategory units')
    .populate('vendorId', 'name email');
};

// Static method to get shipping price for order value
inventoryShipPriceSchema.statics.getShippingPriceForOrder = function(itemCode, orderValue) {
  return this.findOne({ itemCode, isActive: true })
    .then(shipPrice => {
      if (!shipPrice) return 0;
      return shipPrice.getShippingPrice(orderValue);
    });
};

// Method to check if user can access this shipping price
inventoryShipPriceSchema.methods.canAccess = function(user) {
  // Admin can access everything
  if (user.role === 'admin') return true;
  
  // Manager can access everything
  if (user.role === 'manager') return true;
  
  // Vendor can only access their own shipping prices
  if (user.role === 'vendor' && this.vendorId.toString() === user._id.toString()) return true;
  
  // Employee and customer can view all active shipping prices
  if (['employee', 'customer'].includes(user.role)) return this.isActive;
  
  return false;
};

export default mongoose.model("InventoryShipPrice", inventoryShipPriceSchema);
