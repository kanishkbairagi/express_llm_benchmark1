// 10_analytics_controller.js - MongoDB Aggregation Pipelines for Revenue

// Mock Database Aggregation Model
export const OrderAnalytics = {
  aggregate: async (pipeline) => []
};

export const getRevenueMetrics = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query || {};

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'startDate cannot be later than endDate'
      });
    }

    const allowedGroupings = ['day', 'month', 'year'];
    if (!allowedGroupings.includes(groupBy.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid groupBy parameter. Allowed values: ${allowedGroupings.join(', ')}`
      });
    }

    const dateFormatMap = {
      day: '%Y-%m-%d',
      month: '%Y-%m',
      year: '%Y'
    };

    const pipeline = [
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormatMap[groupBy.toLowerCase()],
              date: '$createdAt'
            }
          },
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$total' }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalOrders: 1,
          avgOrderValue: { $round: ['$avgOrderValue', 2] }
        }
      }
    ];

    const results = await OrderAnalytics.aggregate(pipeline);

    const overallTotal = results.reduce((acc, curr) => acc + (curr.totalRevenue || 0), 0);
    const overallOrders = results.reduce((acc, curr) => acc + (curr.totalOrders || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRevenue: parseFloat(overallTotal.toFixed(2)),
          totalOrders: overallOrders,
          avgOrderValue: overallOrders > 0 ? parseFloat((overallTotal / overallOrders).toFixed(2)) : 0
        },
        timeSeries: results
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to generate revenue analytics',
      details: error.message
    });
  }
};

export const getTopSellingProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query || {};
    const parsedLimit = parseInt(limit, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 50'
      });
    }

    const pipeline = [
      { $match: { status: 'completed' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          totalUnitsSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } }
        }
      },
      { $sort: { totalUnitsSold: -1 } },
      { $limit: parsedLimit },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          productName: 1,
          totalUnitsSold: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] }
        }
      }
    ];

    const topProducts = await OrderAnalytics.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      data: {
        count: topProducts.length,
        items: topProducts
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to aggregate top selling products',
      details: error.message
    });
  }
};
