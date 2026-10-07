import { jest } from '@jest/globals';
import {
  getProducts,
  getCustomers,
  getTransactions,
  getGeography,
} from '../dataset/external/sanidhyy__mern-admin/server/controllers/client.js';

// ----- Mock external libraries -----
jest.mock('country-iso-2-to-3', () => ({
  __esModule: true,
  default: jest.fn((code) => (code ? code.toUpperCase() + '3' : undefined)),
}));

jest.mock('lodash', () => ({
  __esModule: true,
  escapeRegExp: jest.fn((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
}));

// ----- Mock Mongoose models -----
jest.mock('../dataset/external/sanidhyy__mern-admin/server/models/Product.js', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../dataset/external/sanidhyy__mern-admin/server/models/ProductStat.js', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../dataset/external/sanidhyy__mern-admin/server/models/User.js', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../dataset/external/sanidhyy__mern-admin/server/models/Transaction.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

// ----- Helper mock response -----
const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('client controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------- getProducts ----------
  describe('getProducts', () => {
    it('should return products with stats on success', async () => {
      const mockProducts = [
        { _id: 'p1', _doc: { name: 'Prod1', price: 10 } },
        { _id: 'p2', _doc: { name: 'Prod2', price: 20 } },
      ];
      const Product = (await import('../dataset/external/sanidhyy__mern-admin/server/models/Product.js')).default;
      const ProductStat = (await import('../dataset/external/sanidhyy__mern-admin/server/models/ProductStat.js')).default;

      Product.find.mockResolvedValue(mockProducts);
      ProductStat.find.mockImplementation(({ productId }) =>
        Promise.resolve([{ productId, sales: 5 }])
      );

      const res = createRes();
      await getProducts(null, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        {
          name: 'Prod1',
          price: 10,
          stat: [{ productId: 'p1', sales: 5 }],
        },
        {
          name: 'Prod2',
          price: 20,
          stat: [{ productId: 'p2', sales: 5 }],
        },
      ]);
    });

    it('should handle errors and respond with 404', async () => {
      const Product = (await import('../dataset/external/sanidhyy__mern-admin/server/models/Product.js')).default;
      Product.find.mockRejectedValue(new Error('DB error'));

      const res = createRes();
      await getProducts(null, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB error' });
    });
  });

  // -------- getCustomers ----------
  describe('getCustomers', () => {
    it('should return users with role=user excluding password', async () => {
      const mockUsers = [{ _id: 'u1', email: 'a@b.com' }, { _id: 'u2', email: 'c@d.com' }];
      const User = (await import('../dataset/external/sanidhyy__mern-admin/server/models/User.js')).default;

      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers),
      });

      const res = createRes();
      await getCustomers(null, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockUsers);
    });

    it('should handle errors and respond with 404', async () => {
      const User = (await import('../dataset/external/sanidhyy__mern-admin/server/models/User.js')).default;
      User.find.mockImplementation(() => ({
        select: jest.fn().mockRejectedValue(new Error('Find error')),
      }));

      const res = createRes();
      await getCustomers(null, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Find error' });
    });
  });

  // -------- getTransactions ----------
  describe('getTransactions', () => {
    const mockTx = [{ _id: 't1', cost: 100 }, { _id: 't2', cost: 200 }];

    it('should return paginated, sorted transactions and total', async () => {
      const Transaction = (await import('../dataset/external/sanidhyy__mern-admin/server/models/Transaction.js')).default;

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockTx),
      };
      Transaction.find.mockReturnValue(mockQuery);
      Transaction.countDocuments.mockResolvedValue(42);

      const req = {
        query: {
          page: '0',
          pageSize: '2',
          sort: JSON.stringify({ field: 'cost', sort: 'desc' }),
          search: 'test',
        },
      };
      const res = createRes();

      await getTransactions(req, res);

      // verify sort generation
      expect(mockQuery.sort).toHaveBeenCalledWith({ cost: -1 });
      expect(mockQuery.skip).toHaveBeenCalledWith(0); // page * pageSize
      expect(mockQuery.limit).toHaveBeenCalledWith('2');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        transactions: mockTx,
        total: 42,
      });
    });

    it('should handle errors and respond with 404', async () => {
      const Transaction = (await import('../dataset/external/sanidhyy__mern-admin/server/models/Transaction.js')).default;
      Transaction.find.mockImplementation(() => {
        throw new Error('Find error');
      });

      const req = { query: {} };
      const res = createRes();

      await getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Find error' });
    });
  });

  // -------- getGeography ----------
  describe('getGeography', () => {
    it('should map user countries to ISO3 and count them', async () => {
      const User = (await import('../dataset/external/sanidhyy__mern-admin/server/models/User.js')).default;
      const getCountryISO3 = (await import('country-iso-2-to-3')).default;

      const mockUsers = [
        { _id: '1', country: 'us' },
        { _id: '2', country: 'us' },
        { _id: '3', country: 'in' },
      ];
      User.find.mockResolvedValue(mockUsers);
      getCountryISO3.mockImplementation((code) => {
        const map = { us: 'USA', in: 'IND' };
        return map[code] || 'UNK';
      });

      const res = createRes();
      await getGeography(null, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          { id: 'USA', value: 2 },
          { id: 'IND', value: 1 },
        ])
      );
    });

    it('should handle errors and respond with 404', async () => {
      const User = (await import('../dataset/external/sanidhyy__mern-admin/server/models/User.js')).default;
      User.find.mockRejectedValue(new Error('User fetch error'));

      const res = createRes();
      await getGeography(null, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User fetch error' });
    });
  });
});