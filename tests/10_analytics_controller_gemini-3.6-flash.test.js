import { jest } from '@jest/globals';
import { OrderAnalytics, getRevenueMetrics, getTopSellingProducts } from '../dataset/10_analytics_controller.js';

describe('10_analytics_controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('OrderAnalytics.aggregate default behavior', () => {
    it('should return an empty array by default', async () => {
      const result = await OrderAnalytics.aggregate([]);
      expect(result).toEqual([]);
    });
  });

  describe('getRevenueMetrics', () => {
    it('should return 400 if startDate is missing', async () => {
      req.query = { endDate: '2023-12-31' };

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    });

    it('should return 400 if endDate is missing', async () => {
      req.query = { startDate: '2023-01-01' };

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    });

    it('should return 400 if req.query is undefined', async () => {
      req = {};

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    });

    it('should return 400 for invalid date format in startDate', async () => {
      req.query = { startDate: 'invalid-date', endDate: '2023-12-31' };

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
      });
    });

    it('should return 400 for invalid date format in endDate', async () => {
      req.query = { startDate: '2023-01-01', endDate: 'not-a-date' };

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
      });
    });

    it('should return 400 if startDate is after endDate', async () => {
      req.query = { startDate: '2023-12-31', endDate: '2023-01-01' };

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'startDate cannot be later than endDate'
      });
    });

    it('should return 400 for invalid groupBy parameter', async () => {
      req.query = { startDate: '2023-01-01', endDate: '2023-01-31', groupBy: 'weekly' };

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid groupBy parameter. Allowed values: day, month, year'
      });
    });

    it('should calculate summary correctly when aggregate returns data', async () => {
      req.query = { startDate: '2023-01-01', endDate: '2023-01-02', groupBy: 'day' };

      const mockAggregationResult = [
        { period: '2023-01-01', totalRevenue: 100.5, totalOrders: 2, avgOrderValue: 50.25 },
        { period: '2023-01-02', totalRevenue: 200.25, totalOrders: 3, avgOrderValue: 66.75 }
      ];

      jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue(mockAggregationResult);

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          summary: {
            totalRevenue: 300.75,
            totalOrders: 5,
            avgOrderValue: 60.15
          },
          timeSeries: mockAggregationResult
        }
      });
    });

    it('should handles zero orders summary correctly when aggregate returns empty array', async () => {
      req.query = { startDate: '2023-01-01', endDate: '2023-01-02', groupBy: 'month' };

      jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue([]);

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
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

    it('should format pipeline with year groupBy correctly', async () => {
      req.query = { startDate: '2020-01-01', endDate: '2023-01-01', groupBy: 'YEAR' };

      const aggregateSpy = jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue([]);

      await getRevenueMetrics(req, res);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $group: expect.objectContaining({
              _id: {
                $dateToString: {
                  format: '%Y',
                  date: '$createdAt'
                }
              }
            })
          })
        ])
      );
    });

    it('should return 500 when aggregation throws an error', async () => {
      req.query = { startDate: '2023-01-01', endDate: '2023-01-31' };

      jest.spyOn(OrderAnalytics, 'aggregate').mockRejectedValue(new Error('Database error'));

      await getRevenueMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate revenue analytics',
        details: 'Database error'
      });
    });
  });

  describe('getTopSellingProducts', () => {
    it('should use default limit of 10 if not specified', async () => {
      const mockTopProducts = [{ productId: 'p1', productName: 'Product 1', totalUnitsSold: 10, totalRevenue: 100 }];
      const aggregateSpy = jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue(mockTopProducts);

      await getTopSellingProducts(req, res);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $limit: 10 }
        ])
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          count: 1,
          items: mockTopProducts
        }
      });
    });

    it('should handle custom valid limit', async () => {
      req.query = { limit: '5' };
      const aggregateSpy = jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue([]);

      await getTopSellingProducts(req, res);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $limit: 5 }
        ])
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 if limit is not a number', async () => {
      req.query = { limit: 'abc' };

      await getTopSellingProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be a number between 1 and 50'
      });
    });

    it('should return 400 if limit is less than 1', async () => {
      req.query = { limit: '0' };

      await getTopSellingProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be a number between 1 and 50'
      });
    });

    it('should return 400 if limit is greater than 50', async () => {
      req.query = { limit: '51' };

      await getTopSellingProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be a number between 1 and 50'
      });
    });

    it('should return 500 when aggregate throws an error', async () => {
      jest.spyOn(OrderAnalytics, 'aggregate').mockRejectedValue(new Error('Aggregation failed'));

      await getTopSellingProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to aggregate top selling products',
        details: 'Aggregation failed'
      });
    });
  });
});