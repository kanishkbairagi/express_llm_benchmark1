import { jest } from '@jest/globals';
import { exportOrdersCsv, ExportDataService } from '../dataset/23_export_controller.js';

describe('exportOrdersCsv controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 400 when startDate or endDate is missing', async () => {
    const req = { query: { startDate: '2023-01-01' } };
    const res = mockRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Both startDate and endDate query parameters are required',
      })
    );
  });

  test('returns 400 for invalid date format', async () => {
    const req = { query: { startDate: 'invalid', endDate: '2023-01-31' } };
    const res = mockRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid date format. Expected ISO-8601 string',
      })
    );
  });

  test('returns 400 when startDate is after endDate', async () => {
    const req = {
      query: { startDate: '2023-02-01', endDate: '2023-01-31' },
    };
    const res = mockRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'startDate cannot be later than endDate',
      })
    );
  });

  test('returns 400 for unsupported status filter', async () => {
    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        status: 'unknown',
      },
    };
    const res = mockRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid status filter'),
      })
    );
  });

  test('returns 200 with empty CSV when no records found', async () => {
    jest
      .spyOn(ExportDataService, 'fetchOrdersForExport')
      .mockResolvedValue([]);

    const req = {
      query: { startDate: '2023-01-01', endDate: '2023-01-31' },
    };
    const res = mockRes();

    await exportOrdersCsv(req, res);

    expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-31'),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.rowCount).toBe(0);
    expect(jsonArg.data.csvContent).toBe('');
  });

  test('returns 200 with correctly formatted CSV and file name', async () => {
    const records = [
      {
        id: 101,
        userId: 'C001',
        total: 250.5,
        status: 'paid',
        createdAt: '2023-01-15T12:34:56Z',
      },
      {
        id: 102,
        customerId: 'C,002', // contains comma to test escaping
        total: 99.99,
        status: 'shipped',
        createdAt: '2023-01-20T08:00:00Z',
      },
      {
        id: 103,
        userId: 'C"003', // contains quote to test escaping
        total: 0,
        status: 'pending',
        createdAt: '2023-01-25T00:00:00Z',
      },
    ];

    jest
      .spyOn(ExportDataService, 'fetchOrdersForExport')
      .mockResolvedValue(records);

    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        status: 'paid',
      },
    };
    const res = mockRes();

    await exportOrdersCsv(req, res);

    // Verify service call with normalized status
    expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-31'),
      status: 'paid',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.rowCount).toBe(3);
    expect(payload.data.mimeType).toBe('text/csv');

    // File name format
    expect(payload.data.fileName).toMatch(
      /^orders_export_2023-01-01_to_2023-01-31\.csv$/
    );

    // CSV content checks
    const lines = payload.data.csvContent.split('\r\n');
    // Header line
    expect(lines[0]).toBe('Order ID,Customer ID,Total Amount,Status,Date');

    // Record lines
    expect(lines[1]).toBe(
      '101,C001,250.50,paid,2023-01-15T12:34:56.000Z'
    );
    // Customer ID with comma should be quoted and escaped
    expect(lines[2]).toBe(
      '102,"C,002",99.99,shipped,2023-01-20T08:00:00.000Z'
    );
    // Customer ID with quote should be escaped double quotes
    expect(lines[3]).toBe(
      '103,"C""003",0.00,pending,2023-01-25T00:00:00.000Z'
    );
  });

  test('handles service error and returns 500', async () => {
    jest
      .spyOn(ExportDataService, 'fetchOrdersForExport')
      .mockRejectedValue(new Error('Database failure'));

    const req = {
      query: { startDate: '2023-01-01', endDate: '2023-01-31' },
    };
    const res = mockRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.error).toBe('Failed to generate CSV export');
    expect(jsonArg.details).toBe('Database failure');
  });
});