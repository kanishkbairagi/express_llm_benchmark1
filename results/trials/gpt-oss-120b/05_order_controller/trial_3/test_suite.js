import { jest } from '@jest/globals';
import {
  createOrder,
  cancelOrder,
  Inventory,
  OrderModel
} from '../dataset/05_order_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('createOrder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('successfully creates an order and deducts stock', async () => {
    const req = {
      user: { id: 'usr_123' },
      body: {
        items: [{ productId: 'prd_1', quantity: 2 }],
        shippingAddress: {
          street: '123 Lane',
          city: 'Metropolis',
          postalCode: '12345'
        }
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
      id: 'prd_1',
      name: 'Gadget',
      price: 50,
      stock: 10
    });
    const decSpy = jest.spyOn(Inventory, 'decrementStock').mockResolvedValue(true);
    const createSpy = jest.spyOn(OrderModel, 'create').mockImplementation(async (data) => ({
      id: 'ord_987654',
      ...data,
      createdAt: new Date()
    }));

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Order created successfully',
        data: expect.objectContaining({
          id: 'ord_987654',
          userId: 'usr_123',
          subtotal: 100,
          tax: 8,
          total: 108,
          status: 'pending'
        })
      })
    );
    expect(decSpy).toHaveBeenCalledWith('prd_1', 2);
    expect(createSpy).toHaveBeenCalled();
  });

  test('fails when user is not authenticated', async () => {
    const req = { body: {} };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User authentication required'
    });
  });

  test('fails when items array is missing or empty', async () => {
    const req = {
      user: { id: 'u1' },
      body: { items: [], shippingAddress: { street: 'x', city: 'y', postalCode: 'z' } }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order must contain at least one item'
    });
  });

  test('fails when shipping address is incomplete', async () => {
    const req = {
      user: { id: 'u1' },
      body: {
        items: [{ productId: 'p1', quantity: 1 }],
        shippingAddress: { street: 's', city: 'c' } // missing postalCode
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

  test('fails when a product does not exist', async () => {
    const req = {
      user: { id: 'u1' },
      body: {
        items: [{ productId: 'nonexistent', quantity: 1 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' }
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue(null);

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID nonexistent not found'
    });
  });

  test('fails when insufficient stock', async () => {
    const req = {
      user: { id: 'u1' },
      body: {
        items: [{ productId: 'p1', quantity: 5 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' }
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
      id: 'p1',
      name: 'Widget',
      price: 20,
      stock: 2
    });

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Insufficient stock for product "Widget". Available: 2, requested: 5'
    });
  });

  test('fails when item quantity is not a positive integer', async () => {
    const req = {
      user: { id: 'u1' },
      body: {
        items: [{ productId: 'p1', quantity: 1.5 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' }
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
      id: 'p1',
      name: 'Gizmo',
      price: 30,
      stock: 10
    });

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Each item must have a valid productId and an integer quantity greater than zero'
    });
  });

  test('returns 500 when an unexpected error occurs', async () => {
    const req = {
      user: { id: 'u1' },
      body: {
        items: [{ productId: 'p1', quantity: 1 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' }
      }
    };
    const res = mockRes();

    jest.spyOn(Inventory, 'findProduct').mockRejectedValue(new Error('DB failure'));

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to process order creation',
        details: 'DB failure'
      })
    );
  });
});

describe('cancelOrder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('successfully cancels an order and restores stock', async () => {
    const req = {
      params: { orderId: 'ord_123' },
      user: { id: 'usr_123' }
    };
    const res = mockRes();

    const mockOrder = {
      id: 'ord_123',
      userId: 'usr_123',
      status: 'pending',
      items: [{ productId: 'prd_1', quantity: 2 }]
    };

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(mockOrder);
    const incSpy = jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
    const updateSpy = jest
      .spyOn(OrderModel, 'update')
      .mockImplementation(async (id, data) => ({
        ...mockOrder,
        ...data
      }));

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Order cancelled successfully and stock restored',
        data: expect.objectContaining({
          status: 'cancelled'
        })
      })
    );
    expect(incSpy).toHaveBeenCalledWith('prd_1', 2);
    expect(updateSpy).toHaveBeenCalledWith('ord_123', expect.objectContaining({ status: 'cancelled' }));
  });

  test('fails when orderId param is missing', async () => {
    const req = { params: {}, user: { id: 'u1' } };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order ID is required'
    });
  });

  test('fails when order is not found', async () => {
    const req = { params: { orderId: 'missing' }, user: { id: 'u1' } };
    const res = mockRes();

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(null);

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order with ID missing not found'
    });
  });

  test('fails when user is unauthorized to cancel', async () => {
    const req = {
      params: { orderId: 'ord_1' },
      user: { id: 'other_user', role: 'customer' }
    };
    const res = mockRes();

    const mockOrder = {
      id: 'ord_1',
      userId: 'owner_user',
      status: 'pending',
      items: []
    };

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(mockOrder);

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized to cancel this order'
    });
  });

  test('fails when order status is non‑cancellable', async () => {
    const req = {
      params: { orderId: 'ord_2' },
      user: { id: 'owner' }
    };
    const res = mockRes();

    const mockOrder = {
      id: 'ord_2',
      userId: 'owner',
      status: 'shipped',
      items: []
    };

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(mockOrder);

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot cancel an order with status "shipped"'
    });
  });

  test('returns 500 on unexpected error', async () => {
    const req = { params: { orderId: 'ord_err' }, user: { id: 'u' } };
    const res = mockRes();

    jest.spyOn(OrderModel, 'findById').mockRejectedValue(new Error('DB error'));

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to cancel order',
        details: 'DB error'
      })
    );
  });
});