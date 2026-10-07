import { jest } from '@jest/globals';
import {
  addOrderItems,
  getOrderById,
  updateOrderToPaid,
  updateOrderToDelivered,
  getMyOrders,
  getOrders,
} from '../dataset/external/SanjulaD__web-cw/backend/controllers/orderController.js';
import orderSeed from '../dataset/external/SanjulaD__web-cw/backend/models/orderSeedModel.js';

jest.mock('../dataset/external/SanjulaD__web-cw/backend/models/orderSeedModel.js');

describe('orderController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('addOrderItems', () => {
    it('should return 400 and throw when orderItems is empty', async () => {
      req.body = { orderItems: [] };

      await expect(addOrderItems(req, res, next)).rejects.toThrow('No Order Items');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should create order, save it and respond with 201', async () => {
      const mockSave = jest.fn().mockResolvedValue({ _id: 'order123' });
      orderSeed.mockImplementation(() => ({ save: mockSave }));

      req.body = {
        orderItems: [{ product: 'p1', qty: 2 }],
        shippingAddress: { address: '123 St' },
        paymentMethod: 'PayPal',
        itemsPrice: 100,
        taxPrice: 10,
        shippingPrice: 5,
        totalPrice: 115,
      };
      req.user = { _id: 'user123' };

      await addOrderItems(req, res, next);

      expect(orderSeed).toHaveBeenCalledWith({
        orderItems: req.body.orderItems,
        user: 'user123',
        shippingAddress: req.body.shippingAddress,
        paymentMethod: req.body.paymentMethod,
        itemsPrice: req.body.itemsPrice,
        taxPrice: req.body.taxPrice,
        shippingPrice: req.body.shippingPrice,
        totalPrice: req.body.totalPrice,
      });
      expect(mockSave).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ _id: 'order123' });
    });
  });

  describe('getOrderById', () => {
    it('should return order when found', async () => {
      const mockPopulate = jest.fn().mockResolvedValue({ _id: 'order123' });
      orderSeed.findById = jest.fn().mockReturnValue({ populate: mockPopulate });

      req.params = { id: 'order123' };

      await getOrderById(req, res, next);

      expect(orderSeed.findById).toHaveBeenCalledWith('order123');
      expect(mockPopulate).toHaveBeenCalledWith('user', 'name email');
      expect(res.json).toHaveBeenCalledWith({ _id: 'order123' });
    });

    it('should 404 and throw when order not found', async () => {
      orderSeed.findById = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

      req.params = { id: 'nonexistent' };

      await expect(getOrderById(req, res, next)).rejects.toThrow('Order Not Found');
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateOrderToPaid', () => {
    it('should update order to paid and respond with updated order', async () => {
      const mockSave = jest.fn().mockResolvedValue({ _id: 'order123', isPaid: true });
      const orderDoc = { save: mockSave };
      orderSeed.findById = jest.fn().mockResolvedValue(orderDoc);

      req.params = { id: 'order123' };
      req.body = {
        id: 'pay123',
        status: 'COMPLETED',
        update_time: '2023-01-01T00:00:00Z',
        payer: { email_address: 'payer@example.com' },
      };

      await updateOrderToPaid(req, res, next);

      expect(orderSeed.findById).toHaveBeenCalledWith('order123');
      expect(orderDoc.isPaid).toBe(true);
      expect(orderDoc.paidAt).toBeDefined();
      expect(orderDoc.paymentResult).toEqual({
        id: 'pay123',
        status: 'COMPLETED',
        update_time: '2023-01-01T00:00:00Z',
        email_address: 'payer@example.com',
      });
      expect(mockSave).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ _id: 'order123', isPaid: true });
    });

    it('should 404 and throw when order not found', async () => {
      orderSeed.findById = jest.fn().mockResolvedValue(null);

      req.params = { id: 'missing' };

      await expect(updateOrderToPaid(req, res, next)).rejects.toThrow('Order Not Found');
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateOrderToDelivered', () => {
    it('should mark order as delivered and respond with updated order', async () => {
      const mockSave = jest.fn().mockResolvedValue({ _id: 'order123', isDelivered: true });
      const orderDoc = { save: mockSave };
      orderSeed.findById = jest.fn().mockResolvedValue(orderDoc);

      req.params = { id: 'order123' };

      await updateOrderToDelivered(req, res, next);

      expect(orderSeed.findById).toHaveBeenCalledWith('order123');
      expect(orderDoc.isDelivered).toBe(true);
      expect(orderDoc.deliveredAt).toBeDefined();
      expect(mockSave).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ _id: 'order123', isDelivered: true });
    });

    it('should 404 and throw when order not found', async () => {
      orderSeed.findById = jest.fn().mockResolvedValue(null);

      req.params = { id: 'missing' };

      await expect(updateOrderToDelivered(req, res, next)).rejects.toThrow('Order Not Found');
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getMyOrders', () => {
    it('should return orders for the logged‑in user', async () => {
      const ordersArray = [{ _id: 'o1' }, { _id: 'o2' }];
      orderSeed.find = jest.fn().mockResolvedValue(ordersArray);

      req.user = { _id: 'user123' };

      await getMyOrders(req, res, next);

      expect(orderSeed.find).toHaveBeenCalledWith({ user: 'user123' });
      expect(res.json).toHaveBeenCalledWith(ordersArray);
    });
  });

  describe('getOrders', () => {
    it('should return all orders with populated user fields', async () => {
      const populated = [{ _id: 'o1', user: { id: 'u1', name: 'John' } }];
      const mockPopulate = jest.fn().mockResolvedValue(populated);
      orderSeed.find = jest.fn().mockReturnValue({ populate: mockPopulate });

      await getOrders(req, res, next);

      expect(orderSeed.find).toHaveBeenCalledWith({});
      expect(mockPopulate).toHaveBeenCalledWith('user', 'id name');
      expect(res.json).toHaveBeenCalledWith(populated);
    });
  });
});