import { jest } from '@jest/globals';
import { OrderAnalytics, getRevenueMetrics, getTopSellingProducts } from '../dataset/10_analytics_controller.js';

describe('10_analytics_controller', () => {
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getRevenueMetrics', () => {
    test('should return 400 if req.query is undefined or missing required dates', async () => {
      const req = {};
      await getRevenueMetrics(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    });

    test('should return 400 if startDate or endDate is missing', async () => {
      const req = { query: { startDate: '2023-01-01' } };
      await getRevenueMetrics(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    });

    test('should return 400 if startDate or endDate format is invalid', async () => {
      const req = { query: { startDate: 'invalid-date', endDate: '2023-01-31' } };
      await getRevenueMetrics(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
      });
    });

    test('should return 400 if startDate is later than endDate', async () => {
      const req = { query: { startDate: '2023-02-01', endDate: '2023-01-01' } };
      await getRevenueMetrics(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'startDate cannot be later than endDate'
      });
    });

    test('should return 400 if groupBy parameter is invalid', async () => {
      const req = { query: { startDate: '2023-01-01', endDate: '2023-01-31', groupBy: 'weekly' } };
      await getRevenueMetrics(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid groupBy parameter. Allowed values: day, month, year'
      });
    });

    test('should return 200 and revenue metrics with default groupBy (day)', async () => {
      const req = { query: { startDate: '2023-01-01', endDate: '2023-01-31' } };
      const aggregateResult = [
        { period: '2023-01-01', totalRevenue: 100.50, totalOrders: 2, avgOrderValue: 50.25 },
        { period: '2023-01-02', totalRevenue: 200.00, totalOrders: 3, avgOrderValue: 66.67 }
      ];

      jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue(aggregateResult);

      await getRevenueMetrics(req, mockRes);

      expect(OrderAnalytics.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          $group: expect.objectContaining({
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          })
        })
      ]));
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          summary: {
            totalRevenue: 300.50,
            totalOrders: 5,
            avgOrderValue: 60.10
          },
          timeSeries: aggregateResult
        }
      });
    });

    test('should process groupBy month and year properly', async () => {
      const reqMonth = { query: { startDate: '2023-01-01', endDate: '2023-12-31', groupBy: 'MONTH' } };
      jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue([]);

      await getRevenueMetrics(reqMonth, mockRes);

      expect(OrderAnalytics.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          $group: expect.objectContaining({
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
          })
        })
      ]));
    });

    test('should handle zero results gracefully', async () => {
      const req = { query: { startDate: '2023-01-01', endDate: '2023-01-31' } };
      jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue([]);

      await getRevenueMetrics(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          summary: {
            totalRevenue: 0,
            totalOrders: 0,
            avgOrderValue: 0
          },
          timeSeries: []
        }
      });
    });

    test('should return 500 when database aggregation throws error', async () => {
      const req = { query: { startDate: '2023-01-01', endDate: '2023-01-31' } };
      jest.spyOn(OrderAnalytics, 'aggregate').mockRejectedValue(new Error('Database issue'));

      await getRevenueMetrics(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate revenue analytics',
        details: 'Database issue'
      });
    });
  });

  describe('getTopSellingProducts', () => {
    test.each([
      ['0'],
      ['51'],
      ['-5'],
      ['invalid_number']
    ])('should return 400 when limit is invalid (%s)', async (limitValue) => {
      const req = { query: { limit: limitValue } };
      await getTopSellingProducts(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be a number between 1 and 50'
      });
    });

    test('should return 200 and top selling products with default limit 10 when query is empty', async () => {
      const req = {};
      const mockProducts = [
        { productId: 'p1', productName: 'Product 1', totalUnitsSold: 15, totalRevenue: 150.00 },
        { productId: 'p2', productName: 'Product 2', totalUnitsSold: 8, totalRevenue: 80.00 }
      ];

      jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue(mockProducts);

      await getTopSellingProducts(req, mockRes);

      expect(OrderAnalytics.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $limit: 10 }
      ]));
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          count: 2,
          items: mockProducts
        }
      });
    });

    test('should respect custom limit within valid range', async () => {
      const req = { query: { limit: '5' } };
      jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue([]);

      await getTopSellingProducts(req, mockRes);

      expect(OrderAnalytics.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $limit: 5 }
      ]));
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          count: 0,
          items: []
        }
      });
    });

    test('should return 500 when aggregation error occurs', async () => {
      const req = { query: { limit: '10' } };
      jest.spyOn(OrderAnalytics, 'aggregate').mockRejectedValue(new Error('Aggregation failure'));

      await getTopSellingProducts(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to aggregate top selling products',
        details: 'Aggregation failure'
      });
    });
  });
});