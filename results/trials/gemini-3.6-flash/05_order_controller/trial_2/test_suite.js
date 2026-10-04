import { jest } from '@jest/globals';
import { Inventory, OrderModel, createOrder, cancelOrder } from '../dataset/05_order_controller.js';

describe('Order Controller - createOrder', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      user: null,
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  test('should return 401 if userId is missing', async () => {
    req.body = {
      items: [{ productId: 'p1', quantity: 2 }],
      shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
    };

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User authentication required'
    });
  });

  test('should allow userId from req.user', async () => {
    req.user = { id: 'usr_123' };
    req.body = {
      items: [{ productId: 'p1', quantity: 2 }],
      shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
    };

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
      id: 'p1',
      name: 'Test Product',
      price: 10,
      stock: 5
    });
    jest.spyOn(Inventory, 'decrementStock').mockResolvedValue(true);
    jest.spyOn(OrderModel, 'create').mockImplementation(async (data) => ({ id: 'ord_1', ...data }));

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('should return 400 if items is missing or not a non-empty array', async () => {
    req.user = { id: 'usr_123' };
    
    // Empty items
    req.body = { items: [], shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' } };
    await createOrder(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // Missing items
    req.body = { shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' } };
    await createOrder(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('should return 400 if shipping address is missing or incomplete', async () => {
    req.user = { id: 'usr_123' };
    req.body = {
      items: [{ productId: 'p1', quantity: 1 }],
      shippingAddress: { street: '123 St', city: 'City' } // missing postalCode
    };

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Complete shipping address is required (street, city, postalCode)'
    });
  });

  test('should return 400 if an item has invalid productId or quantity', async () => {
    req.user = { id: 'usr_123' };

    // Invalid quantity (float)
    req.body = {
      items: [{ productId: 'p1', quantity: 1.5 }],
      shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
    };
    await createOrder(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // Invalid quantity (negative)
    req.body.items = [{ productId: 'p1', quantity: -1 }];
    await createOrder(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // Missing productId
    req.body.items = [{ quantity: 2 }];
    await createOrder(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('should return 404 if product is not found in Inventory', async () => {
    req.user = { id: 'usr_123' };
    req.body = {
      items: [{ productId: 'non_existent', quantity: 1 }],
      shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
    };

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue(null);

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID non_existent not found'
    });
  });

  test('should return 409 if product stock is less than requested quantity', async () => {
    req.user = { id: 'usr_123' };
    req.body = {
      items: [{ productId: 'p1', quantity: 10 }],
      shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
    };

    jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
      id: 'p1',
      name: 'Gadget',
      price: 20,
      stock: 5
    });

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Insufficient stock for product "Gadget". Available: 5, requested: 10'
    });
  });

  test('should successfully create an order and deduct stock', async () => {
    req.user = { id: 'usr_123' };
    req.body = {
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 }
      ],
      shippingAddress: { street: '123 Main St', city: 'Metropolis', postalCode: '90210' }
    };

    const p1 = { id: 'p1', name: 'Item 1', price: 10.00, stock: 5 };
    const p2 = { id: 'p2', name: 'Item 2', price: 20.00, stock: 3 };

    jest.spyOn(Inventory, 'findProduct').mockImplementation(async (id) => {
      if (id === 'p1') return p1;
      if (id === 'p2') return p2;
      return null;
    });

    const decrementSpy = jest.spyOn(Inventory, 'decrementStock').mockResolvedValue(true);
    const createSpy = jest.spyOn(OrderModel, 'create').mockImplementation(async (orderData) => ({
      id: 'ord_987654',
      ...orderData
    }));

    await createOrder(req, res);

    // Calculated total = (10 * 2) + (20 * 1) = 40
    // Tax = 40 * 0.08 = 3.2
    // Grand Total = 43.2
    expect(decrementSpy).toHaveBeenCalledTimes(2);
    expect(decrementSpy).toHaveBeenNthCalledWith(1, 'p1', 2);
    expect(decrementSpy).toHaveBeenNthCalledWith(2, 'p2', 1);

    expect(createSpy).toHaveBeenCalledWith({
      userId: 'usr_123',
      items: [
        { productId: 'p1', name: 'Item 1', unitPrice: 10.00, quantity: 2, total: 20.00 },
        { productId: 'p2', name: 'Item 2', unitPrice: 20.00, quantity: 1, total: 20.00 }
      ],
      subtotal: 40,
      tax: 3.2,
      total: 43.2,
      status: 'pending',
      shippingAddress: { street: '123 Main St', city: 'Metropolis', postalCode: '90210' }
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Order created successfully',
      data: expect.objectContaining({ id: 'ord_987654', total: 43.2 })
    });
  });

  test('should return 500 if an error is thrown', async () => {
    req.user = { id: 'usr_123' };
    req.body = {
      items: [{ productId: 'p1', quantity: 1 }],
      shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
    };

    jest.spyOn(Inventory, 'findProduct').mockRejectedValue(new Error('Database error'));

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to process order creation',
      details: 'Database error'
    });
  });
});

describe('Order Controller - cancelOrder', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      user: null,
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  test('should return 400 if orderId parameter is missing', async () => {
    req.params = {};

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order ID is required'
    });
  });

  test('should return 404 if order is not found', async () => {
    req.params = { orderId: 'ord_123' };
    jest.spyOn(OrderModel, 'findById').mockResolvedValue(null);

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order with ID ord_123 not found'
    });
  });

  test('should return 403 if user is unauthorized to cancel the order', async () => {
    req.params = { orderId: 'ord_123' };
    req.user = { id: 'usr_other', role: 'customer' };

    jest.spyOn(OrderModel, 'findById').mockResolvedValue({
      id: 'ord_123',
      userId: 'usr_owner',
      status: 'pending'
    });

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized to cancel this order'
    });
  });

  test('should allow admin user to cancel another user order', async () => {
    req.params = { orderId: 'ord_123' };
    req.user = { id: 'usr_admin', role: 'admin' };

    const mockOrder = {
      id: 'ord_123',
      userId: 'usr_owner',
      status: 'pending',
      items: [{ productId: 'p1', quantity: 2 }]
    };

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(mockOrder);
    jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
    jest.spyOn(OrderModel, 'update').mockResolvedValue({ ...mockOrder, status: 'cancelled' });

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should return 400 if order status is non-cancellable', async () => {
    req.params = { orderId: 'ord_123' };
    req.user = { id: 'usr_owner' };

    const statuses = ['shipped', 'delivered', 'cancelled'];

    for (const status of statuses) {
      jest.spyOn(OrderModel, 'findById').mockResolvedValue({
        id: 'ord_123',
        userId: 'usr_owner',
        status
      });

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: `Cannot cancel an order with status "${status}"`
      });
    }
  });

  test('should successfully cancel order and restore stock', async () => {
    req.params = { orderId: 'ord_123' };
    req.user = { id: 'usr_owner' };

    const mockOrder = {
      id: 'ord_123',
      userId: 'usr_owner',
      status: 'pending',
      items: [
        { productId: 'p1', quantity: 3 },
        { productId: 'p2', quantity: 1 }
      ]
    };

    jest.spyOn(OrderModel, 'findById').mockResolvedValue(mockOrder);
    const incrementSpy = jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
    const updateSpy = jest.spyOn(OrderModel, 'update').mockImplementation(async (id, data) => ({
      ...mockOrder,
      ...data
    }));

    await cancelOrder(req, res);

    expect(incrementSpy).toHaveBeenCalledTimes(2);
    expect(incrementSpy).toHaveBeenNthCalledWith(1, 'p1', 3);
    expect(incrementSpy).toHaveBeenNthCalledWith(2, 'p2', 1);

    expect(updateSpy).toHaveBeenCalledWith('ord_123', {
      status: 'cancelled',
      cancelledAt: expect.any(Date)
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Order cancelled successfully and stock restored',
      data: expect.objectContaining({ id: 'ord_123', status: 'cancelled' })
    });
  });

  test('should return 500 if an error occurs during cancellation', async () => {
    req.params = { orderId: 'ord_123' };
    jest.spyOn(OrderModel, 'findById').mockRejectedValue(new Error('Update failed'));

    await cancelOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to cancel order',
      details: 'Update failed'
    });
  });
});