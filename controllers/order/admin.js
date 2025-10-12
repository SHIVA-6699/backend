import Order from '../../models/Order.js';
import OrderStatus from '../../models/OrderStatus.js';
import OrderDelivery from '../../models/OrderDelivery.js';
import OrderPayment from '../../models/OrderPayment.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';

// Get all orders (Admin)
export const getAllOrders = async (req, res) => {
  try {
    const { status, vendorId, customerId, page = 1, limit = 20 } = req.query;

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    let query = { isActive: true };
    if (status) query.orderStatus = status;
    if (vendorId) query.vendorId = vendorId;
    if (customerId) query.custUserId = customerId;

    const orders = await Order.find(query)
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
      .populate('custUserId', 'name email phone')
      .populate('vendorId', 'name email phone')
      .populate('promoCode', 'promoName discountType discountValue')
      .sort({ orderDate: -1 })
      .limit(options.limit)
      .skip(options.skip);

    const totalOrders = await Order.countDocuments(query);

    res.status(200).json({
      message: 'All orders retrieved successfully',
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
    console.error('Get all orders error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get single order details (Admin)
export const getOrderDetails = async (req, res) => {
  try {
    const { leadId } = req.params;

    const order = await Order.findOne({
      leadId,
      isActive: true
    })
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
      .populate('custUserId', 'name email phone')
      .populate('vendorId', 'name email phone')
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

    // Get payment information
    const paymentInfo = await OrderPayment.findByInvoice(order.invcNum);

    res.status(200).json({
      message: 'Order details retrieved successfully',
      order,
      statusHistory,
      deliveryInfo,
      paymentInfo
    });

  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get order statistics (Admin)
export const getOrderStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    const totalOrders = await Order.countDocuments({ isActive: true });
    const totalRevenue = await Order.aggregate([
      { $match: { isActive: true, orderStatus: { $in: ['order_confirmed', 'shipped', 'delivered'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    // Get vendor-wise statistics
    const vendorStats = await Order.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$vendorId',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          completedOrders: {
            $sum: {
              $cond: [
                { $in: ['$orderStatus', ['delivered']] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'vendor'
        }
      },
      {
        $unwind: '$vendor'
      },
      {
        $project: {
          vendorName: '$vendor.name',
          vendorEmail: '$vendor.email',
          totalOrders: 1,
          totalRevenue: 1,
          completedOrders: 1
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    // Get customer-wise statistics
    const customerStats = await Order.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$custUserId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $unwind: '$customer'
      },
      {
        $project: {
          customerName: '$customer.name',
          customerEmail: '$customer.email',
          totalOrders: 1,
          totalSpent: 1
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      message: 'Order statistics retrieved successfully',
      stats: {
        totalOrders: totalOrders || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        statusBreakdown: stats || [],
        topVendors: vendorStats || [],
        topCustomers: customerStats || []
      }
    });

  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get orders by date range (Admin)
export const getOrdersByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'Start date and end date are required'
      });
    }

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    const query = {
      isActive: true,
      orderDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    const orders = await Order.find(query)
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
      .populate('custUserId', 'name email phone')
      .populate('vendorId', 'name email phone')
      .populate('promoCode', 'promoName discountType discountValue')
      .sort({ orderDate: -1 })
      .limit(options.limit)
      .skip(options.skip);

    const totalOrders = await Order.countDocuments(query);

    res.status(200).json({
      message: 'Orders by date range retrieved successfully',
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
    console.error('Get orders by date range error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Cancel order (Admin)
export const cancelOrder = async (req, res) => {
  try {
    const { leadId } = req.params;
    const adminId = req.user.userId;
    const { reason } = req.body;

    const order = await Order.findOne({
      leadId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    if (order.orderStatus === 'delivered') {
      return res.status(400).json({
        message: 'Cannot cancel delivered order'
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
      adminId,
      reason || 'Order cancelled by admin'
    );

    res.status(200).json({
      message: 'Order cancelled successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus
      }
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get payment statistics (Admin)
export const getPaymentStats = async (req, res) => {
  try {
    const paymentStats = await OrderPayment.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$orderAmount' }
        }
      }
    ]);

    const totalPayments = await OrderPayment.countDocuments({ isActive: true });
    const successfulPayments = await OrderPayment.countDocuments({ 
      isActive: true, 
      paymentStatus: 'successful' 
    });

    const totalRevenue = await OrderPayment.aggregate([
      { $match: { isActive: true, paymentStatus: 'successful' } },
      { $group: { _id: null, total: { $sum: '$orderAmount' } } }
    ]);

    res.status(200).json({
      message: 'Payment statistics retrieved successfully',
      stats: {
        totalPayments: totalPayments || 0,
        successfulPayments: successfulPayments || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        paymentStatusBreakdown: paymentStats || []
      }
    });

  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get delivery statistics (Admin)
export const getDeliveryStats = async (req, res) => {
  try {
    const deliveryStats = await OrderDelivery.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$deliveryStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalDeliveries = await OrderDelivery.countDocuments({ isActive: true });
    const completedDeliveries = await OrderDelivery.countDocuments({ 
      isActive: true, 
      deliveryStatus: 'delivered' 
    });

    const pendingDeliveries = await OrderDelivery.countDocuments({ 
      isActive: true, 
      deliveryStatus: { $in: ['pending', 'picked_up', 'in_transit', 'out_for_delivery'] }
    });

    res.status(200).json({
      message: 'Delivery statistics retrieved successfully',
      stats: {
        totalDeliveries: totalDeliveries || 0,
        completedDeliveries: completedDeliveries || 0,
        pendingDeliveries: pendingDeliveries || 0,
        deliveryStatusBreakdown: deliveryStats || []
      }
    });

  } catch (error) {
    console.error('Get delivery stats error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Mark payment as done (Admin - Manual payment confirmation)
export const markPaymentDone = async (req, res) => {
  try {
    const { leadId } = req.params;
    const adminId = req.user.userId;
    const { 
      paidAmount, 
      paymentMethod = 'bank_transfer', 
      transactionId, 
      paymentDate = new Date(),
      remarks 
    } = req.body;

    // Find the order
    const order = await Order.findOne({
      leadId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    // Check if order is in correct state
    if (order.orderStatus !== 'vendor_accepted') {
      return res.status(400).json({
        message: `Cannot mark payment for order in ${order.orderStatus} status. Order must be in vendor_accepted status.`
      });
    }

    // Validate paid amount
    if (!paidAmount || paidAmount <= 0) {
      return res.status(400).json({
        message: 'Valid paid amount is required'
      });
    }

    // Create or update payment record
    let payment = await OrderPayment.findOne({ invcNum: order.invcNum });
    
    if (payment) {
      // Update existing payment
      payment.paidAmount = paidAmount;
      payment.paymentStatus = 'completed';
      payment.paymentMethod = paymentMethod;
      payment.transactionId = transactionId;
      payment.paymentDate = paymentDate;
      await payment.save();
    } else {
      // Create new payment record
      payment = await OrderPayment.create({
        leadId: order.leadId,
        invcNum: order.invcNum,
        custUserId: order.custUserId,
        vendorId: order.vendorId,
        totalAmount: order.totalAmount,
        paidAmount: paidAmount,
        paymentStatus: 'completed',
        paymentMethod: paymentMethod,
        transactionId: transactionId,
        paymentDate: paymentDate,
        orderAmount: order.totalAmount
      });
    }

    // Update order status to payment_done
    await order.updateStatus('payment_done');

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'payment_done',
      adminId,
      remarks || `Payment of ₹${paidAmount} received via ${paymentMethod}${transactionId ? ` (Transaction ID: ${transactionId})` : ''}`
    );

    res.status(200).json({
      message: 'Payment marked as done successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount
      },
      payment: {
        leadId: payment.leadId,
        paidAmount: payment.paidAmount,
        paymentStatus: payment.paymentStatus,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId
      }
    });

  } catch (error) {
    console.error('Mark payment done error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Confirm order after payment (Admin)
export const confirmOrder = async (req, res) => {
  try {
    const { leadId } = req.params;
    const adminId = req.user.userId;
    const { remarks } = req.body;

    // Find the order
    const order = await Order.findOne({
      leadId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    // Check if order is in correct state
    if (order.orderStatus !== 'payment_done') {
      return res.status(400).json({
        message: `Cannot confirm order in ${order.orderStatus} status. Payment must be completed first.`
      });
    }

    // Update order status to order_confirmed
    await order.updateStatus('order_confirmed');

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'order_confirmed',
      adminId,
      remarks || 'Order confirmed by admin, ready for dispatch'
    );

    res.status(200).json({
      message: 'Order confirmed successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount
      }
    });

  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update order status manually (Admin override)
export const updateOrderStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const adminId = req.user.userId;
    const { orderStatus, remarks } = req.body;

    if (!orderStatus) {
      return res.status(400).json({
        message: 'Order status is required'
      });
    }

    const validStatuses = [
      'pending', 'vendor_accepted', 'payment_done', 'order_confirmed',
      'truck_loading', 'in_transit', 'shipped', 'out_for_delivery',
      'delivered', 'cancelled'
    ];

    if (!validStatuses.includes(orderStatus)) {
      return res.status(400).json({
        message: `Invalid order status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Find the order
    const order = await Order.findOne({
      leadId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
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
      adminId,
      remarks || `Order status updated to ${orderStatus} by admin`
    );

    res.status(200).json({
      message: 'Order status updated successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount
      }
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get payment details for specific order (Admin)
export const getPaymentDetails = async (req, res) => {
  try {
    const { leadId } = req.params;

    const order = await Order.findOne({ leadId, isActive: true });
    
    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    const payment = await OrderPayment.findByInvoice(order.invcNum);

    if (!payment) {
      return res.status(404).json({
        message: 'Payment details not found'
      });
    }

    res.status(200).json({
      message: 'Payment details retrieved successfully',
      payment
    });

  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all payments (Admin)
export const getAllPayments = async (req, res) => {
  try {
    const { paymentStatus, paymentMethod, page = 1, limit = 20 } = req.query;

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    let query = { isActive: true };
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (paymentMethod) query.paymentMethod = paymentMethod;

    const payments = await OrderPayment.find(query)
      .populate('custUserId', 'name email phone')
      .populate('vendorId', 'name email phone')
      .sort({ paymentDate: -1 })
      .limit(options.limit)
      .skip(options.skip);

    const totalPayments = await OrderPayment.countDocuments(query);

    res.status(200).json({
      message: 'Payments retrieved successfully',
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPayments / parseInt(limit)),
        totalItems: totalPayments,
        hasNext: parseInt(page) < Math.ceil(totalPayments / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update delivery information (Admin)
export const updateDelivery = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { 
      deliveryStatus, 
      trackingNumber, 
      courierService, 
      expectedDeliveryDate,
      remarks 
    } = req.body;

    const order = await Order.findOne({ leadId, isActive: true });
    
    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    let delivery = await OrderDelivery.findByOrder(leadId);

    if (!delivery) {
      // Create new delivery record
      delivery = await OrderDelivery.create({
        leadId,
        invcNum: order.invcNum,
        custUserId: order.custUserId,
        vendorId: order.vendorId,
        address: order.deliveryAddress,
        pincode: order.deliveryPincode,
        deliveryStatus: deliveryStatus || 'pending',
        trackingNumber,
        courierService,
        expectedDeliveryDate
      });
    } else {
      // Update existing delivery
      if (deliveryStatus) delivery.deliveryStatus = deliveryStatus;
      if (trackingNumber) delivery.trackingNumber = trackingNumber;
      if (courierService) delivery.courierService = courierService;
      if (expectedDeliveryDate) delivery.expectedDeliveryDate = expectedDeliveryDate;
      await delivery.save();
    }

    res.status(200).json({
      message: 'Delivery information updated successfully',
      delivery
    });

  } catch (error) {
    console.error('Update delivery error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get delivery details for specific order (Admin)
export const getDeliveryDetails = async (req, res) => {
  try {
    const { leadId } = req.params;

    const delivery = await OrderDelivery.findByOrder(leadId);

    if (!delivery) {
      return res.status(404).json({
        message: 'Delivery details not found'
      });
    }

    res.status(200).json({
      message: 'Delivery details retrieved successfully',
      delivery
    });

  } catch (error) {
    console.error('Get delivery details error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Mark order as delivered (Admin)
export const markDelivered = async (req, res) => {
  try {
    const { leadId } = req.params;
    const adminId = req.user.userId;
    const { deliveredDate = new Date(), receivedBy, remarks } = req.body;

    const order = await Order.findOne({ leadId, isActive: true });
    
    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    // Update order status to delivered
    await order.updateStatus('delivered');

    // Update delivery record
    let delivery = await OrderDelivery.findByOrder(leadId);
    if (delivery) {
      delivery.deliveryStatus = 'delivered';
      delivery.deliveredDate = deliveredDate;
      if (receivedBy) delivery.receivedBy = receivedBy;
      await delivery.save();
    }

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'delivered',
      adminId,
      remarks || `Order delivered successfully${receivedBy ? `, received by ${receivedBy}` : ''}`
    );

    res.status(200).json({
      message: 'Order marked as delivered successfully',
      order: {
        leadId: order.leadId,
        orderStatus: order.orderStatus
      },
      delivery: {
        deliveryStatus: delivery?.deliveryStatus,
        deliveredDate: delivery?.deliveredDate
      }
    });

  } catch (error) {
    console.error('Mark delivered error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get order status history (Admin)
export const getStatusHistory = async (req, res) => {
  try {
    const { leadId } = req.params;

    const statusHistory = await OrderStatus.getOrderStatusHistory(leadId);

    res.status(200).json({
      message: 'Status history retrieved successfully',
      statusHistory,
      count: statusHistory.length
    });

  } catch (error) {
    console.error('Get status history error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};
