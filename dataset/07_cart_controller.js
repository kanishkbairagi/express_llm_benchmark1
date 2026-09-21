// 07_cart_controller.js - Cart Item Addition, Quantities & Discounts

// Mock Database & Services
export const ProductCatalog = {
  findById: async (id) => null
};

export const CartModel = {
  findByUserId: async (userId) => null,
  save: async (cart) => ({ ...cart, updatedAt: new Date() })
};

export const DiscountService = {
  validate: async (code) => null
};

const recalculateCartTotals = (cart) => {
  const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discountAmount = 0;

  if (cart.discount) {
    if (cart.discount.type === 'percentage') {
      discountAmount = (subtotal * cart.discount.value) / 100;
    } else if (cart.discount.type === 'fixed') {
      discountAmount = cart.discount.value;
    }
  }

  discountAmount = Math.min(subtotal, Math.max(0, discountAmount));
  const finalTotal = Math.max(0, subtotal - discountAmount);

  cart.subtotal = parseFloat(subtotal.toFixed(2));
  cart.discountAmount = parseFloat(discountAmount.toFixed(2));
  cart.total = parseFloat(finalTotal.toFixed(2));
  return cart;
};

export const getCart = async (req, res) => {
  try {
    const userId = req.user?.id || req.query?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    let cart = await CartModel.findByUserId(userId);
    if (!cart) {
      cart = {
        userId,
        items: [],
        subtotal: 0,
        discount: null,
        discountAmount: 0,
        total: 0
      };
    }

    return res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve cart',
      details: error.message
    });
  }
};

export const addToCart = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { productId, quantity = 1 } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID is required' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive integer' });
    }

    const product = await ProductCatalog.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    let cart = await CartModel.findByUserId(userId);
    if (!cart) {
      cart = { userId, items: [], discount: null };
    }

    const existingItemIndex = cart.items.findIndex((item) => item.productId === productId);
    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += qty;
    } else {
      cart.items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: qty
      });
    }

    recalculateCartTotals(cart);
    const savedCart = await CartModel.save(cart);

    return res.status(200).json({
      success: true,
      message: 'Item added to cart',
      data: savedCart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to add item to cart',
      details: error.message
    });
  }
};

export const updateCartItemQuantity = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { productId, quantity } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!productId || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'ProductId and quantity are required' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be non-negative integer' });
    }

    const cart = await CartModel.findByUserId(userId);
    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex((item) => item.productId === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: 'Item not in cart' });
    }

    if (qty === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = qty;
    }

    recalculateCartTotals(cart);
    const savedCart = await CartModel.save(cart);

    return res.status(200).json({
      success: true,
      message: 'Cart updated',
      data: savedCart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update item quantity',
      details: error.message
    });
  }
};

export const applyCouponToCart = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { couponCode } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!couponCode || typeof couponCode !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid coupon code is required' });
    }

    const cart = await CartModel.findByUserId(userId);
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart is empty. Add items before applying coupon.' });
    }

    const discount = await DiscountService.validate(couponCode.toUpperCase().trim());
    if (!discount || !discount.isActive) {
      return res.status(400).json({ success: false, error: 'Coupon code is invalid or has expired' });
    }

    cart.discount = {
      code: discount.code,
      type: discount.type,
      value: discount.value
    };

    recalculateCartTotals(cart);
    const savedCart = await CartModel.save(cart);

    return res.status(200).json({
      success: true,
      message: `Coupon "${discount.code}" applied successfully`,
      data: savedCart
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to apply coupon',
      details: error.message
    });
  }
};
