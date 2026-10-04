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

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCart', () => {
  test('returns 401 when no user id provided', async () => {
    const req = { user: null, query: {} };
    const res = createRes();

    await getCart(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Authentication required' })
    );
  });

  test('returns existing cart when found', async () => {
    const mockCart = { userId: 'u1', items: [], subtotal: 0, total: 0 };
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(mockCart);
    const req = { user: { id: 'u1' } };
    const res = createRes();

    await getCart(req, res);

    expect(CartModel.findByUserId).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mockCart });
  });

  test('creates empty cart when none exists', async () => {
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);
    const req = { user: { id: 'u2' } };
    const res = createRes();

    await getCart(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({
      userId: 'u2',
      items: [],
      subtotal: 0,
      total: 0
    });
  });
});

describe('addToCart', () => {
  const product = { id: 'p1', name: 'Test Product', price: 10 };

  test('fails when productId missing', async () => {
    const req = { body: { userId: 'u1' } };
    const res = createRes();

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Product ID is required' })
    );
  });

  test('fails when product not found', async () => {
    jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);
    const req = { body: { userId: 'u1', productId: 'pX' } };
    const res = createRes();

    await addToCart(req, res);

    expect(ProductCatalog.findById).toHaveBeenCalledWith('pX');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Product not found' })
    );
  });

  test('adds new item to empty cart and saves', async () => {
    jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);
    const saveMock = jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));
    const req = { body: { userId: 'u1', productId: 'p1', quantity: 2 } };
    const res = createRes();

    await addToCart(req, res);

    expect(saveMock).toHaveBeenCalled();
    const savedCart = saveMock.mock.results[0].value;
    expect(savedCart.items).toEqual([
      { productId: 'p1', name: 'Test Product', price: 10, quantity: 2 }
    ]);
    expect(savedCart.subtotal).toBe(20);
    expect(savedCart.total).toBe(20);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Item added to cart' })
    );
  });

  test('increments quantity when item already in cart', async () => {
    const existingCart = {
      userId: 'u1',
      items: [{ productId: 'p1', name: 'Test Product', price: 10, quantity: 1 }],
      discount: null
    };
    jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(existingCart);
    const saveMock = jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));
    const req = { body: { userId: 'u1', productId: 'p1', quantity: 3 } };
    const res = createRes();

    await addToCart(req, res);

    expect(saveMock).toHaveBeenCalled();
    const saved = saveMock.mock.results[0].value;
    expect(saved.items[0].quantity).toBe(4);
    expect(saved.subtotal).toBe(40);
    expect(saved.total).toBe(40);
  });
});

describe('updateCartItemQuantity', () => {
  const baseCart = {
    userId: 'u1',
    items: [{ productId: 'p1', name: 'Prod', price: 5, quantity: 3 }],
    discount: null
  };

  test('removes item when quantity set to 0', async () => {
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ ...baseCart });
    const saveMock = jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));
    const req = { body: { userId: 'u1', productId: 'p1', quantity: 0 } };
    const res = createRes();

    await updateCartItemQuantity(req, res);

    expect(saveMock).toHaveBeenCalled();
    const saved = saveMock.mock.results[0].value;
    expect(saved.items).toHaveLength(0);
    expect(saved.subtotal).toBe(0);
    expect(saved.total).toBe(0);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('updates quantity to positive number', async () => {
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ ...baseCart });
    const saveMock = jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));
    const req = { body: { userId: 'u1', productId: 'p1', quantity: 5 } };
    const res = createRes();

    await updateCartItemQuantity(req, res);

    const saved = saveMock.mock.results[0].value;
    expect(saved.items[0].quantity).toBe(5);
    expect(saved.subtotal).toBe(25);
    expect(saved.total).toBe(25);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 404 when cart not found', async () => {
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue(null);
    const req = { body: { userId: 'uX', productId: 'p1', quantity: 1 } };
    const res = createRes();

    await updateCartItemQuantity(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Cart not found' })
    );
  });
});

describe('applyCouponToCart', () => {
  const cartWithItems = {
    userId: 'u1',
    items: [{ productId: 'p1', name: 'Item', price: 50, quantity: 2 }],
    discount: null
  };
  const discount = {
    code: 'SAVE10',
    type: 'percentage',
    value: 10,
    isActive: true
  };

  test('applies percentage discount correctly', async () => {
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ ...cartWithItems });
    jest.spyOn(DiscountService, 'validate').mockResolvedValue(discount);
    const saveMock = jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));
    const req = { body: { userId: 'u1', couponCode: 'save10' } };
    const res = createRes();

    await applyCouponToCart(req, res);

    const saved = saveMock.mock.results[0].value;
    expect(saved.discount).toMatchObject({
      code: 'SAVE10',
      type: 'percentage',
      value: 10
    });
    // subtotal = 100, 10% => 10 discount
    expect(saved.subtotal).toBe(100);
    expect(saved.discountAmount).toBe(10);
    expect(saved.total).toBe(90);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('applies fixed discount and caps at subtotal', async () => {
    const fixedDiscount = { code: 'BIG', type: 'fixed', value: 150, isActive: true };
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ ...cartWithItems });
    jest.spyOn(DiscountService, 'validate').mockResolvedValue(fixedDiscount);
    const saveMock = jest.spyOn(CartModel, 'save').mockImplementation(async (c) => ({
      ...c,
      updatedAt: new Date()
    }));
    const req = { body: { userId: 'u1', couponCode: 'BIG' } };
    const res = createRes();

    await applyCouponToCart(req, res);

    const saved = saveMock.mock.results[0].value;
    expect(saved.discountAmount).toBe(100); // capped to subtotal
    expect(saved.total).toBe(0);
  });

  test('rejects when coupon invalid or inactive', async () => {
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ ...cartWithItems });
    jest.spyOn(DiscountService, 'validate').mockResolvedValue({ isActive: false });
    const req = { body: { userId: 'u1', couponCode: 'BAD' } };
    const res = createRes();

    await applyCouponToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Coupon code is invalid or has expired' })
    );
  });

  test('rejects when cart empty', async () => {
    jest.spyOn(CartModel, 'findByUserId').mockResolvedValue({ userId: 'u1', items: [] });
    const req = { body: { userId: 'u1', couponCode: 'ANY' } };
    const res = createRes();

    await applyCouponToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Cart is empty. Add items before applying coupon.' })
    );
  });
});