import mongoose from "mongoose";

const inventoryPriceSchema = new mongoose.Schema(
  {
    // Reference to Inventory
    itemCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
      unique: true
    },
    
    // Pricing Information
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    margin: {
      type: Number,
      default: 0,
      min: 0
    },
    marginPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    // Tax Information
    cgst: {
      type: Number,
      default: 0,
      min: 0
    },
    sgst: {
      type: Number,
      default: 0,
      min: 0
    },
    igst: {
      type: Number,
      default: 0,
      min: 0
    },
    tax: {
      type: Number,
      default: 0,
      min: 0
    },

    // Calculated Fields
    totalPrice: {
      type: Number,
      default: function() {
        return this.unitPrice + this.tax;
      }
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
    updateTimestamp: {
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

// Virtual for formatted price
inventoryPriceSchema.virtual('formattedPrice').get(function() {
  return `₹${this.unitPrice.toFixed(2)}`;
});

// Virtual for total price with tax
inventoryPriceSchema.virtual('priceWithTax').get(function() {
  const taxAmount = (this.unitPrice * this.tax) / 100;
  return this.unitPrice + taxAmount;
});

// Pre-save middleware to update timestamps and calculate total price
inventoryPriceSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updateDate = new Date();
    this.updateTimestamp = new Date();
  }
  
  // Calculate total price
  const taxAmount = (this.unitPrice * this.tax) / 100;
  this.totalPrice = this.unitPrice + taxAmount;
  
  next();
});

// Indexes for better performance
inventoryPriceSchema.index({ itemCode: 1 });
inventoryPriceSchema.index({ vendorId: 1, isActive: 1 });
inventoryPriceSchema.index({ unitPrice: 1 });
inventoryPriceSchema.index({ createdBy: 1 });

// Static method to get prices by vendor
inventoryPriceSchema.statics.getByVendor = function(vendorId) {
  return this.find({ vendorId, isActive: true })
    .populate('itemCode', 'itemDescription category subCategory units')
    .populate('vendorId', 'name email');
};

// Static method to get prices by price range
inventoryPriceSchema.statics.getByPriceRange = function(minPrice, maxPrice) {
  return this.find({ 
    unitPrice: { $gte: minPrice, $lte: maxPrice },
    isActive: true 
  })
  .populate('itemCode', 'itemDescription category subCategory units')
  .populate('vendorId', 'name email');
};

// Method to check if user can access this price
inventoryPriceSchema.methods.canAccess = function(user) {
  // Admin can access everything
  if (user.role === 'admin') return true;
  
  // Manager can access everything
  if (user.role === 'manager') return true;
  
  // Vendor can only access their own prices
  if (user.role === 'vendor' && this.vendorId.toString() === user._id.toString()) return true;
  
  // Employee and customer can view all active prices
  if (['employee', 'customer'].includes(user.role)) return this.isActive;
  
  return false;
};

export default mongoose.model("InventoryPrice", inventoryPriceSchema);
