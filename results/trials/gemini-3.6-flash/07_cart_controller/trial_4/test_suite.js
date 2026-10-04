import { jest } from '@jest/globals';
import {
  ProductCatalog,
  CartModel,
  DiscountService,
  getCart,
  addToCart,
  updateCartItemQuantity,
  applyCouponToCart
} from '../dataset/07_cart_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('07_cart_controller Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCart', () => {
    it('should return 401 if userId is missing in req.user and req.query', async () => {
      const req = { user: undefined, query: {} };
      const res = mockResponse();

      await getCart(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return default empty cart if no cart exists in DB for the user', async () => {
      const req = { user: { id: 'user1' } };
      const res = mockResponse();

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);

      await getCart(req, res);

      expect(CartModel.findByUserId).toHaveBeenCalledWith('user1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user1',
          items: [],
          subtotal: 0,
          discount: null,
          discountAmount: 0,
          total: 0
        }
      });
    });

    it('should return existing cart from DB using req.query.userId', async () => {
      const req = { query: { userId: 'user2' } };
      const res = mockResponse();
      const existingCart = {
        userId: 'user2',
        items: [{ productId: 'p1', name: 'Item 1', price: 10, quantity: 2 }],
        subtotal: 20,
        discount: null,
        discountAmount: 0,
        total: 20
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);

      await getCart(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: existingCart
      });
    });

    it('should return 500 when database throws an error', async () => {
      const req = { user: { id: 'user1' } };
      const res = mockResponse();

      jest.spyOn(CartModel, 'findByUserId').mockRejectedValue(new Error('DB connection failed'));

      await getCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve cart',
        details: 'DB connection failed'
      });
    });
  });

  describe('addToCart', () => {
    it('should return 401 if userId is not provided', async () => {
      const req = { body: {} };
      const res = mockResponse();

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if productId is missing', async () => {
      const req = { user: { id: 'user1' }, body: {} };
      const res = mockResponse();

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 400 if quantity is invalid or <= 0', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1', quantity: 0 } };
      const res = mockResponse();

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Quantity must be a positive integer'
      });
    });

    it('should return 404 if product is not found in ProductCatalog', async () => {
      const req = { body: { userId: 'user1', productId: 'p999', quantity: 1 } };
      const res = mockResponse();

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      await addToCart(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    it('should add new product to new cart and recalculate totals', async () => {
      const req = {
        user: { id: 'user1' },
        body: { productId: 'p1', quantity: 2 }
      };
      const res = mockResponse();
      const product = { id: 'p1', name: 'Widget', price: 15.50 };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({ ...c, updatedAt: 'now' }));

      await addToCart(req, res);

      expect(CartModel.save).toHaveBeenCalledWith({
        userId: 'user1',
        items: [{ productId: 'p1', name: 'Widget', price: 15.50, quantity: 2 }],
        discount: null,
        subtotal: 31,
        discountAmount: 0,
        total: 31
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to cart',
        data: expect.objectContaining({
          subtotal: 31,
          total: 31,
          updatedAt: 'now'
        })
      });
    });

    it('should increment quantity if item already exists in cart and handle percentage discount', async () => {
      const req = {
        body: { userId: 'user1', productId: 'p1', quantity: 1 }
      };
      const res = mockResponse();
      const product = { id: 'p1', name: 'Widget', price: 20 };
      const existingCart = {
        userId: 'user1',
        items: [{ productId: 'p1', name: 'Widget', price: 20, quantity: 2 }],
        discount: { type: 'percentage', value: 10 }
      };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await addToCart(req, res);

      // Subtotal: 20 * 3 = 60. Discount: 10% of 60 = 6. Total: 54.
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to cart',
        data: expect.objectContaining({
          subtotal: 60,
          discountAmount: 6,
          total: 54
        })
      });
    });

    it('should return 500 when an unexpected exception occurs', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1' } };
      const res = mockResponse();

      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('Server error'));

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to add item to cart',
        details: 'Server error'
      });
    });
  });

  describe('updateCartItemQuantity', () => {
    it('should return 401 if userId is missing', async () => {
      const req = { body: { productId: 'p1', quantity: 2 } };
      const res = mockResponse();

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if productId or quantity is missing', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1' } };
      const res = mockResponse();

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'ProductId and quantity are required'
      });
    });

    it('should return 400 if quantity is negative', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1', quantity: -1 } };
      const res = mockResponse();

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Quantity must be non-negative integer'
      });
    });

    it('should return 404 if cart is not found', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1', quantity: 2 } };
      const res = mockResponse();

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cart not found'
      });
    });

    it('should return 404 if item is not in cart', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1', quantity: 2 } };
      const res = mockResponse();
      const existingCart = { userId: 'user1', items: [{ productId: 'p2', price: 10, quantity: 1 }] };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Item not in cart'
      });
    });

    it('should update item quantity and calculate fixed discount correctly', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1', quantity: 5 } };
      const res = mockResponse();
      const existingCart = {
        userId: 'user1',
        items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 1 }],
        discount: { type: 'fixed', value: 15 }
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await updateCartItemQuantity(req, res);

      // Subtotal: 10 * 5 = 50. Discount: 15. Total: 35.
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cart updated',
        data: expect.objectContaining({
          subtotal: 50,
          discountAmount: 15,
          total: 35
        })
      });
    });

    it('should remove item from cart when quantity is set to 0', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1', quantity: 0 } };
      const res = mockResponse();
      const existingCart = {
        userId: 'user1',
        items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 1 }],
        discount: null
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await updateCartItemQuantity(req, res);

      expect(existingCart.items).toHaveLength(0);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cart updated',
        data: expect.objectContaining({
          subtotal: 0,
          discountAmount: 0,
          total: 0
        })
      });
    });

    it('should return 500 when save fails', async () => {
      const req = { user: { id: 'user1' }, body: { productId: 'p1', quantity: 2 } };
      const res = mockResponse();
      const existingCart = {
        userId: 'user1',
        items: [{ productId: 'p1', price: 10, quantity: 1 }]
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(CartModel, 'save').mockRejectedValue(new Error('Save error'));

      await updateCartItemQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update item quantity',
        details: 'Save error'
      });
    });
  });

  describe('applyCouponToCart', () => {
    it('should return 401 if userId is missing', async () => {
      const req = { body: { couponCode: 'SAVE10' } };
      const res = mockResponse();

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if couponCode is missing or not a string', async () => {
      const req = { user: { id: 'user1' }, body: { couponCode: 12345 } };
      const res = mockResponse();

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid coupon code is required'
      });
    });

    it('should return 400 if cart is missing or empty', async () => {
      const req = { user: { id: 'user1' }, body: { couponCode: 'SAVE10' } };
      const res = mockResponse();

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ userId: 'user1', items: [] });

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cart is empty. Add items before applying coupon.'
      });
    });

    it('should return 400 if coupon is invalid or inactive', async () => {
      const req = { user: { id: 'user1' }, body: { couponCode: 'EXPIRED10' } };
      const res = mockResponse();
      const existingCart = {
        userId: 'user1',
        items: [{ productId: 'p1', price: 10, quantity: 1 }]
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(DiscountService, 'validate').mockResolvedValue({ isActive: false });

      await applyCouponToCart(req, res);

      expect(DiscountService.validate).toHaveBeenCalledWith('EXPIRED10');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is invalid or has expired'
      });
    });

    it('should apply coupon, format code, cap discount at subtotal, and save cart', async () => {
      const req = { user: { id: 'user1' }, body: { couponCode: '  bigdiscount  ' } };
      const res = mockResponse();
      const existingCart = {
        userId: 'user1',
        items: [{ productId: 'p1', price: 10, quantity: 1 }]
      };
      const discountObj = {
        code: 'BIGDISCOUNT',
        type: 'fixed',
        value: 50, // Fixed discount larger than subtotal (10)
        isActive: true
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(DiscountService, 'validate').mockResolvedValue(discountObj);
      jest.spyOn(CartModel, 'save').mockImplementation(async (c) => c);

      await applyCouponToCart(req, res);

      expect(DiscountService.validate).toHaveBeenCalledWith('BIGDISCOUNT');
      // Subtotal: 10. Fixed discount: 50. Capped discount: 10. Final total: 0.
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Coupon "BIGDISCOUNT" applied successfully',
        data: expect.objectContaining({
          subtotal: 10,
          discountAmount: 10,
          total: 0
        })
      });
    });

    it('should return 500 when DiscountService validation throws error', async () => {
      const req = { user: { id: 'user1' }, body: { couponCode: 'SAVE10' } };
      const res = mockResponse();
      const existingCart = {
        userId: 'user1',
        items: [{ productId: 'p1', price: 10, quantity: 1 }]
      };

      jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
      jest.spyOn(DiscountService, 'validate').mockRejectedValue(new Error('Validation service down'));

      await applyCouponToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to apply coupon',
        details: 'Validation service down'
      });
    });
  });
});