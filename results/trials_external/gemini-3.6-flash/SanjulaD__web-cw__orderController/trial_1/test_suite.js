import { jest } from '@jest/globals';

jest.mock('../dataset/external/SanjulaD__web-cw/backend/models/orderSeedModel.js');

import orderSeed from '../dataset/external/SanjulaD__web-cw/backend/models/orderSeedModel.js';
import {
  addOrderItems,
  getOrderById,
  updateOrderToPaid,
  updateOrderToDelivered,
  getMyOrders,
  getOrders,
} from '../dataset/external/SanjulaD__web-cw/backend/controllers/orderController.js';

describe('Order Controller', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      params: {},
      user: { _id: 'user123' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('addOrderItems', () => {
    it('should set status 400 and pass error to next if orderItems is empty', async () => {
      req.body = { orderItems: [] };

      await addOrderItems(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('No Order Items');
    });

    it('should create order and return status 201 with created order when orderItems are present', async () => {
      const mockOrderData = {
        orderItems: [{ name: 'Sample Item', qty: 1, price: 10 }],
        shippingAddress: { address: '123 Main St' },
        paymentMethod: 'PayPal',
        itemsPrice: 10,
        taxPrice: 1,
        shippingPrice: 2,
        totalPrice: 13,
      };
      req.body = mockOrderData;

      const mockCreatedOrder = { ...mockOrderData, user: 'user123', _id: 'order123' };
      
      orderSeed.prototype.save = jest.fn().mockResolvedValue(mockCreatedOrder);

      await addOrderItems(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreatedOrder);
    });
  });

  describe('getOrderById', () => {
    it('should return order when order is found by ID', async () => {
      req.params = { id: 'order123' };
      const mockOrder = { _id: 'order123', user: { name: 'John Doe', email: 'john@example.com' } };

      const populateMock = jest.fn().mockResolvedValue(mockOrder);
      orderSeed.findById.mockReturnValue({ populate: populateMock });

      await getOrderById(req, res, next);

      expect(orderSeed.findById).toHaveBeenCalledWith('order123');
      expect(populateMock).toHaveBeenCalledWith('user', 'name email');
      expect(res.json).toHaveBeenCalledWith(mockOrder);
    });

    it('should set status 404 and pass error to next if order is not found', async () => {
      req.params = { id: 'order123' };

      const populateMock = jest.fn().mockResolvedValue(null);
      orderSeed.findById.mockReturnValue({ populate: populateMock });

      await getOrderById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Order not Found');
    });
  });

  describe('updateOrderToPaid', () => {
    it('should update order payment status and return updated order', async () => {
      req.params = { id: 'order123' };
      req.body = {
        id: 'pay123',
        status: 'COMPLETED',
        update_time: '2023-01-01',
        payer: { email_address: 'payer@example.com' },
      };

      const mockOrder = {
        _id: 'order123',
        isPaid: false,
        save: jest.fn(),
      };
      const mockUpdatedOrder = { ...mockOrder, isPaid: true };
      mockOrder.save.mockResolvedValue(mockUpdatedOrder);

      orderSeed.findById.mockResolvedValue(mockOrder);

      await updateOrderToPaid(req, res, next);

      expect(orderSeed.findById).toHaveBeenCalledWith('order123');
      expect(mockOrder.isPaid).toBe(true);
      expect(mockOrder.paymentResult).toEqual({
        id: 'pay123',
        status: 'COMPLETED',
        update_time: '2023-01-01',
        email_address: 'payer@example.com',
      });
      expect(mockOrder.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUpdatedOrder);
    });

    it('should set status 404 and pass error if order to pay is not found', async () => {
      req.params = { id: 'order123' };
      orderSeed.findById.mockResolvedValue(null);

      await updateOrderToPaid(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Order not Found');
    });
  });

  describe('updateOrderToDelivered', () => {
    it('should update order delivery status and return updated order', async () => {
      req.params = { id: 'order123' };

      const mockOrder = {
        _id: 'order123',
        isDelivered: false,
        save: jest.fn(),
      };
      const mockUpdatedOrder = { ...mockOrder, isDelivered: true };
      mockOrder.save.mockResolvedValue(mockUpdatedOrder);

      orderSeed.findById.mockResolvedValue(mockOrder);

      await updateOrderToDelivered(req, res, next);

      expect(orderSeed.findById).toHaveBeenCalledWith('order123');
      expect(mockOrder.isDelivered).toBe(true);
      expect(mockOrder.deliveredAt).toBeDefined();
      expect(mockOrder.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUpdatedOrder);
    });

    it('should set status 404 and pass error if order to deliver is not found', async () => {
      req.params = { id: 'order123' };
      orderSeed.findById.mockResolvedValue(null);

      await updateOrderToDelivered(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Order not Found');
    });
  });

  describe('getMyOrders', () => {
    it('should return orders for the logged-in user', async () => {
      const mockOrders = [{ _id: 'order1' }, { _id: 'order2' }];
      orderSeed.find.mockResolvedValue(mockOrders);

      await getMyOrders(req, res, next);

      expect(orderSeed.find).toHaveBeenCalledWith({ user: 'user123' });
      expect(res.json).toHaveBeenCalledWith(mockOrders);
    });
  });

  describe('getOrders', () => {
    it('should return all orders populated with user id and name', async () => {
      const mockOrders = [{ _id: 'order1', user: { id: 'u1', name: 'User 1' } }];
      const populateMock = jest.fn().mockResolvedValue(mockOrders);
      orderSeed.find.mockReturnValue({ populate: populateMock });

      await getOrders(req, res, next);

      expect(orderSeed.find).toHaveBeenCalledWith({});
      expect(populateMock).toHaveBeenCalledWith('user', 'id name');
      expect(res.json).toHaveBeenCalledWith(mockOrders);
    });
  });
});