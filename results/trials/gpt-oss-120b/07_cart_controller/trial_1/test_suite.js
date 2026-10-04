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

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCart', () => {
  test('returns 401 when no user identifier', async () => {
    const req = { query: {} };
    const res = mockRes();

    await getCart(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns existing cart for authenticated user', async () => {
    const fakeCart = {
      userId: 'u1',
      items: [{ productId: 'p1', quantity: 2, price: 10 }],
      subtotal: 20,
      discount: null,
      discountAmount: 0,
      total: 20
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(fakeCart);
    const req = { user: { id: 'u1' } };
    const res = mockRes();

    await getCart(req, res);

    expect(CartModel.findByUserId).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeCart
    });
  });

  test('creates empty cart when none exists', async () => {
    CartModel.findByUserId = jest.fn().mockResolvedValue(null);
    const req = { user: { id: 'u2' } };
    const res = mockRes();

    await getCart(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        userId: 'u2',
        items: [],
        subtotal: 0,
        discount: null,
        discountAmount: 0,
        total: 0
      }
    });
  });
});

describe('addToCart', () => {
  test('returns 401 when auth missing', async () => {
    const req = { body: { productId: 'p1' } };
    const res = mockRes();

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 when productId missing', async () => {
    const req = { user: { id: 'u1' }, body: {} };
    const res = mockRes();

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 404 when product not found', async () => {
    ProductCatalog.findById = jest.fn().mockResolvedValue(null);
    const req = { user: { id: 'u1' }, body: { productId: 'unknown' } };
    const res = mockRes();

    await addToCart(req, res);

    expect(ProductCatalog.findById).toHaveBeenCalledWith('unknown');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product not found'
    });
  });

  test('adds new item and calculates totals', async () => {
    const product = { id: 'p1', name: 'Widget', price: 12.5 };
    ProductCatalog.findById = jest.fn().mockResolvedValue(product);
    CartModel.findByUserId = jest.fn().mockResolvedValue(null);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));

    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 3 } };
    const res = mockRes();

    await addToCart(req, res);

    expect(CartModel.save).toHaveBeenCalled();
    const savedCart = CartModel.save.mock.calls[0][0];
    expect(savedCart.items).toEqual([
      { productId: 'p1', name: 'Widget', price: 12.5, quantity: 3 }
    ]);
    // subtotal = 12.5 * 3 = 37.5
    expect(savedCart.subtotal).toBeCloseTo(37.5);
    expect(savedCart.discountAmount).toBe(0);
    expect(savedCart.total).toBeCloseTo(37.5);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Item added to cart',
      data: expect.objectContaining({
        items: expect.any(Array),
        subtotal: expect.any(Number),
        total: expect.any(Number)
      })
    });
  });

  test('increments quantity when item already in cart', async () => {
    const product = { id: 'p2', name: 'Gadget', price: 5 };
    ProductCatalog.findById = jest.fn().mockResolvedValue(product);
    const existingCart = {
      userId: 'u1',
      items: [{ productId: 'p2', name: 'Gadget', price: 5, quantity: 2 }],
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(existingCart);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));

    const req = { user: { id: 'u1' }, body: { productId: 'p2', quantity: 4 } };
    const res = mockRes();

    await addToCart(req, res);

    const savedCart = CartModel.save.mock.calls[0][0];
    expect(savedCart.items).toEqual([
      { productId: 'p2', name: 'Gadget', price: 5, quantity: 6 }
    ]);
    expect(savedCart.subtotal).toBeCloseTo(30); // 5*6
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('updateCartItemQuantity', () => {
  test('removes item when quantity set to 0', async () => {
    const cart = {
      userId: 'u1',
      items: [{ productId: 'p1', name: 'A', price: 10, quantity: 2 }],
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(cart);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c }));

    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 0 } };
    const res = mockRes();

    await updateCartItemQuantity(req, res);

    const saved = CartModel.save.mock.calls[0][0];
    expect(saved.items).toHaveLength(0);
    expect(saved.subtotal).toBe(0);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('updates quantity correctly and recalculates totals', async () => {
    const cart = {
      userId: 'u1',
      items: [{ productId: 'p5', name: 'Item5', price: 7.5, quantity: 1 }],
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(cart);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c }));

    const req = { user: { id: 'u1' }, body: { productId: 'p5', quantity: 4 } };
    const res = mockRes();

    await updateCartItemQuantity(req, res);

    const saved = CartModel.save.mock.calls[0][0];
    expect(saved.items[0].quantity).toBe(4);
    expect(saved.subtotal).toBeCloseTo(30); // 7.5*4
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('applyCouponToCart', () => {
  test('returns 400 when cart is empty', async () => {
    CartModel.findByUserId = jest.fn().mockResolvedValue({
      userId: 'u1',
      items: [],
      discount: null
    });

    const req = { user: { id: 'u1' }, body: { couponCode: 'SAVE10' } };
    const res = mockRes();

    await applyCouponToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cart is empty. Add items before applying coupon.'
    });
  });

  test('applies percentage discount correctly', async () => {
    const cart = {
      userId: 'u1',
      items: [
        { productId: 'p1', name: 'A', price: 20, quantity: 2 } // subtotal 40
      ],
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(cart);
    DiscountService.validate = jest.fn().mockResolvedValue({
      code: 'SAVE10',
      type: 'percentage',
      value: 10,
      isActive: true
    });
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c }));

    const req = { user: { id: 'u1' }, body: { couponCode: 'save10' } };
    const res = mockRes();

    await applyCouponToCart(req, res);

    const saved = CartModel.save.mock.calls[0][0];
    expect(saved.discount).toMatchObject({
      code: 'SAVE10',
      type: 'percentage',
      value: 10
    });
    // Discount 10% of 40 = 4
    expect(saved.subtotal).toBeCloseTo(40);
    expect(saved.discountAmount).toBeCloseTo(4);
    expect(saved.total).toBeCloseTo(36);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('applies fixed discount without exceeding subtotal', async () => {
    const cart = {
      userId: 'u2',
      items: [{ productId: 'p2', name: 'B', price: 15, quantity: 1 }], // subtotal 15
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(cart);
    DiscountService.validate = jest.fn().mockResolvedValue({
      code: 'BIGSAVE',
      type: 'fixed',
      value: 20,
      isActive: true
    });
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c }));

    const req = { user: { id: 'u2' }, body: { couponCode: 'BIGSAVE' } };
    const res = mockRes();

    await applyCouponToCart(req, res);

    const saved = CartModel.save.mock.calls[0][0];
    // Fixed discount capped at subtotal 15
    expect(saved.discountAmount).toBeCloseTo(15);
    expect(saved.total).toBe(0);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});