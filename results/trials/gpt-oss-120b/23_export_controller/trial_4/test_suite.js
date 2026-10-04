import { jest } from '@jest/globals';
import { exportOrdersCsv, ExportDataService } from '../dataset/23_export_controller.js';

describe('exportOrdersCsv controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  test('returns 400 when startDate or endDate is missing', async () => {
    req.query = { startDate: '2023-01-01' }; // missing endDate
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required'
    });
  });

  test('returns 400 for invalid date format', async () => {
    req.query = { startDate: 'invalid', endDate: '2023-01-10' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid date format. Expected ISO-8601 string'
    });
  });

  test('returns 400 when startDate is later than endDate', async () => {
    req.query = { startDate: '2023-02-01', endDate: '2023-01-01' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'startDate cannot be later than endDate'
    });
  });

  test('returns 400 for unsupported status filter', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-10', status: 'unknown' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Invalid status filter. Allowed values: pending, paid, shipped, cancelled'
    });
  });

  test('returns 200 with empty CSV when no records are found', async () => {
    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValueOnce([]);
    req.query = { startDate: '2023-01-01', endDate: '2023-01-10' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.rowCount).toBe(0);
    expect(jsonArg.data.csvContent).toBe('');
    expect(jsonArg.message).toBe('No records found for the specified period');
  });

  test('returns 200 with correctly formatted CSV when records exist', async () => {
    const mockRecords = [
      {
        id: 1,
        userId: 101,
        total: 99.5,
        status: 'paid',
        createdAt: '2023-01-05T12:00:00Z'
      },
      {
        id: 2,
        customerId: 202,
        total: 150,
        status: 'shipped',
        createdAt: '2023-01-07T15:30:00Z'
      },
      {
        id: 3,
        userId: 303,
        total: 0,
        status: 'pending',
        createdAt: '2023-01-09T09:45:00Z',
        // field containing commas and quotes to test escaping
        extra: 'value,with,"quotes"'
      }
    ];
    // Ensure the third record includes a field that will be escaped via escapeCsvField
    // The controller only uses specific fields, so we modify one of those to contain special chars
    mockRecords[2].status = 'pending, "needs" escaping';

    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValueOnce(mockRecords);
    req.query = {
      startDate: '2023-01-01',
      endDate: '2023-01-10',
      status: 'PAID' // should be normalized to lower case
    };

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.message).toBe('Export generated successfully');
    expect(payload.data.rowCount).toBe(mockRecords.length);
    expect(payload.data.mimeType).toBe('text/csv');

    // Verify fileName format
    expect(payload.data.fileName).toMatch(
      /^orders_export_2023-01-01_to_2023-01-10\.csv$/
    );

    // Verify CSV header and rows
    const lines = payload.data.csvContent.split('\r\n');
    const header = lines[0];
    expect(header).toBe('Order ID,Customer ID,Total Amount,Status,Date');

    // Row 1
    const row1 = lines[1].split(',');
    expect(row1[0]).toBe('1');
    expect(row1[1]).toBe('101');
    expect(row1[2]).toBe('99.50');
    expect(row1[3]).toBe('paid');
    expect(row1[4]).toBe('2023-01-05T12:00:00.000Z');

    // Row 2 (customerId field)
    const row2 = lines[2].split(',');
    expect(row2[0]).toBe('2');
    expect(row2[1]).toBe('202'); // customerId
    expect(row2[2]).toBe('150.00');
    expect(row2[3]).toBe('shipped');
    expect(row2[4]).toBe('2023-01-07T15:30:00.000Z');

    // Row 3 with escaped status containing commas and quotes
    const row3 = lines[3];
    // status field should be escaped: "pending, ""needs"" escaping"
    const expectedEscapedStatus = '"pending, ""needs"" escaping"';
    expect(row3).toContain(`3,303,0.00,${expectedEscapedStatus},2023-01-09T09:45:00.000Z`);
  });

  test('handles unexpected errors and returns 500', async () => {
    const errorMsg = 'Database connection failed';
    jest
      .spyOn(ExportDataService, 'fetchOrdersForExport')
      .mockRejectedValueOnce(new Error(errorMsg));

    req.query = { startDate: '2023-01-01', endDate: '2023-01-10' };
    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to generate CSV export',
      details: errorMsg
    });
  });
});