import { jest } from '@jest/globals';
import { createOrder, cancelOrder, Inventory, OrderModel } from '../dataset/05_order_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('05_order_controller tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createOrder', () => {
    test('should return 401 if user is not authenticated', async () => {
      const req = { body: {} };
      const res = mockResponse();

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User authentication required'
      });
    });

    test('should return 400 if items array is missing or empty', async () => {
      const req = {
        user: { id: 'user_1' },
        body: { items: [] }
      };
      const res = mockResponse();

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order must contain at least one item'
      });
    });

    test('should return 400 if shipping address is incomplete', async () => {
      const req = {
        user: { id: 'user_1' },
        body: {
          items: [{ productId: 'p1', quantity: 2 }],
          shippingAddress: { street: '123 Main St', city: 'Springfield' } // missing postalCode
        }
      };
      const res = mockResponse();

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Complete shipping address is required (street, city, postalCode)'
      });
    });

    test('should return 400 if item has invalid productId, quantity or non-integer quantity', async () => {
      const req = {
        user: { id: 'user_1' },
        body: {
          items: [{ productId: 'p1', quantity: 2.5 }],
          shippingAddress: { street: '123 Main St', city: 'Springfield', postalCode: '12345' }
        }
      };
      const res = mockResponse();

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Each item must have a valid productId and an integer quantity greater than zero'
      });
    });

    test('should return 404 if product is not found in inventory', async () => {
      jest.spyOn(Inventory, 'findProduct').mockResolvedValue(null);

      const req = {
        user: { id: 'user_1' },
        body: {
          items: [{ productId: 'non_existent', quantity: 1 }],
          shippingAddress: { street: '123 Main St', city: 'Springfield', postalCode: '12345' }
        }
      };
      const res = mockResponse();

      await createOrder(req, res);

      expect(Inventory.findProduct).toHaveBeenCalledWith('non_existent');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product with ID non_existent not found'
      });
    });

    test('should return 409 if product stock is insufficient', async () => {
      jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
        id: 'p1',
        name: 'Test Widget',
        price: 10,
        stock: 1
      });

      const req = {
        user: { id: 'user_1' },
        body: {
          items: [{ productId: 'p1', quantity: 5 }],
          shippingAddress: { street: '123 Main St', city: 'Springfield', postalCode: '12345' }
        }
      };
      const res = mockResponse();

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient stock for product "Test Widget". Available: 1, requested: 5'
      });
    });

    test('should create order successfully and return 201', async () => {
      jest.spyOn(Inventory, 'findProduct').mockResolvedValue({
        id: 'p1',
        name: 'Gadget',
        price: 100,
        stock: 10
      });
      jest.spyOn(Inventory, 'decrementStock').mockResolvedValue(true);
      jest.spyOn(OrderModel, 'create').mockImplementation(async (data) => ({
        id: 'ord_123',
        ...data,
        createdAt: new Date('2023-01-01')
      }));

      const req = {
        body: {
          userId: 'user_2',
          items: [{ productId: 'p1', quantity: 2 }],
          shippingAddress: { street: '123 Main St', city: 'Springfield', postalCode: '12345' }
        }
      };
      const res = mockResponse();

      await createOrder(req, res);

      expect(Inventory.decrementStock).toHaveBeenCalledWith('p1', 2);
      expect(OrderModel.create).toHaveBeenCalledWith({
        userId: 'user_2',
        items: [
          {
            productId: 'p1',
            name: 'Gadget',
            unitPrice: 100,
            quantity: 2,
            total: 200
          }
        ],
        subtotal: 200,
        tax: 16,
        total: 216,
        status: 'pending',
        shippingAddress: { street: '123 Main St', city: 'Springfield', postalCode: '12345' }
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Order created successfully',
        data: expect.objectContaining({
          id: 'ord_123',
          userId: 'user_2',
          subtotal: 200,
          tax: 16,
          total: 216
        })
      });
    });

    test('should return 500 on unexpected error', async () => {
      jest.spyOn(Inventory, 'findProduct').mockRejectedValue(new Error('Database error'));

      const req = {
        user: { id: 'user_1' },
        body: {
          items: [{ productId: 'p1', quantity: 1 }],
          shippingAddress: { street: '123 Main St', city: 'Springfield', postalCode: '12345' }
        }
      };
      const res = mockResponse();

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process order creation',
        details: 'Database error'
      });
    });
  });

  describe('cancelOrder', () => {
    test('should return 400 if orderId parameter is missing', async () => {
      const req = { params: {} };
      const res = mockResponse();

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order ID is required'
      });
    });

    test('should return 404 if order is not found', async () => {
      jest.spyOn(OrderModel, 'findById').mockResolvedValue(null);

      const req = { params: { orderId: 'ord_999' } };
      const res = mockResponse();

      await cancelOrder(req, res);

      expect(OrderModel.findById).toHaveBeenCalledWith('ord_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order with ID ord_999 not found'
      });
    });

    test('should return 403 if user is unauthorized to cancel order', async () => {
      jest.spyOn(OrderModel, 'findById').mockResolvedValue({
        id: 'ord_123',
        userId: 'user_owner',
        status: 'pending',
        items: []
      });

      const req = {
        params: { orderId: 'ord_123' },
        user: { id: 'user_other', role: 'customer' }
      };
      const res = mockResponse();

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized to cancel this order'
      });
    });

    test('should return 400 if order has non-cancellable status', async () => {
      jest.spyOn(OrderModel, 'findById').mockResolvedValue({
        id: 'ord_123',
        userId: 'user_1',
        status: 'shipped',
        items: []
      });

      const req = {
        params: { orderId: 'ord_123' },
        user: { id: 'user_1' }
      };
      const res = mockResponse();

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot cancel an order with status "shipped"'
      });
    });

    test('should successfully cancel order, restore inventory, and return 200', async () => {
      const orderData = {
        id: 'ord_123',
        userId: 'user_1',
        status: 'pending',
        items: [{ productId: 'p1', quantity: 2 }]
      };
      jest.spyOn(OrderModel, 'findById').mockResolvedValue(orderData);
      jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
      jest.spyOn(OrderModel, 'update').mockImplementation(async (id, data) => ({
        ...orderData,
        ...data
      }));

      const req = {
        params: { orderId: 'ord_123' },
        user: { id: 'user_1' }
      };
      const res = mockResponse();

      await cancelOrder(req, res);

      expect(Inventory.incrementStock).toHaveBeenCalledWith('p1', 2);
      expect(OrderModel.update).toHaveBeenCalledWith('ord_123', {
        status: 'cancelled',
        cancelledAt: expect.any(Date)
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Order cancelled successfully and stock restored',
        data: expect.objectContaining({
          id: 'ord_123',
          status: 'cancelled'
        })
      });
    });

    test('should allow admin user to cancel order owned by another user', async () => {
      const orderData = {
        id: 'ord_123',
        userId: 'user_owner',
        status: 'pending',
        items: [{ productId: 'p1', quantity: 1 }]
      };
      jest.spyOn(OrderModel, 'findById').mockResolvedValue(orderData);
      jest.spyOn(Inventory, 'incrementStock').mockResolvedValue(true);
      jest.spyOn(OrderModel, 'update').mockResolvedValue({ ...orderData, status: 'cancelled' });

      const req = {
        params: { orderId: 'ord_123' },
        user: { id: 'admin_user', role: 'admin' }
      };
      const res = mockResponse();

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Order cancelled successfully and stock restored',
        data: expect.objectContaining({ status: 'cancelled' })
      });
    });

    test('should return 500 when an exception is thrown during cancellation', async () => {
      jest.spyOn(OrderModel, 'findById').mockRejectedValue(new Error('Update failed'));

      const req = {
        params: { orderId: 'ord_123' }
      };
      const res = mockResponse();

      await cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to cancel order',
        details: 'Update failed'
      });
    });
  });
});