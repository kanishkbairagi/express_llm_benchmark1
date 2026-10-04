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
  const baseReq = {
    user: { id: 'user_123' },
    body: {
      items: [{ productId: 'prod_1', quantity: 2 }],
      shippingAddress: {
        street: '123 Main St',
        city: 'Metropolis',
        postalCode: '12345'
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default successful mocks
    Inventory.findProduct = jest.fn().mockResolvedValue({
      id: 'prod_1',
      name: 'Gadget',
      price: 50,
      stock: 10
    });
    Inventory.decrementStock = jest.fn().mockResolvedValue(true);
    OrderModel.create = jest.fn().mockImplementation(async (orderData) => ({
      id: 'ord_987654',
      ...orderData,
      createdAt: new Date()
    }));
  });

  test('should create order successfully', async () => {
    const req = { ...baseReq };
    const res = mockRes();

    await createOrder(req, res);

    expect(Inventory.findProduct).toHaveBeenCalledWith('prod_1');
    expect(Inventory.decrementStock).toHaveBeenCalledWith('prod_1', 2);
    expect(OrderModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        items: expect.arrayContaining([
          expect.objectContaining({
            productId: 'prod_1',
            name: 'Gadget',
            unitPrice: 50,
            quantity: 2,
            total: 100
          })
        ]),
        subtotal: 100,
        tax: 8,
        total: 108,
        status: 'pending',
        shippingAddress: req.body.shippingAddress
      })
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Order created successfully',
        data: expect.objectContaining({ id: 'ord_987654' })
      })
    );
  });

  test('should return 401 when user is not authenticated', async () => {
    const req = { ...baseReq, user: undefined, body: { ...baseReq.body, userId: undefined } };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User authentication required'
    });
  });

  test('should return 400 when items array is missing', async () => {
    const req = { ...baseReq, body: { ...baseReq.body, items: undefined } };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order must contain at least one item'
    });
  });

  test('should return 404 when product not found', async () => {
    Inventory.findProduct.mockResolvedValue(null);
    const req = { ...baseReq };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID prod_1 not found'
    });
  });

  test('should return 409 when insufficient stock', async () => {
    Inventory.findProduct.mockResolvedValue({
      id: 'prod_1',
      name: 'Gadget',
      price: 50,
      stock: 1
    });
    const req = { ...baseReq };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Insufficient stock')
    });
  });

  test('should return 400 when quantity is not a positive integer', async () => {
    const req = {
      ...baseReq,
      body: {
        ...baseReq.body,
        items: [{ productId: 'prod_1', quantity: 1.5 }]
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

  test('should handle unexpected errors with 500', async () => {
    Inventory.findProduct.mockImplementation(() => {
      throw new Error('DB failure');
    });
    const req = { ...baseReq };
    const res = mockRes();

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
  const baseReq = {
    params: { orderId: 'ord_987654' },
    user: { id: 'user_123', role: 'customer' }
  };

  const orderMock = {
    id: 'ord_987654',
    userId: 'user_123',
    status: 'pending',
    items: [{ productId: 'prod_1', quantity: 2 }]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    OrderModel.findById = jest.fn().mockResolvedValue(orderMock);
    OrderModel.update = jest.fn().mockResolvedValue({
      ...orderMock,
      status: 'cancelled',
      cancelledAt: new Date()
    });
    Inventory.incrementStock = jest.fn().mockResolvedValue(true);
  });

  test('should cancel order successfully and restore stock', async () => {
    const req = { ...baseReq };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(OrderModel.findById).toHaveBeenCalledWith('ord_987654');
    expect(Inventory.incrementStock).toHaveBeenCalledWith('prod_1', 2);
    expect(OrderModel.update).toHaveBeenCalledWith('ord_987654', expect.objectContaining({ status: 'cancelled' }));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Order cancelled successfully and stock restored',
        data: expect.objectContaining({ status: 'cancelled' })
      })
    );
  });

  test('should return 400 when orderId param is missing', async () => {
    const req = { ...baseReq, params: {} };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order ID is required'
    });
  });

  test('should return 404 when order not found', async () => {
    OrderModel.findById.mockResolvedValue(null);
    const req = { ...baseReq };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order with ID ord_987654 not found'
    });
  });

  test('should return 403 when user is not authorized', async () => {
    const unauthorizedReq = {
      ...baseReq,
      user: { id: 'other_user', role: 'customer' }
    };
    const res = mockRes();

    await cancelOrder(unauthorizedReq, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized to cancel this order'
    });
  });

  test('should return 400 when order status is non‑cancellable', async () => {
    OrderModel.findById.mockResolvedValue({ ...orderMock, status: 'shipped' });
    const req = { ...baseReq };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot cancel an order with status "shipped"'
    });
  });

  test('should handle unexpected errors with 500', async () => {
    OrderModel.findById.mockImplementation(() => {
      throw new Error('DB crash');
    });
    const req = { ...baseReq };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to cancel order',
        details: 'DB crash'
      })
    );
  });
});