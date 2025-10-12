import Order from '../../models/Order.js';
import OrderStatus from '../../models/OrderStatus.js';
import OrderDelivery from '../../models/OrderDelivery.js';
import { validationResult } from 'express-validator';

// Get vendor's orders
export const getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    let query = { vendorId, isActive: true };
    if (status) {
      query.orderStatus = status;
    }

    const orders = await Order.find(query)
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
      .populate('custUserId', 'name email phone')
      .populate('promoCode', 'promoName discountType discountValue')
      .sort({ orderDate: -1 })
      .limit(options.limit)
      .skip(options.skip);

    const totalOrders = await Order.countDocuments(query);

    res.status(200).json({
      message: 'Vendor orders retrieved successfully',
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
        totalItems: totalOrders,
        hasNext: parseInt(page) < Math.ceil(totalOrders / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get vendor orders error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get single vendor order details
export const getVendorOrderDetails = async (req, res) => {
  try {
    const { leadId } = req.params;
    const vendorId = req.user.userId;

    const order = await Order.findOne({
      leadId,
      vendorId,
      isActive: true
    })
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
      .populate('custUserId', 'name email phone')
      .populate('promoCode', 'promoName discountType discountValue');

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    // Get order status history
    const statusHistory = await OrderStatus.getOrderStatusHistory(leadId);

    // Get delivery information
    const deliveryInfo = await OrderDelivery.findByOrder(leadId);

    res.status(200).json({
      message: 'Vendor order details retrieved successfully',
      order,
      statusHistory,
      deliveryInfo
    });

  } catch (error) {
    console.error('Get vendor order details error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Accept order (Vendor)
export const acceptOrder = async (req, res) => {
  try {
    const { leadId } = req.params;
    const vendorId = req.user.userId;
    const { remarks } = req.body;

    const order = await Order.findOne({
      leadId,
      vendorId,
      orderStatus: 'pending',
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found or cannot be accepted'
      });
    }

    // Update order status
    await order.updateStatus('vendor_accepted');

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'vendor_accepted',
      vendorId,
      remarks || 'Order accepted by vendor'
    );

    res.status(200).json({
      message: 'Order accepted successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount
      }
    });

  } catch (error) {
    console.error('Accept order error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Reject order (Vendor)
export const rejectOrder = async (req, res) => {
  try {
    const { leadId } = req.params;
    const vendorId = req.user.userId;
    const { remarks } = req.body;

    const order = await Order.findOne({
      leadId,
      vendorId,
      orderStatus: 'pending',
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found or cannot be rejected'
      });
    }

    // Update order status
    await order.updateStatus('cancelled');

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'cancelled',
      vendorId,
      remarks || 'Order rejected by vendor'
    );

    res.status(200).json({
      message: 'Order rejected successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus
      }
    });

  } catch (error) {
    console.error('Reject order error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update delivery tracking (Vendor)
export const updateDeliveryTracking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { leadId } = req.params;
    const vendorId = req.user.userId;
    const { trackingNumber, courierService, trackingUrl, deliveryStatus, deliveryNotes } = req.body;

    const order = await Order.findOne({
      leadId,
      vendorId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    // Get or create delivery record
    let delivery = await OrderDelivery.findByOrder(leadId);
    
    if (!delivery) {
      delivery = new OrderDelivery({
        leadId: order.leadId,
        invcNum: order.invcNum,
        userId: vendorId,
        address: order.deliveryAddress,
        pincode: order.deliveryPincode,
        deliveryExpectedDate: order.deliveryExpectedDate,
        deliveryStatus: 'pending'
      });
    }

    // Update tracking information
    if (trackingNumber && courierService) {
      await delivery.addTrackingInfo(trackingNumber, courierService, trackingUrl);
    }

    if (deliveryStatus) {
      await delivery.updateDeliveryStatus(deliveryStatus, deliveryNotes);
    }

    // Update order status based on delivery status
    if (deliveryStatus === 'delivered') {
      await order.updateStatus('delivered');
      
      // Create status update
      await OrderStatus.createStatusUpdate(
        order.leadId,
        order.invcNum,
        order.vendorId,
        'delivered',
        vendorId,
        'Order delivered successfully'
      );
    } else if (deliveryStatus === 'in_transit' || deliveryStatus === 'out_for_delivery') {
      await order.updateStatus('shipped');
      
      // Create status update
      await OrderStatus.createStatusUpdate(
        order.leadId,
        order.invcNum,
        order.vendorId,
        'shipped',
        vendorId,
        'Order shipped and in transit'
      );
    }

    res.status(200).json({
      message: 'Delivery tracking updated successfully',
      delivery: {
        leadId: delivery.leadId,
        trackingNumber: delivery.trackingNumber,
        courierService: delivery.courierService,
        trackingUrl: delivery.trackingUrl,
        deliveryStatus: delivery.deliveryStatus,
        deliveryNotes: delivery.deliveryNotes
      }
    });

  } catch (error) {
    console.error('Update delivery tracking error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get vendor order statistics
export const getVendorOrderStats = async (req, res) => {
  try {
    const vendorId = req.user.userId;

    const stats = await Order.aggregate([
      { $match: { vendorId: vendorId, isActive: true } },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    const totalOrders = await Order.countDocuments({ vendorId, isActive: true });
    const totalRevenue = await Order.aggregate([
      { $match: { vendorId: vendorId, isActive: true, orderStatus: { $in: ['order_confirmed', 'shipped', 'delivered'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.status(200).json({
      message: 'Vendor order statistics retrieved successfully',
      stats: {
        totalOrders: totalOrders || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        statusBreakdown: stats || []
      }
    });

  } catch (error) {
    console.error('Get vendor order stats error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get pending orders for vendor
export const getPendingOrders = async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    const orders = await Order.find({
      vendorId,
      orderStatus: 'pending',
      isActive: true
    })
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
      .populate('custUserId', 'name email phone')
      .sort({ orderDate: -1 })
      .limit(options.limit)
      .skip(options.skip);

    const totalOrders = await Order.countDocuments({
      vendorId,
      orderStatus: 'pending',
      isActive: true
    });

    res.status(200).json({
      message: 'Pending orders retrieved successfully',
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
        totalItems: totalOrders,
        hasNext: parseInt(page) < Math.ceil(totalOrders / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get pending orders error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update order status (Vendor - for shipping statuses)
export const updateVendorOrderStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const vendorId = req.user.userId;
    const { orderStatus, remarks } = req.body;

    if (!orderStatus) {
      return res.status(400).json({
        message: 'Order status is required'
      });
    }

    // Vendor can only update to specific statuses (shipping-related)
    const allowedStatuses = [
      'truck_loading',
      'in_transit', 
      'shipped',
      'out_for_delivery',
      'delivered'
    ];

    if (!allowedStatuses.includes(orderStatus)) {
      return res.status(400).json({
        message: `Vendors can only update status to: ${allowedStatuses.join(', ')}`
      });
    }

    // Find the order
    const order = await Order.findOne({
      leadId,
      vendorId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found or you do not have permission to update this order'
      });
    }

    // Check if order is in a state where vendor can update
    const allowedCurrentStatuses = ['order_confirmed', 'truck_loading', 'in_transit', 'shipped', 'out_for_delivery'];
    if (!allowedCurrentStatuses.includes(order.orderStatus)) {
      return res.status(400).json({
        message: `Cannot update order status from ${order.orderStatus}. Order must be confirmed first.`
      });
    }

    // Update order status
    await order.updateStatus(orderStatus);

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      orderStatus,
      vendorId,
      remarks || `Order status updated to ${orderStatus} by vendor`
    );

    // If status is delivered, update delivery record
    if (orderStatus === 'delivered') {
      let delivery = await OrderDelivery.findByOrder(leadId);
      if (delivery) {
        delivery.deliveryStatus = 'delivered';
        delivery.deliveredDate = new Date();
        await delivery.save();
      }
    }

    res.status(200).json({
      message: 'Order status updated successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount,
        formattedLeadId: order.formattedLeadId
      }
    });

  } catch (error) {
    console.error('Update vendor order status error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};
