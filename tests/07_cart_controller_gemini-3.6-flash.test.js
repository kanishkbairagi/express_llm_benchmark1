import { jest } from '@jest/globals';
import {
  getCart,
  addToCart,
  updateCartItemQuantity,
  applyCouponToCart,
  ProductCatalog,
  CartModel,
  DiscountService
} from '../dataset/07_cart_controller.js';

describe('Cart Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      user: null,
      query: {},
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getCart', () => {
    test('should return 401 if user authentication is missing', async () => {
      await getCart(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return existing cart for authenticated user via req.user', async () => {
      req.user = { id: 'user123' };
      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'p1', name: 'Item 1', price: 10, quantity: 2 }],
        subtotal: 20,
        discount: null,
        discountAmount: 0,
        total: 20
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);

      await getCart(req, res);

      expect(CartModel.findByUserId).toHaveBeenCalledWith('user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart
      });
    });

    test('should return default empty cart if user has no cart in DB via req.query', async () => {
      req.query = { userId: 'user456' };
      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);

      await getCart(req, res);

      expect(CartModel.findByUserId).toHaveBeenCalledWith('user456');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user456',
          items: [],
          subtotal: 0,
          discount: null,
          discountAmount: 0,
          total: 0
        }
      });
    });

    test('should return 500 when database throws an error', async () => {
      req.user = { id: 'user123' };
      jest.spyOn(CartModel, 'findByUserId').mockRejectedValue(new Error('Database error'));

      await getCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve cart',
        details: 'Database error'
      });
    });
  });

  describe('addToCart', () => {
    test('should return 401 if authentication is missing', async () => {
      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if productId is missing', async () => {
      req.user = { id: 'user123' };
      req.body = { quantity: 2 };

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    test('should return 400 if quantity is zero or invalid integer', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 0 };

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Quantity must be a positive integer'
      });
    });

    test('should return 400 if quantity is a negative integer or non-number string', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 'abc' };

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Quantity must be a positive integer'
      });
    });

    test('should return 404 if product is not found in ProductCatalog', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p999', quantity: 1 };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      await addToCart(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    test('should create a new cart and add item if cart does not exist', async () => {
      req.body = { userId: 'user123', productId: 'p1', quantity: 2 };
      const mockProduct = { id: 'p1', name: 'Widget', price: 15.5 };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({ ...c, updatedAt: new Date() }));

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to cart',
        data: expect.objectContaining({
          userId: 'user123',
          items: [{ productId: 'p1', name: 'Widget', price: 15.5, quantity: 2 }],
          subtotal: 31,
          discountAmount: 0,
          total: 31
        })
      });
    });

    test('should update item quantity if item already exists in cart', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 3 };

      const mockProduct = { id: 'p1', name: 'Widget', price: 10 };
      const existingCart = {
        userId: 'user123',
        items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 2 }],
        discount: { type: 'percentage', value: 10 }
      };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await addToCart(req, res);

      expect(existingCart.items[0].quantity).toBe(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to cart',
        data: expect.objectContaining({
          subtotal: 50,
          discountAmount: 5,
          total: 45
        })
      });
    });

    test('should handle fixed discount calculations and cap discount to subtotal', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 1 };

      const mockProduct = { id: 'p1', name: 'Widget', price: 20 };
      const existingCart = {
        userId: 'user123',
        items: [],
        discount: { type: 'fixed', value: 50 }
      };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to cart',
        data: expect.objectContaining({
          subtotal: 20,
          discountAmount: 20,
          total: 0
        })
      });
    });

    test('should return 500 when an exception occurs during addToCart', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1' };

      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('Catalog error'));

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to add item to cart',
        details: 'Catalog error'
      });
    });
  });

  describe('updateCartItemQuantity', () => {
    test('should return 401 if authentication is missing', async () => {
      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if productId or quantity is missing', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1' }; // missing quantity

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'ProductId and quantity are required'
      });
    });

    test('should return 400 if quantity is negative', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: -1 };

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Quantity must be non-negative integer'
      });
    });

    test('should return 404 if cart is not found', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 2 };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cart not found'
      });
    });

    test('should return 404 if item is not in cart', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p2', quantity: 2 };

      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 1 }]
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Item not in cart'
      });
    });

    test('should remove item when quantity is updated to 0', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 0 };

      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 2 }],
        discount: null
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await updateCartItemQuantity(req, res);

      expect(mockCart.items.length).toBe(0);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cart updated',
        data: expect.objectContaining({
          subtotal: 0,
          total: 0
        })
      });
    });

    test('should update item quantity when quantity > 0', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 5 };

      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 2 }],
        discount: null
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await updateCartItemQuantity(req, res);

      expect(mockCart.items[0].quantity).toBe(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cart updated',
        data: expect.objectContaining({
          subtotal: 50,
          total: 50
        })
      });
    });

    test('should return 500 if error occurs during update', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1', quantity: 1 };

      jest.spyOn(CartModel, 'findByUserId').mockRejectedValue(new Error('Update failed'));

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update item quantity',
        details: 'Update failed'
      });
    });
  });

  describe('applyCouponToCart', () => {
    test('should return 401 if authentication is missing', async () => {
      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if couponCode is missing or not a string', async () => {
      req.user = { id: 'user123' };
      req.body = { couponCode: 12345 };

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid coupon code is required'
      });
    });

    test('should return 400 if cart is empty or not found', async () => {
      req.user = { id: 'user123' };
      req.body = { couponCode: 'SAVE10' };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ userId: 'user123', items: [] });

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cart is empty. Add items before applying coupon.'
      });
    });

    test('should return 400 if coupon code is invalid or inactive', async () => {
      req.user = { id: 'user123' };
      req.body = { couponCode: ' EXPIRED ' };

      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'p1', price: 10, quantity: 1 }]
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);
      jest.spyOn(DiscountService, 'validate').mockResolvedValue({ isActive: false });

      await applyCouponToCart(req, res);

      expect(DiscountService.validate).toHaveBeenCalledWith('EXPIRED');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is invalid or has expired'
      });
    });

    test('should return 400 if DiscountService returns null', async () => {
      req.user = { id: 'user123' };
      req.body = { couponCode: 'INVALID' };

      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'p1', price: 10, quantity: 1 }]
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);
      jest.spyOn(DiscountService, 'validate').mockResolvedValue(null);

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is invalid or has expired'
      });
    });

    test('should apply coupon successfully and update cart totals', async () => {
      req.user = { id: 'user123' };
      req.body = { couponCode: ' save20 ' };

      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'p1', price: 100, quantity: 1 }],
        discount: null
      };

      const mockDiscount = {
        code: 'SAVE20',
        type: 'percentage',
        value: 20,
        isActive: true
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);
      jest.spyOn(DiscountService, 'validate').mockResolvedValue(mockDiscount);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await applyCouponToCart(req, res);

      expect(DiscountService.validate).toHaveBeenCalledWith('SAVE20');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Coupon "SAVE20" applied successfully',
        data: expect.objectContaining({
          discount: {
            code: 'SAVE20',
            type: 'percentage',
            value: 20
          },
          subtotal: 100,
          discountAmount: 20,
          total: 80
        })
      });
    });

    test('should return 500 when exception occurs during coupon application', async () => {
      req.user = { id: 'user123' };
      req.body = { couponCode: 'ERROR' };

      jest.spyOn(CartModel, 'findByUserId').mockRejectedValue(new Error('Discount service failure'));

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to apply coupon',
        details: 'Discount service failure'
      });
    });
  });
});