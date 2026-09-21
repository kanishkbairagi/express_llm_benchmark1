// 23_export_controller.js - CSV Data Export Stream

// Mock Database Model
export const ExportDataService = {
  fetchOrdersForExport: async (filters) => []
};

const escapeCsvField = (field) => {
  if (field === null || field === undefined) return '';
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
};

export const exportOrdersCsv = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query || {};

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
        error: 'Invalid date format. Expected ISO-8601 string'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'startDate cannot be later than endDate'
      });
    }

    const filters = {
      startDate: start,
      endDate: end
    };

    if (status) {
      const allowedStatuses = ['pending', 'paid', 'shipped', 'cancelled'];
      if (!allowedStatuses.includes(status.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: `Invalid status filter. Allowed values: ${allowedStatuses.join(', ')}`
        });
      }
      filters.status = status.toLowerCase();
    }

    const records = await ExportDataService.fetchOrdersForExport(filters);

    if (records.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No records found for the specified period',
        data: {
          rowCount: 0,
          csvContent: '',
          exportedAt: new Date().toISOString()
        }
      });
    }

    const headers = ['Order ID', 'Customer ID', 'Total Amount', 'Status', 'Date'];
    const rows = records.map((order) => [
      escapeCsvField(order.id),
      escapeCsvField(order.userId || order.customerId),
      escapeCsvField(order.total ? order.total.toFixed(2) : '0.00'),
      escapeCsvField(order.status),
      escapeCsvField(new Date(order.createdAt).toISOString())
    ]);

    const csvLines = [headers.join(','), ...rows.map((r) => r.join(','))];
    const csvContent = csvLines.join('\r\n');
    const fileName = `orders_export_${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.csv`;

    return res.status(200).json({
      success: true,
      message: 'Export generated successfully',
      data: {
        fileName,
        mimeType: 'text/csv',
        rowCount: records.length,
        csvContent,
        exportedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to generate CSV export',
      details: error.message
    });
  }
};
