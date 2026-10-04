import { jest } from '@jest/globals';
import { ExportDataService, exportOrdersCsv } from '../dataset/23_export_controller.js';

describe('exportOrdersCsv controller', () => {
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

  test('should return 400 if startDate is missing', async () => {
    req.query = { endDate: '2023-01-31' };

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required'
    });
  });

  test('should return 400 if endDate is missing', async () => {
    req.query = { startDate: '2023-01-01' };

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required'
    });
  });

  test('should return 400 if req.query is undefined', async () => {
    req.query = undefined;

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required'
    });
  });

  test('should return 400 if startDate or endDate is an invalid date string', async () => {
    req.query = { startDate: 'invalid-date', endDate: '2023-01-31' };

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid date format. Expected ISO-8601 string'
    });
  });

  test('should return 400 if startDate is later than endDate', async () => {
    req.query = { startDate: '2023-02-01', endDate: '2023-01-01' };

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'startDate cannot be later than endDate'
    });
  });

  test('should return 400 if status is invalid', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31', status: 'unknown_status' };

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid status filter. Allowed values: pending, paid, shipped, cancelled'
    });
  });

  test('should return 200 with empty dataset response when no records found', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31', status: 'PENDING' };
    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue([]);

    await exportOrdersCsv(req, res);

    expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-31'),
      status: 'pending'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'No records found for the specified period',
      data: {
        rowCount: 0,
        csvContent: '',
        exportedAt: expect.any(String)
      }
    });
  });

  test('should return 200 with formatted CSV content when records exist', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31' };
    const mockRecords = [
      {
        id: 'ord-123',
        userId: 'usr-456',
        total: 99.5,
        status: 'paid',
        createdAt: '2023-01-15T10:00:00.000Z'
      },
      {
        id: 'ord-124',
        customerId: 'cust-789',
        total: 0,
        status: 'shipped',
        createdAt: '2023-01-16T12:00:00.000Z'
      }
    ];

    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(mockRecords);

    await exportOrdersCsv(req, res);

    const expectedCsv = [
      'Order ID,Customer ID,Total Amount,Status,Date',
      'ord-123,usr-456,99.50,paid,2023-01-15T10:00:00.000Z',
      'ord-124,cust-789,0.00,shipped,2023-01-16T12:00:00.000Z'
    ].join('\r\n');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Export generated successfully',
      data: {
        fileName: 'orders_export_2023-01-01_to_2023-01-31.csv',
        mimeType: 'text/csv',
        rowCount: 2,
        csvContent: expectedCsv,
        exportedAt: expect.any(String)
      }
    });
  });

  test('should correctly escape fields with commas, quotes, or newlines in CSV', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31' };
    const mockRecords = [
      {
        id: 'ord,100',
        userId: 'user "special" name',
        total: 15.00,
        status: 'pending\nstatus',
        createdAt: '2023-01-10T08:00:00.000Z'
      }
    ];

    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(mockRecords);

    await exportOrdersCsv(req, res);

    const expectedCsv = [
      'Order ID,Customer ID,Total Amount,Status,Date',
      '"ord,100","user ""special"" name",15.00,"pending\nstatus",2023-01-10T08:00:00.000Z'
    ].join('\r\n');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          csvContent: expectedCsv
        })
      })
    );
  });

  test('should return 500 when ExportDataService throws an exception', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31' };
    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockRejectedValue(new Error('Database error'));

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to generate CSV export',
      details: 'Database error'
    });
  });
});