import { jest } from '@jest/globals';
import {
  Inventory,
  OrderModel,
  createOrder,
  cancelOrder
} from '../dataset/05_order_controller.js';

describe('Order Controller - createOrder', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create order successfully with correct totals and stock deduction', async () => {
    const req = {
      body: {
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 1 }
        ],
        shippingAddress: {
          street: '123 Lane',
          city: 'Metropolis',
          postalCode: '12345'
        },
        userId: 'user_1'
      }
    };
    const res = mockRes();

    // Mock inventory lookup
    jest.spyOn(Inventory, 'findProduct')
      .mockImplementationOnce(async (id) => ({
        id,
        name: `Product ${id}`,
        price: id === 'p1' ? 10 : 20,
        stock: id === 'p1' ? 5 : 3
      }))
      .mockImplementationOnce(async (id) => ({
        id,
        name: `Product ${id}`,
        price: id === 'p1' ? 10 : 20,
        stock: id === 'p2' ? 3 : 5
      }));

    const decrementSpy = jest.spyOn(Inventory, 'decrementStock')
      .mockResolvedValue(true);

    const createSpy = jest.spyOn(OrderModel, 'create')
      .mockImplementation(async (orderData) => ({
        id: 'ord_123',
        ...orderData,
        createdAt: new Date()
      }));

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.success).toBe(true);
    expect(responseBody.data.subtotal).toBe(40); // (10*2)+(20*1)
    expect(responseBody.data.tax).toBeCloseTo(3.2); // 8% of 40
    expect(responseBody.data.total).toBeCloseTo(43.2);
    expect(decrementSpy).toHaveBeenCalledTimes(2);
    expect(decrementSpy).toHaveBeenCalledWith('p1', 2);
    expect(decrementSpy).toHaveBeenCalledWith('p2', 1);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      items: expect.any(Array),
      subtotal: 40,
      tax: expect.any(Number),
      total: expect.any(Number),
      status: 'pending',
      shippingAddress: req.body.shippingAddress
    }));
  });

  test('should return 401 when user authentication missing', async () => {
    const req = { body: {} };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User authentication required'
    });
  });

  test('should return 400 when items array is empty', async () => {
    const req = {
      body: {
        items: [],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' },
        userId: 'u1'
      }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order must contain at least one item'
    });
  });

  test('should return 400 when shipping address incomplete', async () => {
    const req = {
      body: {
        items: [{ productId: 'p1', quantity: 1 }],
        shippingAddress: { street: 's', city: 'c' }, // missing postalCode
        userId: 'u1'
      }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Complete shipping address is required (street, city, postalCode)'
    });
  });

  test('should return 400 for invalid item quantity', async () => {
    const req = {
      body: {
        items: [{ productId: 'p1', quantity: 0 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' },
        userId: 'u1'
      }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Each item must have a valid productId and an integer quantity greater than zero'
    });
  });

  test('should return 404 when product not found', async () => {
    const req = {
      body: {
        items: [{ productId: 'missing', quantity: 1 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' },
        userId: 'u1'
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue(null);

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID missing not found'
    });
  });

  test('should return 409 when insufficient stock', async () => {
    const req = {
      body: {
        items: [{ productId: 'p1', quantity: 5 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' },
        userId: 'u1'
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct')
      .mockResolvedValue({ id: 'p1', name: 'Product p1', price: 10, stock: 2 });

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Insufficient stock')
    });
  });

  test('should return 500 on unexpected error', async () => {
    const req = {
      body: {
        items: [{ productId: 'p1', quantity: 1 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' },
        userId: 'u1'
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct').mockRejectedValue(new Error('DB failure'));

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Failed to process order creation',
      details: 'DB failure'
    }));
  });
});

describe('Order Controller - cancelOrder', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should cancel order successfully and restore stock', async () => {
    const req = {
      params: { orderId: 'ord_123' },
      user: { id: 'user_1', role: 'customer' }
    };
    const res = mockRes();

    const order = {
      id: 'ord_123',
      userId: 'user_1',
      status: 'pending',
      items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }]
    };

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(order);
    const incSpy = jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
    const updateSpy = jest.spyOn(OrderModel, 'update')
      .mockImplementation(async (id, data) => ({ id, ...data, ...order }));

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('cancelled');
    expect(incSpy).toHaveBeenCalledTimes(2);
    expect(incSpy).toHaveBeenCalledWith('p1', 2);
    expect(incSpy).toHaveBeenCalledWith('p2', 1);
    expect(updateSpy).toHaveBeenCalledWith('ord_123', expect.objectContaining({ status: 'cancelled' }));
  });

  test('should return 400 when orderId missing', async () => {
    const req = { params: {}, user: { id: 'u' } };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order ID is required'
    });
  });

  test('should return 404 when order not found', async () => {
    const req = { params: { orderId: 'notfound' }, user: { id: 'u' } };
    const res = mockRes();

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(null);

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order with ID notfound not found'
    });
  });

  test('should return 403 for unauthorized user', async () => {
    const req = {
      params: { orderId: 'ord_123' },
      user: { id: 'other_user', role: 'customer' }
    };
    const res = mockRes();

    const order = { id: 'ord_123', userId: 'owner_user', status: 'pending', items: [] };
    jest.spyOn(OrderModel, 'findById').mockResolvedValue(order);

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized to cancel this order'
    });
  });

  test('should return 400 when order status non‑cancellable', async () => {
    const req = {
      params: { orderId: 'ord_123' },
      user: { id: 'owner_user' }
    };
    const res = mockRes();

    const order = { id: 'ord_123', userId: 'owner_user', status: 'shipped', items: [] };
    jest.spyOn(OrderModel, 'findById').mockResolvedValue(order);

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Cannot cancel an order with status')
    });
  });

  test('should return 500 on unexpected error', async () => {
    const req = {
      params: { orderId: 'ord_123' },
      user: { id: 'owner_user' }
    };
    const res = mockRes();

    jest.spyOn(OrderModel, 'findById').mockRejectedValue(new Error('DB crash'));

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Failed to cancel order',
      details: 'DB crash'
    }));
  });
});