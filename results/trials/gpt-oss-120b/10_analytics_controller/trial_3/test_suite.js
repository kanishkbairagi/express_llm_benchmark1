import { jest } from '@jest/globals';
import {
  getRevenueMetrics,
  getTopSellingProducts,
  OrderAnalytics
} from '../dataset/10_analytics_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getRevenueMetrics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns summary and timeSeries on valid request', async () => {
    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-03',
        groupBy: 'day'
      }
    };
    const res = mockRes();

    const aggregateResult = [
      { period: '2023-01-01', totalRevenue: 100, totalOrders: 2, avgOrderValue: 50 },
      { period: '2023-01-02', totalRevenue: 200, totalOrders: 4, avgOrderValue: 50 },
      { period: '2023-01-03', totalRevenue: 150, totalOrders: 3, avgOrderValue: 50 }
    ];
    jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue(aggregateResult);

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        summary: {
          totalRevenue: 450,
          totalOrders: 9,
          avgOrderValue: 50
        },
        timeSeries: aggregateResult
      }
    });
    expect(OrderAnalytics.aggregate).toHaveBeenCalledTimes(1);
  });

  test('fails when startDate or endDate missing', async () => {
    const req = { query: { startDate: '2023-01-01' } };
    const res = mockRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required'
    });
  });

  test('fails on invalid date format', async () => {
    const req = {
      query: { startDate: 'invalid', endDate: '2023-01-01' }
    };
    const res = mockRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
    });
  });

  test('fails when startDate is after endDate', async () => {
    const req = {
      query: { startDate: '2023-02-01', endDate: '2023-01-01' }
    };
    const res = mockRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'startDate cannot be later than endDate'
    });
  });

  test('fails on unsupported groupBy value', async () => {
    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-02',
        groupBy: 'week'
      }
    };
    const res = mockRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Invalid groupBy parameter. Allowed values: day, month, year'
    });
  });

  test('returns 500 on aggregation error', async () => {
    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-02'
      }
    };
    const res = mockRes();

    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockRejectedValue(new Error('DB failure'));

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to generate revenue analytics',
      details: 'DB failure'
    });
  });
});

describe('getTopSellingProducts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns top products with default limit', async () => {
    const req = { query: {} };
    const res = mockRes();

    const aggregateResult = [
      { productId: 'p1', productName: 'Product 1', totalUnitsSold: 10, totalRevenue: 100 },
      { productId: 'p2', productName: 'Product 2', totalUnitsSold: 5, totalRevenue: 50 }
    ];
    jest.spyOn(OrderAnalytics, 'aggregate').mockResolvedValue(aggregateResult);

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        count: 2,
        items: aggregateResult
      }
    });
    expect(OrderAnalytics.aggregate).toHaveBeenCalledTimes(1);
  });

  test('fails when limit is out of allowed range', async () => {
    const req = { query: { limit: '0' } };
    const res = mockRes();

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be a number between 1 and 50'
    });
  });

  test('fails when limit is not a number', async () => {
    const req = { query: { limit: 'abc' } };
    const res = mockRes();

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be a number between 1 and 50'
    });
  });

  test('returns 500 on aggregation error', async () => {
    const req = { query: { limit: '5' } };
    const res = mockRes();

    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockRejectedValue(new Error('Aggregation failure'));

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to aggregate top selling products',
      details: 'Aggregation failure'
    });
  });
});