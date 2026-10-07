import { jest } from '@jest/globals';

jest.mock('../models/Product.js');
jest.mock('../models/ProductStat.js');
jest.mock('../models/User.js');
jest.mock('../models/Transaction.js');
jest.mock('country-iso-2-to-3');

import getCountryISO3 from 'country-iso-2-to-3';
import Product from '../models/Product.js';
import ProductStat from '../models/ProductStat.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import {
  getProducts,
  getCustomers,
  getTransactions,
  getGeography,
} from '../dataset/external/sanidhyy__mern-admin/server/controllers/client.js';

describe('Client Controller', () => {
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('getProducts', () => {
    it('should return products with their stats', async () => {
      const mockProducts = [
        {
          _id: 'p1',
          name: 'Product 1',
          _doc: { _id: 'p1', name: 'Product 1' },
        },
        {
          _id: 'p2',
          name: 'Product 2',
          _doc: { _id: 'p2', name: 'Product 2' },
        },
      ];
      const mockStat1 = [{ productId: 'p1', yearlySalesTotal: 5000 }];
      const mockStat2 = [{ productId: 'p2', yearlySalesTotal: 3000 }];

      Product.find.mockResolvedValue(mockProducts);
      ProductStat.find
        .mockResolvedValueOnce(mockStat1)
        .mockResolvedValueOnce(mockStat2);

      await getProducts({}, mockRes);

      expect(Product.find).toHaveBeenCalledTimes(1);
      expect(ProductStat.find).toHaveBeenCalledWith({ productId: 'p1' });
      expect(ProductStat.find).toHaveBeenCalledWith({ productId: 'p2' });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        { ...mockProducts[0]._doc, stat: mockStat1 },
        { ...mockProducts[1]._doc, stat: mockStat2 },
      ]);
    });

    it('should return 404 status when an error occurs', async () => {
      Product.find.mockRejectedValue(new Error('Database error'));

      await getProducts({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Database error' });
    });
  });

  describe('getCustomers', () => {
    it('should return customers excluding password field', async () => {
      const mockCustomers = [
        { _id: 'u1', name: 'John Doe', role: 'user' },
        { _id: 'u2', name: 'Jane Doe', role: 'user' },
      ];

      const selectMock = jest.fn().mockResolvedValue(mockCustomers);
      User.find.mockReturnValue({ select: selectMock });

      await getCustomers({}, mockRes);

      expect(User.find).toHaveBeenCalledWith({ role: 'user' });
      expect(selectMock).toHaveBeenCalledWith('-password');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockCustomers);
    });

    it('should handle errors and return 404 status', async () => {
      const selectMock = jest
        .fn()
        .mockRejectedValue(new Error('Failed to fetch customers'));
      User.find.mockReturnValue({ select: selectMock });

      await getCustomers({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Failed to fetch customers',
      });
    });
  });

  describe('getTransactions', () => {
    it('should return transactions and total count with default params', async () => {
      const req = { query: {} };
      const mockTransactions = [{ _id: 't1', cost: '10.00', userId: 'u1' }];
      const limitMock = jest.fn().mockResolvedValue(mockTransactions);
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });

      Transaction.find.mockReturnValue({ sort: sortMock });
      Transaction.countDocuments.mockResolvedValue(1);

      await getTransactions(req, mockRes);

      expect(Transaction.find).toHaveBeenCalledWith({
        $or: [
          { cost: { $regex: new RegExp('', 'i') } },
          { userId: { $regex: new RegExp('', 'i') } },
        ],
      });
      expect(sortMock).toHaveBeenCalledWith({});
      expect(skipMock).toHaveBeenCalledWith(20);
      expect(limitMock).toHaveBeenCalledWith(20);
      expect(Transaction.countDocuments).toHaveBeenCalledWith({
        name: { $regex: '', $options: 'i' },
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        transactions: mockTransactions,
        total: 1,
      });
    });

    it('should parse sort parameter correctly when provided', async () => {
      const req = {
        query: {
          page: '0',
          pageSize: '10',
          sort: JSON.stringify({ field: 'userId', sort: 'asc' }),
          search: 'test',
        },
      };
      const mockTransactions = [];
      const limitMock = jest.fn().mockResolvedValue(mockTransactions);
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });

      Transaction.find.mockReturnValue({ sort: sortMock });
      Transaction.countDocuments.mockResolvedValue(0);

      await getTransactions(req, mockRes);

      expect(sortMock).toHaveBeenCalledWith({ userId: 1 });
      expect(skipMock).toHaveBeenCalledWith(0);
      expect(limitMock).toHaveBeenCalledWith('10');
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should parse desc sort parameter correctly', async () => {
      const req = {
        query: {
          sort: JSON.stringify({ field: 'cost', sort: 'desc' }),
        },
      };
      const limitMock = jest.fn().mockResolvedValue([]);
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });

      Transaction.find.mockReturnValue({ sort: sortMock });
      Transaction.countDocuments.mockResolvedValue(0);

      await getTransactions(req, mockRes);

      expect(sortMock).toHaveBeenCalledWith({ cost: -1 });
    });

    it('should handle errors and return 404 status', async () => {
      Transaction.find.mockImplementation(() => {
        throw new Error('Transaction search error');
      });

      await getTransactions({ query: {} }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Transaction search error',
      });
    });
  });

  describe('getGeography', () => {
    it('should return mapped ISO3 country codes and user counts', async () => {
      const mockUsers = [
        { country: 'US' },
        { country: 'US' },
        { country: 'CA' },
      ];
      User.find.mockResolvedValue(mockUsers);

      getCountryISO3.mockImplementation((code) => {
        if (code === 'US') return 'USA';
        if (code === 'CA') return 'CAN';
        return code;
      });

      await getGeography({}, mockRes);

      expect(User.find).toHaveBeenCalledTimes(1);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        { id: 'USA', value: 2 },
        { id: 'CAN', value: 1 },
      ]);
    });

    it('should handle errors and return 404 status', async () => {
      User.find.mockRejectedValue(new Error('User fetch failed'));

      await getGeography({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User fetch failed',
      });
    });
  });
});