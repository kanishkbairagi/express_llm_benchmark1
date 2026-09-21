import { jest } from '@jest/globals';
import {
  getRevenueMetrics,
  getTopSellingProducts,
  OrderAnalytics
} from '../dataset/10_analytics_controller.js';

describe('getRevenueMetrics', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when startDate or endDate are missing', async () => {
    const req = { query: { startDate: '2023-01-01' } };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required'
    });
  });

  test('returns 400 for invalid date format', async () => {
    const req = { query: { startDate: 'invalid', endDate: '2023-01-02' } };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
    });
  });

  test('returns 400 when startDate is later than endDate', async () => {
    const req = {
      query: { startDate: '2023-02-01', endDate: '2023-01-01' }
    };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'startDate cannot be later than endDate'
    });
  });

  test('returns 400 for unsupported groupBy value', async () => {
    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        groupBy: 'hour'
      }
    };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Invalid groupBy parameter. Allowed values: day, month, year'
    });
  });

  test('returns 200 with correct summary and timeSeries data', async () => {
    const mockAggResult = [
      {
        period: '2023-01-01',
        totalRevenue: 150.0,
        totalOrders: 3,
        avgOrderValue: 50.0
      },
      {
        period: '2023-01-02',
        totalRevenue: 200.0,
        totalOrders: 4,
        avgOrderValue: 50.0
      }
    ];
    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockResolvedValue(mockAggResult);

    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-02',
        groupBy: 'day'
      }
    };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    expect(OrderAnalytics.aggregate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload.success).toBe(true);
    expect(jsonPayload.data.summary).toEqual({
      totalRevenue: 350.0,
      totalOrders: 7,
      avgOrderValue: 50.0
    });
    expect(jsonPayload.data.timeSeries).toEqual(mockAggResult);
  });

  test('handles internal error and returns 500', async () => {
    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockRejectedValue(new Error('DB failure'));

    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-02'
      }
    };
    const res = makeRes();

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
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when limit is invalid (non‑numeric)', async () => {
    const req = { query: { limit: 'abc' } };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be a number between 1 and 50'
    });
  });

  test('returns 400 when limit is out of allowed range', async () => {
    const req = { query: { limit: '0' } };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be a number between 1 and 50'
    });
  });

  test('returns 200 with correct count and items', async () => {
    const mockProducts = [
      {
        productId: 'p1',
        productName: 'Product 1',
        totalUnitsSold: 100,
        totalRevenue: 1000.0
      },
      {
        productId: 'p2',
        productName: 'Product 2',
        totalUnitsSold: 80,
        totalRevenue: 800.0
      }
    ];
    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockResolvedValue(mockProducts);

    const req = { query: { limit: '2' } };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    expect(OrderAnalytics.aggregate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.count).toBe(2);
    expect(payload.data.items).toEqual(mockProducts);
  });

  test('uses default limit when none supplied', async () => {
    const mockProducts = Array.from({ length: 10 }, (_, i) => ({
      productId: `p${i}`,
      productName: `Product ${i}`,
      totalUnitsSold: 10 - i,
      totalRevenue: (10 - i) * 100
    }));
    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockResolvedValue(mockProducts);

    const req = { query: {} };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    expect(OrderAnalytics.aggregate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.count).toBe(10);
    expect(payload.data.items).toEqual(mockProducts);
  });

  test('handles aggregation error and returns 500', async () => {
    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockRejectedValue(new Error('Aggregation error'));

    const req = { query: { limit: '5' } };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to aggregate top selling products',
      details: 'Aggregation error'
    });
  });
});