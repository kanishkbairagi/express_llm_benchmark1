import { jest } from '@jest/globals';
import * as controller from '../dataset/10_analytics_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getRevenueMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    controller.OrderAnalytics.aggregate = jest.fn();
  });

  test('returns 400 when startDate or endDate missing', async () => {
    const req = { query: { startDate: '2023-01-01' } };
    const res = mockRes();

    await controller.getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 for invalid date format', async () => {
    const req = { query: { startDate: 'invalid', endDate: '2023-01-31' } };
    const res = mockRes();

    await controller.getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 when startDate is later than endDate', async () => {
    const req = {
      query: { startDate: '2023-02-01', endDate: '2023-01-01' }
    };
    const res = mockRes();

    await controller.getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 for unsupported groupBy value', async () => {
    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        groupBy: 'hour'
      }
    };
    const res = mockRes();

    await controller.getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns correct summary and timeSeries on success', async () => {
    const mockData = [
      { period: '2023-01-01', totalRevenue: 150.5, totalOrders: 3, avgOrderValue: 50.17 },
      { period: '2023-01-02', totalRevenue: 200, totalOrders: 4, avgOrderValue: 50 }
    ];
    controller.OrderAnalytics.aggregate.mockResolvedValue(mockData);

    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-02',
        groupBy: 'day'
      }
    };
    const res = mockRes();

    await controller.getRevenueMetrics(req, res);

    expect(controller.OrderAnalytics.aggregate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload.success).toBe(true);
    expect(jsonPayload.data.summary).toEqual({
      totalRevenue: 350.5,
      totalOrders: 7,
      avgOrderValue: 50.07
    });
    expect(jsonPayload.data.timeSeries).toEqual(mockData);
  });

  test('handles unexpected errors with 500', async () => {
    controller.OrderAnalytics.aggregate.mockRejectedValue(new Error('DB failure'));

    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-02'
      }
    };
    const res = mockRes();

    await controller.getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) })
    );
  });
});

describe('getTopSellingProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    controller.OrderAnalytics.aggregate = jest.fn();
  });

  test('returns 400 when limit is not a number', async () => {
    const req = { query: { limit: 'abc' } };
    const res = mockRes();

    await controller.getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 when limit is out of allowed range', async () => {
    const req = { query: { limit: '0' } };
    const res = mockRes();

    await controller.getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns top products correctly on success', async () => {
    const mockTop = [
      {
        productId: 'p1',
        productName: 'Product 1',
        totalUnitsSold: 100,
        totalRevenue: 5000
      },
      {
        productId: 'p2',
        productName: 'Product 2',
        totalUnitsSold: 80,
        totalRevenue: 3200
      }
    ];
    controller.OrderAnalytics.aggregate.mockResolvedValue(mockTop);

    const req = { query: { limit: '2' } };
    const res = mockRes();

    await controller.getTopSellingProducts(req, res);

    expect(controller.OrderAnalytics.aggregate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.count).toBe(2);
    expect(payload.data.items).toEqual(mockTop);
  });

  test('handles aggregation errors with 500', async () => {
    controller.OrderAnalytics.aggregate.mockRejectedValue(new Error('Aggregation error'));

    const req = { query: {} };
    const res = mockRes();

    await controller.getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) })
    );
  });
});