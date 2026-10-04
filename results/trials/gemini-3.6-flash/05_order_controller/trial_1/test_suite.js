import { jest } from '@jest/globals';
import { createOrder, cancelOrder, Inventory, OrderModel } from '../dataset/05_order_controller.js';

describe('Order Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('Default Database Models', () => {
    test('Inventory default methods work as expected', async () => {
      await expect(Inventory.findProduct('1')).resolves.toBeNull();
      await expect(Inventory.decrementStock('1', 5)).resolves.toBe(true);
      await expect(Inventory.incrementStock('1', 5)).resolves.toBe(true);
    });

    test('OrderModel default methods work as expected', async () => {
      const created = await OrderModel.create({ test: 'data' });
      expect(created).toMatchObject({ id: 'ord_987654', test: 'data' });
      expect(created.createdAt).toBeInstanceOf(Date);

      await expect(OrderModel.findById('1')).resolves.toBeNull();

      const updated = await OrderModel.update('1', { status: 'active' });
      expect(updated).toEqual({ id: '1', status: 'active' });
    });
  });

  describe('createOrder', () => {
    test('should return 401 if user is not authenticated', async () => {
      req.body = {};
      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User authentication required'
      });
    });

    test('should return 400 if items array is missing or empty', async () => {
      req.user = { id: 'usr_123' };

      // Missing items
      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Not an array
      req.body = { items: 'not-an-array' };
      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Empty array
      req.body = { items: [] };
      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order must contain at least one item'
      });
    });

    test('should return 400 if shippingAddress is incomplete or missing', async () => {
      req.user = { id: 'usr_123' };
      req.body = { items: [{ productId: 'p1', quantity: 1 }] };

      // Missing shippingAddress
      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Incomplete shippingAddress
      req.body.shippingAddress = { street: '123 St', city: 'City' }; // missing postalCode
      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Complete shipping address is required (street, city, postalCode)'
      });
    });

    test.each([
      [{ productId: '', quantity: 1 }, 'missing productId'],
      [{ productId: 'p1', quantity: '1' }, 'quantity not a number'],
      [{ productId: 'p1', quantity: 0 }, 'quantity zero'],
      [{ productId: 'p1', quantity: -2 }, 'quantity negative'],
      [{ productId: 'p1', quantity: 1.5 }, 'quantity float']
    ])('should return 400 when item schema is invalid: %s', async (invalidItem) => {
      req.user = { id: 'usr_123' };
      req.body = {
        items: [invalidItem],
        shippingAddress: { street: '123 Main St', city: 'Metropolis', postalCode: '12345' }
      };

      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Each item must have a valid productId and an integer quantity greater than zero'
      });
    });

    test('should return 404 if product is not found in inventory', async () => {
      req.user = { id: 'usr_123' };
      req.body = {
        items: [{ productId: 'p_unknown', quantity: 2 }],
        shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
      };

      jest.spyOn(Inventory, 'findProduct').mockResolvedValue(null);

      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product with ID p_unknown not found'
      });
    });

    test('should return 409 if insufficient stock for product (with name)', async () => {
      req.user = { id: 'usr_123' };
      req.body = {
        items: [{ productId: 'p1', quantity: 10 }],
        shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
      };

      jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
        id: 'p1',
        name: 'Super Widget',
        stock: 5,
        price: 20
      });

      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient stock for product "Super Widget". Available: 5, requested: 10'
      });
    });

    test('should return 409 if insufficient stock for product (fallback to productId when name missing)', async () => {
      req.user = { id: 'usr_123' };
      req.body = {
        items: [{ productId: 'p1', quantity: 10 }],
        shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
      };

      jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
        id: 'p1',
        stock: 2,
        price: 20
      });

      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient stock for product "p1". Available: 2, requested: 10'
      });
    });

    test('should create order successfully and deduct inventory', async () => {
      req.body = {
        userId: 'usr_456',
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 1 }
        ],
        shippingAddress: { street: '456 Elm St', city: 'Gotham', postalCode: '67890' }
      };

      const product1 = { id: 'p1', name: 'Item 1', price: 10.0, stock: 10 };
      const product2 = { id: 'p2', name: 'Item 2', price: 25.5, stock: 5 };

      jest.spyOn(Inventory, 'findProduct')
        .mockImplementation(async (id) => id === 'p1' ? product1 : product2);
      jest.spyOn(Inventory, 'decrementStock').mockResolvedValue(true);

      const mockCreatedOrder = {
        id: 'ord_100',
        userId: 'usr_456',
        subtotal: 45.5,
        tax: 3.64,
        total: 49.14,
        status: 'pending'
      };
      jest.spyOn(OrderModel, 'create').mockResolvedValue(mockCreatedOrder);

      await createOrder(req, res);

      expect(Inventory.decrementStock).toHaveBeenCalledWith('p1', 2);
      expect(Inventory.decrementStock).toHaveBeenCalledWith('p2', 1);
      expect(OrderModel.create).toHaveBeenCalledWith({
        userId: 'usr_456',
        items: [
          { productId: 'p1', name: 'Item 1', unitPrice: 10.0, quantity: 2, total: 20.0 },
          { productId: 'p2', name: 'Item 2', unitPrice: 25.5, quantity: 1, total: 25.5 }
        ],
        subtotal: 45.5,
        tax: 3.64,
        total: 49.14,
        status: 'pending',
        shippingAddress: { street: '456 Elm St', city: 'Gotham', postalCode: '67890' }
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Order created successfully',
        data: mockCreatedOrder
      });
    });

    test('should return 500 when an exception is thrown', async () => {
      req.user = { id: 'usr_123' };
      req.body = {
        items: [{ productId: 'p1', quantity: 1 }],
        shippingAddress: { street: '123 St', city: 'City', postalCode: '12345' }
      };

      jest.spyOn(Inventory, 'findProduct').mockRejectedValue(new Error('DB Connection Failed'));

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process order creation',
        details: 'DB Connection Failed'
      });
    });
  });

  describe('cancelOrder', () => {
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
      req.params = { orderId: 'ord_missing' };
      jest.spyOn(OrderModel, 'findById').mockResolvedValue(null);

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order with ID ord_missing not found'
      });
    });

    test('should return 403 if user is unauthorized to cancel the order', async () => {
      req.params = { orderId: 'ord_123' };
      req.user = { id: 'usr_different', role: 'customer' };

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

    test('should allow admin to cancel another user order', async () => {
      req.params = { orderId: 'ord_123' };
      req.user = { id: 'admin_usr', role: 'admin' };

      const existingOrder = {
        id: 'ord_123',
        userId: 'usr_owner',
        status: 'pending',
        items: [{ productId: 'p1', quantity: 2 }]
      };

      jest.spyOn(OrderModel, 'findById').mockResolvedValue(existingOrder);
      jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
      jest.spyOn(OrderModel, 'update').mockResolvedValue({ ...existingOrder, status: 'cancelled' });

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test.each(['shipped', 'delivered', 'cancelled'])(
      'should return 400 when trying to cancel an order with status "%s"',
      async (status) => {
        req.params = { orderId: 'ord_123' };
        req.user = { id: 'usr_owner' };

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
    );

    test('should cancel order successfully and restore inventory', async () => {
      req.params = { orderId: 'ord_123' };
      req.body = { userId: 'usr_owner' };

      const mockOrder = {
        id: 'ord_123',
        userId: 'usr_owner',
        status: 'pending',
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 3 }
        ]
      };

      const updatedOrder = {
        ...mockOrder,
        status: 'cancelled',
        cancelledAt: new Date()
      };

      jest.spyOn(OrderModel, 'findById').mockResolvedValue(mockOrder);
      jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
      jest.spyOn(OrderModel, 'update').mockResolvedValue(updatedOrder);

      await cancelOrder(req, res);

      expect(Inventory.incrementStock).toHaveBeenCalledWith('p1', 2);
      expect(Inventory.incrementStock).toHaveBeenCalledWith('p2', 3);
      expect(OrderModel.update).toHaveBeenCalledWith('ord_123', {
        status: 'cancelled',
        cancelledAt: expect.any(Date)
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Order cancelled successfully and stock restored',
        data: updatedOrder
      });
    });

    test('should return 500 when cancelOrder throws an error', async () => {
      req.params = { orderId: 'ord_123' };
      jest.spyOn(OrderModel, 'findById').mockRejectedValue(new Error('Database timeout'));

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to cancel order',
        details: 'Database timeout'
      });
    });
  });
});