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

describe('Order Controller - createOrder', () => {
  const userId = 'usr_123';
  const product = {
    id: 'prd_1',
    name: 'Test Product',
    price: 10,
    stock: 5
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Inventory.findProduct = jest.fn().mockResolvedValue(product);
    Inventory.decrementStock = jest.fn().mockResolvedValue(true);
    OrderModel.create = jest.fn().mockImplementation(async (data) => ({
      id: 'ord_987654',
      ...data,
      createdAt: new Date()
    }));
  });

  test('should create order successfully', async () => {
    const req = {
      user: { id: userId },
      body: {
        items: [{ productId: product.id, quantity: 2 }],
        shippingAddress: {
          street: '123 Main St',
          city: 'Metropolis',
          postalCode: '12345'
        }
      }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Order created successfully',
        data: expect.objectContaining({
          userId,
          items: [
            expect.objectContaining({
              productId: product.id,
              name: product.name,
              unitPrice: product.price,
              quantity: 2,
              total: product.price * 2
            })
          ],
          subtotal: product.price * 2,
          tax: parseFloat(((product.price * 2) * 0.08).toFixed(2)),
          total: parseFloat(((product.price * 2) * 1.08).toFixed(2)),
          status: 'pending',
          shippingAddress: req.body.shippingAddress
        })
      })
    );
    expect(Inventory.findProduct).toHaveBeenCalledWith(product.id);
    expect(Inventory.decrementStock).toHaveBeenCalledWith(product.id, 2);
    expect(OrderModel.create).toHaveBeenCalled();
  });

  test('should return 401 when user not authenticated', async () => {
    const req = { body: {} };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User authentication required'
    });
  });

  test('should return 400 when items array is missing', async () => {
    const req = {
      user: { id: userId },
      body: { shippingAddress: { street: 's', city: 'c', postalCode: 'p' } }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order must contain at least one item'
    });
  });

  test('should return 404 when product not found', async () => {
    Inventory.findProduct = jest.fn().mockResolvedValue(null);
    const req = {
      user: { id: userId },
      body: {
        items: [{ productId: 'unknown', quantity: 1 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' }
      }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID unknown not found'
    });
  });

  test('should return 409 when insufficient stock', async () => {
    Inventory.findProduct = jest.fn().mockResolvedValue({ ...product, stock: 1 });
    const req = {
      user: { id: userId },
      body: {
        items: [{ productId: product.id, quantity: 3 }],
        shippingAddress: { street: 's', city: 'c', postalCode: 'p' }
      }
    };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: `Insufficient stock for product "${product.name}". Available: 1, requested: 3`
    });
  });
});

describe('Order Controller - cancelOrder', () => {
  const userId = 'usr_123';
  const adminUser = { id: 'admin_1', role: 'admin' };
  const order = {
    id: 'ord_987654',
    userId,
    status: 'pending',
    items: [{ productId: 'prd_1', quantity: 2 }],
    shippingAddress: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
    OrderModel.findById = jest.fn().mockResolvedValue(order);
    OrderModel.update = jest.fn().mockImplementation(async (id, data) => ({
      ...order,
      ...data
    }));
    Inventory.incrementStock = jest.fn().mockResolvedValue(true);
  });

  test('should cancel order successfully for owner', async () => {
    const req = {
      user: { id: userId },
      params: { orderId: order.id }
    };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(OrderModel.findById).toHaveBeenCalledWith(order.id);
    expect(Inventory.incrementStock).toHaveBeenCalledWith('prd_1', 2);
    expect(OrderModel.update).toHaveBeenCalledWith(order.id, expect.objectContaining({ status: 'cancelled' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Order cancelled successfully and stock restored',
        data: expect.objectContaining({ status: 'cancelled' })
      })
    );
  });

  test('should cancel order successfully for admin', async () => {
    const req = {
      user: adminUser,
      params: { orderId: order.id }
    };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should return 403 when non‑owner non‑admin attempts cancellation', async () => {
    const req = {
      user: { id: 'other_user' },
      params: { orderId: order.id }
    };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized to cancel this order'
    });
  });

  test('should return 400 when order status is non‑cancellable', async () => {
    OrderModel.findById = jest.fn().mockResolvedValue({ ...order, status: 'shipped' });
    const req = {
      user: { id: userId },
      params: { orderId: order.id }
    };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot cancel an order with status "shipped"'
    });
  });

  test('should return 404 when order not found', async () => {
    OrderModel.findById = jest.fn().mockResolvedValue(null);
    const req = {
      user: { id: userId },
      params: { orderId: 'nonexistent' }
    };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order with ID nonexistent not found'
    });
  });

  test('should return 400 when orderId param missing', async () => {
    const req = { user: { id: userId }, params: {} };
    const res = mockRes();

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order ID is required'
    });
  });
});