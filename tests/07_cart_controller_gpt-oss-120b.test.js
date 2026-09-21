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
  const makeRes = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    return res;
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------- getCart ----------
  test('getCart: should return 401 when no user identifier', async () => {
    const req = { query: {} };
    const res = makeRes();

    await getCart(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('getCart: should return existing cart', async () => {
    const fakeCart = { userId: 'u1', items: [], subtotal: 0, discount: null, discountAmount: 0, total: 0 };
    CartModel.findByUserId = jest.fn().mockResolvedValue(fakeCart);
    const req = { user: { id: 'u1' } };
    const res = makeRes();

    await getCart(req, res);

    expect(CartModel.findByUserId).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeCart
    });
  });

  // ---------- addToCart ----------
  test('addToCart: should return 401 when unauthenticated', async () => {
    const req = { body: { productId: 'p1' } };
    const res = makeRes();

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
  });

  test('addToCart: should return 400 when productId missing', async () => {
    const req = { user: { id: 'u1' }, body: {} };
    const res = makeRes();

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Product ID is required' });
  });

  test('addToCart: should return 400 for invalid quantity', async () => {
    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 0 } };
    const res = makeRes();

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Quantity must be a positive integer'
    });
  });

  test('addToCart: should return 404 when product not found', async () => {
    ProductCatalog.findById = jest.fn().mockResolvedValue(null);
    const req = { user: { id: 'u1' }, body: { productId: 'p999', quantity: 2 } };
    const res = makeRes();

    await addToCart(req, res);

    expect(ProductCatalog.findById).toHaveBeenCalledWith('p999');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product not found'
    });
  });

  test('addToCart: should add new item and calculate totals', async () => {
    const product = { id: 'p1', name: 'Widget', price: 15 };
    ProductCatalog.findById = jest.fn().mockResolvedValue(product);
    CartModel.findByUserId = jest.fn().mockResolvedValue(null);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c, updatedAt: new Date() }));

    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 3 } };
    const res = makeRes();

    await addToCart(req, res);

    expect(CartModel.save).toHaveBeenCalled();
    const savedCart = CartModel.save.mock.calls[0][0];
    expect(savedCart.items).toEqual([
      { productId: 'p1', name: 'Widget', price: 15, quantity: 3 }
    ]);
    expect(savedCart.subtotal).toBe(45);
    expect(savedCart.discountAmount).toBe(0);
    expect(savedCart.total).toBe(45);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Item added to cart',
      data: expect.objectContaining({ total: 45 })
    }));
  });

  test('addToCart: should increase quantity of existing item', async () => {
    const product = { id: 'p2', name: 'Gadget', price: 20 };
    ProductCatalog.findById = jest.fn().mockResolvedValue(product);
    const existingCart = {
      userId: 'u1',
      items: [{ productId: 'p2', name: 'Gadget', price: 20, quantity: 1 }],
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(existingCart);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c, updatedAt: new Date() }));

    const req = { user: { id: 'u1' }, body: { productId: 'p2', quantity: 2 } };
    const res = makeRes();

    await addToCart(req, res);

    const savedCart = CartModel.save.mock.calls[0][0];
    expect(savedCart.items).toEqual([
      { productId: 'p2', name: 'Gadget', price: 20, quantity: 3 }
    ]);
    expect(savedCart.subtotal).toBe(60);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ---------- updateCartItemQuantity ----------
  test('updateCartItemQuantity: should return 401 when unauthenticated', async () => {
    const req = { body: { productId: 'p1', quantity: 1 } };
    const res = makeRes();

    await updateCartItemQuantity(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
  });

  test('updateCartItemQuantity: should return 404 when cart missing', async () => {
    CartModel.findByUserId = jest.fn().mockResolvedValue(null);
    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 2 } };
    const res = makeRes();

    await updateCartItemQuantity(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Cart not found' });
  });

  test('updateCartItemQuantity: should return 404 when item not in cart', async () => {
    const cart = { userId: 'u1', items: [], discount: null };
    CartModel.findByUserId = jest.fn().mockResolvedValue(cart);
    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 2 } };
    const res = makeRes();

    await updateCartItemQuantity(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Item not in cart' });
  });

  test('updateCartItemQuantity: should remove item when quantity set to 0', async () => {
    const cart = {
      userId: 'u1',
      items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 5 }],
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(cart);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c, updatedAt: new Date() }));

    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 0 } };
    const res = makeRes();

    await updateCartItemQuantity(req, res);

    const savedCart = CartModel.save.mock.calls[0][0];
    expect(savedCart.items).toHaveLength(0);
    expect(savedCart.subtotal).toBe(0);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Cart updated',
      data: expect.objectContaining({ items: [] })
    }));
  });

  test('updateCartItemQuantity: should update quantity correctly', async () => {
    const cart = {
      userId: 'u1',
      items: [{ productId: 'p1', name: 'Widget', price: 10, quantity: 2 }],
      discount: null
    };
    CartModel.findByUserId = jest.fn().mockResolvedValue(cart);
    CartModel.save = jest.fn().mockImplementation(async (c) => ({ ...c, updatedAt: new Date() }));

    const req = { user: { id: 'u1' }, body: { productId: 'p1', quantity: 4 } };
    const res = makeRes();

    await updateCartItemQuantity(req, res);

    const savedCart = CartModel.save.mock.calls[0][0];
    expect(savedCart.items[0].quantity).toBe(4);
    expect(savedCart.subtotal).toBe(40);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ---------- applyCouponToCart ----------
  test('applyCouponToCart: should return 401 when unauthenticated', async () => {
    const req = { body: { couponCode: 'SAVE10' } };
    const res = makeRes();

    await applyCouponToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
  });

  test('applyCouponToCart: should return 400 when cart empty', async () => {
    CartModel.findByUserId = jest.fn().mockResolvedValue({ userId: 'u1', items: [] });
    const req = { user: { id: 'u1' }, body: { couponCode: 'SAVE10' } };
    const res = makeRes();

    await applyCouponToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cart is empty. Add items before applying coupon.'
    });
  });

  test('applyCouponToCart: should return