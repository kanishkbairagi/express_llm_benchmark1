import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  createOrder,
  cancelOrder,
  Inventory,
  OrderModel
} from '../dataset/05_order_controller.js';

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Order Controller - createOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default successful inventory lookup
    Inventory.findProduct = jest.fn().mockResolvedValue({
      id: 'prod_1',
      name: 'Test Product',
      price: 10,
      stock: 100
    });
    Inventory.decrementStock = jest.fn().mockResolvedValue(true);
    OrderModel.create = jest.fn().mockImplementation(async (data) => ({
      id: 'ord_987654',
      ...data,
      createdAt: new Date()
    }));
  });

  it('creates an order successfully', async () => {
    const req = {
      body: {
        items: [{ productId: 'prod_1', quantity: 2 }],
        shippingAddress: {
          street: '123 Main St',
          city: 'Metropolis',
          postalCode: '12345'
        },
        userId: 'user_123'
      }
    };
    const res = mockResponse();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload.success).toBe(true);
    expect(jsonPayload.data.subtotal).toBe(20);
    expect(jsonPayload.data.tax).toBeCloseTo(1.6);
    expect(jsonPayload.data.total).toBeCloseTo(21.6);
    expect(Inventory.decrementStock).toHaveBeenCalledWith('prod_1', 2);
  });

  it('fails when user authentication is missing', async () => {
    const req = {
      body: {
        items: [{ productId: 'prod_1', quantity: 1 }],
        shippingAddress: { street: 'A', city: 'B', postalCode: 'C' }
      }
    };
    const res = mockResponse();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toBe('User authentication required');
  });

  it('fails when items array is empty', async () => {
    const req = {
      body: {
        items: [],
        shippingAddress: { street: 'A', city: 'B', postalCode: 'C' },
        userId: 'u1'
      }
    };
    const res = mockResponse();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('Order must contain at least one item');
  });

  it('fails when a product cannot be found', async () => {
    Inventory.findProduct.mockResolvedValueOnce(null);
    const req = {
      body: {
        items: [{ productId: 'unknown', quantity: 1 }],
        shippingAddress: { street: 'A', city: 'B', postalCode: 'C' },
        userId: 'u1'
      }
    };
    const res = mockResponse();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toBe('Product with ID unknown not found');
  });

  it('fails when insufficient stock', async () => {
    Inventory.findProduct.mockResolvedValueOnce({
      id: 'prod_1',
      name: 'Low Stock',
      price: 5,
      stock: 1
    });
    const req = {
      body: {
        items: [{ productId: 'prod_1', quantity: 3 }],
        shippingAddress: { street: 'A', city: 'B', postalCode: 'C' },
        userId: 'u1'
      }
    };
    const res = mockResponse();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toMatch(/Insufficient stock/);
  });
});

describe('Order Controller - cancelOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OrderModel.findById = jest.fn().mockResolvedValue({
      id: 'ord_987654',
      userId: 'owner_1',
      status: 'pending',
      items: [{ productId: 'prod_1', quantity: 2 }]
    });
    OrderModel.update = jest.fn().mockImplementation(async (id, data) => ({
      id,
      ...data,
      userId: 'owner_1',
      status: data.status,
      cancelledAt: data.cancelledAt
    }));
    Inventory.incrementStock = jest.fn().mockResolvedValue(true);
  });

  it('cancels an order successfully and restores stock', async () => {
    const req = {
      params: { orderId: 'ord_987654' },
      user: { id: 'owner_1' }
    };
    const res = mockResponse();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('cancelled');
    expect(Inventory.incrementStock).toHaveBeenCalledWith('prod_1', 2);
    expect(OrderModel.update).toHaveBeenCalledWith('ord_987654', expect.objectContaining({ status: 'cancelled' }));
  });

  it('returns 404 when order does not exist', async () => {
    OrderModel.findById.mockResolvedValueOnce(null);
    const req = { params: { orderId: 'nonexistent' }, user: { id: 'u' } };
    const res = mockResponse();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toBe('Order with ID nonexistent not found');
  });

  it('prevents unauthorized cancellation', async () => {
    const req = {
      params: { orderId: 'ord_987654' },
      user: { id: 'other_user', role: 'customer' }
    };
    const res = mockResponse();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toBe('Unauthorized to cancel this order');
  });

  it('rejects cancellation for non‑cancellable statuses', async () => {
    OrderModel.findById.mockResolvedValueOnce({
      id: 'ord_987654',
      userId: 'owner_1',
      status: 'shipped',
      items: []
    });
    const req = {
      params: { orderId: 'ord_987654' },
      user: { id: 'owner_1' }
    };
    const res = mockResponse();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Cannot cancel an order with status "shipped"/);
  });
});