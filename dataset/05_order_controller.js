// 05_order_controller.js - Order Creation & Inventory Stock Deduction

// Mock Database Models
export const Inventory = {
  findProduct: async (id) => null,
  decrementStock: async (id, quantity) => true,
  incrementStock: async (id, quantity) => true
};

export const OrderModel = {
  create: async (orderData) => ({ id: 'ord_987654', ...orderData, createdAt: new Date() }),
  findById: async (id) => null,
  update: async (id, data) => ({ id, ...data })
};

export const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress } = req.body || {};
    const userId = req.user?.id || req.body?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order must contain at least one item'
      });
    }

    if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || !shippingAddress.postalCode) {
      return res.status(400).json({
        success: false,
        error: 'Complete shipping address is required (street, city, postalCode)'
      });
    }

    let calculatedTotal = 0;
    const validatedItems = [];

    // Phase 1: Validate items & stock availability
    for (const item of items) {
      const { productId, quantity } = item;

      if (!productId || typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
        return res.status(400).json({
          success: false,
          error: 'Each item must have a valid productId and an integer quantity greater than zero'
        });
      }

      const product = await Inventory.findProduct(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product with ID ${productId} not found`
        });
      }

      if (product.stock < quantity) {
        return res.status(409).json({
          success: false,
          error: `Insufficient stock for product "${product.name || productId}". Available: ${product.stock}, requested: ${quantity}`
        });
      }

      const itemTotal = product.price * quantity;
      calculatedTotal += itemTotal;

      validatedItems.push({
        productId,
        name: product.name,
        unitPrice: product.price,
        quantity,
        total: itemTotal
      });
    }

    // Phase 2: Deduct inventory
    for (const item of validatedItems) {
      await Inventory.decrementStock(item.productId, item.quantity);
    }

    // Phase 3: Create order record
    const tax = parseFloat((calculatedTotal * 0.08).toFixed(2));
    const grandTotal = parseFloat((calculatedTotal + tax).toFixed(2));

    const newOrder = await OrderModel.create({
      userId,
      items: validatedItems,
      subtotal: calculatedTotal,
      tax,
      total: grandTotal,
      status: 'pending',
      shippingAddress
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: newOrder
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process order creation',
      details: error.message
    });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params || {};
    const userId = req.user?.id || req.body?.userId;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const order = await OrderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: `Order with ID ${orderId} not found`
      });
    }

    if (userId && order.userId !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to cancel this order'
      });
    }

    const nonCancellableStatuses = ['shipped', 'delivered', 'cancelled'];
    if (nonCancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel an order with status "${order.status}"`
      });
    }

    // Restore inventory stock
    for (const item of order.items) {
      await Inventory.incrementStock(item.productId, item.quantity);
    }

    const updatedOrder = await OrderModel.update(orderId, {
      status: 'cancelled',
      cancelledAt: new Date()
    });

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully and stock restored',
      data: updatedOrder
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
      details: error.message
    });
  }
};
