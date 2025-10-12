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
