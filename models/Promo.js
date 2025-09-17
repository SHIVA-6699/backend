import mongoose from "mongoose";

const promoSchema = new mongoose.Schema(
  {
    // Auto-generated Promo ID
    promoId: {
      type: String,
      unique: true,
      default: function() {
        return `PROMO-${this._id.toString()}`;
      }
    },
    
    // Promo Information
    promoName: {
      type: String,
      required: true,
      trim: true
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      max: 100 // Percentage discount
    },
    discountAmount: {
      type: Number,
      min: 0 // Fixed amount discount
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },

    // Promo Validity
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },

    // Minimum Order Requirements
    minOrderValue: {
      type: Number,
      min: 0,
      default: 0
    },
    maxDiscountAmount: {
      type: Number,
      min: 0
    },

    // Usage Limits
    usageLimit: {
      type: Number,
      min: 0 // 0 means unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0
    },

    // Relationships
    itemCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
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

// Virtual for promo status
promoSchema.virtual('status').get(function() {
  const now = new Date();
  if (!this.isActive) return 'inactive';
  if (now < this.startDate) return 'upcoming';
  if (now > this.endDate) return 'expired';
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) return 'exhausted';
  return 'active';
});

// Virtual for formatted discount
promoSchema.virtual('formattedDiscount').get(function() {
  if (this.discountType === 'percentage') {
    return `${this.discount}% OFF`;
  } else {
    return `₹${this.discountAmount} OFF`;
  }
});

// Pre-save middleware to update timestamps
promoSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updateDate = new Date();
    this.updateTimestamp = new Date();
  }
  next();
});

// Indexes for better performance
promoSchema.index({ promoId: 1 });
promoSchema.index({ itemCode: 1 });
promoSchema.index({ createdBy: 1 });
promoSchema.index({ startDate: 1, endDate: 1 });
promoSchema.index({ isActive: 1 });
promoSchema.index({ promoName: 'text' });

// Static method to get active promos
promoSchema.statics.getActivePromos = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  })
  .populate('itemCode', 'itemDescription category subCategory')
  .populate('createdBy', 'name email');
};

// Static method to get promos by item
promoSchema.statics.getByItem = function(itemCode) {
  const now = new Date();
  return this.find({
    itemCode,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  })
  .populate('itemCode', 'itemDescription category subCategory')
  .populate('createdBy', 'name email');
};

// Method to check if promo is valid
promoSchema.methods.isValid = function() {
  const now = new Date();
  return this.isActive && 
         now >= this.startDate && 
         now <= this.endDate &&
         (this.usageLimit === 0 || this.usedCount < this.usageLimit);
};

// Method to calculate discount amount
promoSchema.methods.calculateDiscount = function(orderValue) {
  if (!this.isValid() || orderValue < this.minOrderValue) {
    return 0;
  }

  let discountAmount = 0;
  
  if (this.discountType === 'percentage') {
    discountAmount = (orderValue * this.discount) / 100;
  } else {
    discountAmount = this.discountAmount;
  }

  // Apply maximum discount limit
  if (this.maxDiscountAmount && discountAmount > this.maxDiscountAmount) {
    discountAmount = this.maxDiscountAmount;
  }

  return Math.min(discountAmount, orderValue);
};

// Method to use promo
promoSchema.methods.usePromo = function() {
  if (this.usageLimit > 0) {
    this.usedCount += 1;
  }
  return this.save();
};

// Method to check if user can access this promo
promoSchema.methods.canAccess = function(user) {
  // Admin can access everything
  if (user.role === 'admin') return true;
  
  // Manager can access everything
  if (user.role === 'manager') return true;
  
  // Vendor can only access their own promos
  if (user.role === 'vendor' && this.createdBy.toString() === user._id.toString()) return true;
  
  // Employee and customer can view all active promos
  if (['employee', 'customer'].includes(user.role)) return this.isActive;
  
  return false;
};

export default mongoose.model("Promo", promoSchema);
