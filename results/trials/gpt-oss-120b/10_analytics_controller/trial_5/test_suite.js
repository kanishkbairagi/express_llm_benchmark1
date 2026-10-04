import { jest } from '@jest/globals';
import {
  getRevenueMetrics,
  getTopSellingProducts,
  OrderAnalytics
} from '../dataset/10_analytics_controller.js';

describe('Analytics Controller - getRevenueMetrics', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should return 400 when startDate or endDate is missing', async () => {
    const req = { query: { startDate: '2023-01-01' } };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required'
    });
  });

  test('should return 400 for invalid date format', async () => {
    const req = { query: { startDate: 'invalid', endDate: '2023-01-02' } };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
    });
  });

  test('should return 400 when startDate is later than endDate', async () => {
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

  test('should return 400 for unsupported groupBy value', async () => {
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

  test('should return 200 with correct summary and timeSeries', async () => {
    const mockResults = [
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
      .mockResolvedValue(mockResults);

    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-02',
        groupBy: 'day'
      }
    };
    const res = makeRes();

    await getRevenueMetrics(req, res);

    // Verify aggregate was called with a pipeline containing the correct $dateToString format
    const calledPipeline = OrderAnalytics.aggregate.mock.calls[0][0];
    const groupStage = calledPipeline.find((s) => s.$group);
    const dateFormat = groupStage.$group._id.$dateToString.format;
    expect(dateFormat).toBe('%Y-%m-%d');

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        summary: {
          totalRevenue: 350.0,
          totalOrders: 7,
          avgOrderValue: 50.0
        },
        timeSeries: mockResults
      }
    });
  });
});

describe('Analytics Controller - getTopSellingProducts', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should return 400 when limit is not a number', async () => {
    const req = { query: { limit: 'abc' } };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be a number between 1 and 50'
    });
  });

  test('should return 400 when limit is out of allowed range', async () => {
    const req = { query: { limit: '0' } };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be a number between 1 and 50'
    });
  });

  test('should return 200 with top selling products data', async () => {
    const mockTopProducts = [
      {
        productId: 'p1',
        productName: 'Product One',
        totalUnitsSold: 100,
        totalRevenue: 2500.0
      },
      {
        productId: 'p2',
        productName: 'Product Two',
        totalUnitsSold: 80,
        totalRevenue: 2000.0
      }
    ];

    jest
      .spyOn(OrderAnalytics, 'aggregate')
      .mockResolvedValue(mockTopProducts);

    const req = { query: { limit: '2' } };
    const res = makeRes();

    await getTopSellingProducts(req, res);

    // Verify aggregate called with correct $limit stage
    const calledPipeline = OrderAnalytics.aggregate.mock.calls[0][0];
    const limitStage = calledPipeline.find((s) => s.$limit);
    expect(limitStage.$limit).toBe(2);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        count: 2,
        items: mockTopProducts
      }
    });
  });
});