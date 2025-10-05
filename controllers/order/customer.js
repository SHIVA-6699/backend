import Order from '../../models/Order.js';
import OrderStatus from '../../models/OrderStatus.js';
import OrderDelivery from '../../models/OrderDelivery.js';
import OrderPayment from '../../models/OrderPayment.js';
import Inventory from '../../models/Inventory.js';
import InventoryPrice from '../../models/InventoryPrice.js';
import { validationResult } from 'express-validator';

// Add item to cart (Create order)
export const addToCart = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { itemCode, qty } = req.body;
    const customerId = req.user.userId;

    // Get inventory item and pricing
    const inventoryItem = await Inventory.findById(itemCode);
    if (!inventoryItem) {
      return res.status(404).json({
        message: 'Inventory item not found'
      });
    }

    if (!inventoryItem.isActive) {
      return res.status(400).json({
        message: 'Item is not available'
      });
    }

    const pricing = await InventoryPrice.findOne({ itemCode });
    if (!pricing) {
      return res.status(404).json({
        message: 'Pricing not found for this item'
      });
    }

    // Check if customer already has a pending order with this vendor
    const existingOrder = await Order.findOne({
      custUserId: customerId,
      vendorId: inventoryItem.vendorId,
      orderStatus: 'pending',
      isActive: true
    });

    let order;

    if (existingOrder) {
      // Add item to existing order
      order = await existingOrder.addItem(itemCode, qty, pricing.unitPrice);
    } else {
      // Create new order
      const itemTotalCost = qty * pricing.unitPrice;
      order = new Order({
        custUserId: customerId,
        vendorId: inventoryItem.vendorId,
        items: [{
          itemCode,
          qty,
          unitPrice: pricing.unitPrice,
          totalCost: itemTotalCost
        }],
        totalQty: qty,
        totalAmount: itemTotalCost,
        deliveryAddress: req.body.deliveryAddress || 'Address to be updated',
        deliveryPincode: req.body.deliveryPincode || '000000',
        deliveryExpectedDate: req.body.deliveryExpectedDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        custPhoneNum: req.body.custPhoneNum || req.user.phone || '0000000000',
        receiverMobileNum: req.body.receiverMobileNum || req.user.phone || '0000000000'
      });

      await order.save();
    }

    // Create initial status
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'pending',
      customerId,
      'Order created and added to cart'
    );

    // Populate order details
    await order.populate([
      { path: 'items.itemCode', select: 'itemDescription category subCategory primaryImage' },
      { path: 'vendorId', select: 'name email phone' },
      { path: 'custUserId', select: 'name email phone' }
    ]);

    res.status(201).json({
      message: 'Item added to cart successfully',
      order: {
        leadId: order.leadId,
        formattedLeadId: order.formattedLeadId,
        items: order.items,
        totalQty: order.totalQty,
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        vendorId: order.vendorId,
        orderDate: order.orderDate,
        invcNum: order.invcNum
      }
    });

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get customer's cart/orders
export const getCustomerOrders = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    let query = { custUserId: customerId, isActive: true };
    if (status) {
      query.orderStatus = status;
    }

    const orders = await Order.find(query)
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
      .populate('vendorId', 'name email phone')
      .populate('promoCode', 'promoName discountType discountValue')
      .sort({ orderDate: -1 })
      .limit(options.limit)
      .skip(options.skip);

    const totalOrders = await Order.countDocuments(query);

    res.status(200).json({
      message: 'Orders retrieved successfully',
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
    console.error('Get customer orders error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get single order details
export const getOrderDetails = async (req, res) => {
  try {
    const { leadId } = req.params;
    const customerId = req.user.userId;

    const order = await Order.findOne({
      leadId,
      custUserId: customerId,
      isActive: true
    })
      .populate('items.itemCode', 'itemDescription category subCategory primaryImage')
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

// Update order (add/remove items, update delivery info)
export const updateOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { leadId } = req.params;
    const customerId = req.user.userId;
    const { deliveryAddress, deliveryPincode, deliveryExpectedDate, receiverMobileNum } = req.body;

    const order = await Order.findOne({
      leadId,
      custUserId: customerId,
      orderStatus: 'pending',
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found or cannot be updated'
      });
    }

    // Update delivery information
    if (deliveryAddress) order.deliveryAddress = deliveryAddress;
    if (deliveryPincode) order.deliveryPincode = deliveryPincode;
    if (deliveryExpectedDate) order.deliveryExpectedDate = deliveryExpectedDate;
    if (receiverMobileNum) order.receiverMobileNum = receiverMobileNum;

    await order.save();

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'pending',
      customerId,
      'Order details updated'
    );

    res.status(200).json({
      message: 'Order updated successfully',
      order
    });

  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { itemCode } = req.body;
    const customerId = req.user.userId;

    const order = await Order.findOne({
      leadId,
      custUserId: customerId,
      orderStatus: 'pending',
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found or cannot be updated'
      });
    }

    await order.removeItem(itemCode);

    // If no items left, delete the order
    if (order.items.length === 0) {
      order.isActive = false;
      await order.save();
      
      return res.status(200).json({
        message: 'Order deleted as no items remaining',
        order: null
      });
    }

    await order.save();

    res.status(200).json({
      message: 'Item removed from cart successfully',
      order
    });

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Place order (Move from cart to placed)
export const placeOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { leadId } = req.params;
    const customerId = req.user.userId;
    const { deliveryAddress, deliveryPincode, deliveryExpectedDate, receiverMobileNum } = req.body;

    const order = await Order.findOne({
      leadId,
      custUserId: customerId,
      orderStatus: 'pending',
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found or cannot be placed'
      });
    }

    if (order.items.length === 0) {
      return res.status(400).json({
        message: 'Cannot place empty order'
      });
    }

    // Update delivery information
    order.deliveryAddress = deliveryAddress;
    order.deliveryPincode = deliveryPincode;
    order.deliveryExpectedDate = deliveryExpectedDate;
    order.receiverMobileNum = receiverMobileNum;

    await order.save();

    // Create status update
    await OrderStatus.createStatusUpdate(
      order.leadId,
      order.invcNum,
      order.vendorId,
      'pending',
      customerId,
      'Order placed and sent to vendor'
    );

    // Create delivery record
    const delivery = new OrderDelivery({
      leadId: order.leadId,
      invcNum: order.invcNum,
      userId: customerId,
      address: deliveryAddress,
      pincode: deliveryPincode,
      deliveryExpectedDate: deliveryExpectedDate,
      deliveryStatus: 'pending'
    });

    await delivery.save();

    res.status(200).json({
      message: 'Order placed successfully',
      order: {
        leadId: order.leadId,
        formattedLeadId: order.formattedLeadId,
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        vendorId: order.vendorId,
        deliveryAddress: order.deliveryAddress,
        deliveryExpectedDate: order.deliveryExpectedDate
      }
    });

  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Process payment (Simulate for now)
export const processPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { leadId } = req.params;
    const customerId = req.user.userId;
    const { paymentType, paymentMode } = req.body;

    const order = await Order.findOne({
      leadId,
      custUserId: customerId,
      orderStatus: 'vendor_accepted',
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found or payment cannot be processed'
      });
    }

    // Create payment record
    const payment = new OrderPayment({
      invcNum: order.invcNum,
      paymentType,
      paymentMode,
      orderAmount: order.totalAmount,
      paymentStatus: 'processing'
    });

    await payment.save();

    // Simulate payment processing (for now)
    setTimeout(async () => {
      try {
        await payment.markAsSuccessful();
        
        // Update order status
        await order.updateStatus('payment_done');
        
        // Create status update
        await OrderStatus.createStatusUpdate(
          order.leadId,
          order.invcNum,
          order.vendorId,
          'payment_done',
          customerId,
          'Payment processed successfully'
        );

        // Update to order confirmed
        await order.updateStatus('order_confirmed');
        
        await OrderStatus.createStatusUpdate(
          order.leadId,
          order.invcNum,
          order.vendorId,
          'order_confirmed',
          customerId,
          'Order confirmed after successful payment'
        );

      } catch (error) {
        console.error('Payment processing error:', error);
      }
    }, 2000); // 2 second delay to simulate processing

    res.status(200).json({
      message: 'Payment processing initiated',
      payment: {
        transactionId: payment.transactionId,
        paymentType: payment.paymentType,
        paymentMode: payment.paymentMode,
        orderAmount: payment.orderAmount,
        paymentStatus: payment.paymentStatus
      }
    });

  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get payment status
export const getPaymentStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const customerId = req.user.userId;

    const order = await Order.findOne({
      leadId,
      custUserId: customerId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    const payment = await OrderPayment.findByInvoice(order.invcNum);

    if (!payment) {
      return res.status(404).json({
        message: 'Payment information not found'
      });
    }

    res.status(200).json({
      message: 'Payment status retrieved successfully',
      payment: payment.getPaymentSummary()
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};
