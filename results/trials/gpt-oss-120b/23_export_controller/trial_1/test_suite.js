import { jest } from '@jest/globals';
import { exportOrdersCsv, ExportDataService } from '../dataset/23_export_controller.js';

describe('exportOrdersCsv controller', () => {
  const makeRes = () => {
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
    const res = makeRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Both startDate and endDate query parameters are required',
    });
  });

  test('returns 400 for invalid date format', async () => {
    const req = { query: { startDate: 'invalid', endDate: '2023-01-31' } };
    const res = makeRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid date format. Expected ISO-8601 string',
    });
  });

  test('returns 400 when startDate is later than endDate', async () => {
    const req = {
      query: { startDate: '2023-02-01', endDate: '2023-01-01' },
    };
    const res = makeRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'startDate cannot be later than endDate',
    });
  });

  test('returns 400 for invalid status filter', async () => {
    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        status: 'unknown',
      },
    };
    const res = makeRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Invalid status filter. Allowed values: pending, paid, shipped, cancelled',
    });
  });

  test('returns success with empty CSV when no records are found', async () => {
    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue([]);

    const req = {
      query: { startDate: '2023-01-01', endDate: '2023-01-31' },
    };
    const res = makeRes();

    const before = new Date().toISOString();

    await exportOrdersCsv(req, res);

    expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-31'),
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.message).toBe('No records found for the specified period');
    expect(jsonArg.data.rowCount).toBe(0);
    expect(jsonArg.data.csvContent).toBe('');
    // exportedAt should be a valid ISO string after the request started
    expect(new Date(jsonArg.data.exportedAt).toISOString()).toBeGreaterThanOrEqual(
      before
    );
  });

  test('generates correct CSV content with proper escaping', async () => {
    const mockRecords = [
      {
        id: 1,
        userId: 101,
        total: 123.456,
        status: 'paid',
        createdAt: '2023-01-15T12:34:56Z',
      },
      {
        id: 2,
        customerId: 202,
        total: 78,
        status: 'shipped',
        // field with commas, quotes and newline to test escaping
        createdAt: '2023-01-20T09:00:00Z',
        // Adding a problematic field via total (string with commas)
        total: 45.6,
      },
      {
        id: 3,
        userId: 303,
        total: null,
        status: 'pending',
        createdAt: '2023-01-25T18:20:30Z',
        // Simulate a field that will need escaping
        notes: 'Item "A", size: L\nSpecial instruction',
      },
    ];

    // Adjust records to include a field that triggers escaping in the CSV generation path
    // The controller only uses id, userId/customerId, total, status, createdAt.
    // We'll embed a comma/quote in the status of record 3 to test escaping.
    mockRecords[2].status = 'pending, "review"';

    jest
      .spyOn(ExportDataService, 'fetchOrdersForExport')
      .mockResolvedValue(mockRecords);

    const req = {
      query: {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        status: 'paid',
      },
    };
    const res = makeRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.rowCount).toBe(mockRecords.length);
    expect(payload.data.mimeType).toBe('text/csv');

    // Verify fileName format
    expect(payload.data.fileName).toMatch(
      /^orders_export_2023-01-01_to_2023-01-31\.csv$/
    );

    // Validate CSV header line
    const lines = payload.data.csvContent.split('\r\n');
    expect(lines[0]).toBe('Order ID,Customer ID,Total Amount,Status,Date');

    // Validate first data line (no escaping needed)
    const firstLine = lines[1].split(',');
    expect(firstLine[0]).toBe('1'); // id
    expect(firstLine[1]).toBe('101'); // userId
    expect(firstLine[2]).toBe('123.46'); // total rounded to two decimals
    expect(firstLine[3]).toBe('paid');
    expect(firstLine[4]).toBe('2023-01-15T12:34:56.000Z');

    // Validate third line where status contains comma and quotes (needs escaping)
    const thirdLine = lines[3];
    // The whole line should contain the escaped status field
    expect(thirdLine).toContain(
      `"pending, ""review"""` // CSV escaped version of status
    );
    // Ensure other fields are correctly placed
    const thirdCols = thirdLine.split(',');
    expect(thirdCols[0]).toBe('3'); // id
    expect(thirdCols[1]).toBe('303'); // userId
    expect(thirdCols[2]).toBe('0.00'); // total null => 0.00
  });

  test('handles unexpected service error with 500 response', async () => {
    jest
      .spyOn(ExportDataService, 'fetchOrdersForExport')
      .mockRejectedValue(new Error('Database failure'));

    const req = {
      query: { startDate: '2023-01-01', endDate: '2023-01-31' },
    };
    const res = makeRes();

    await exportOrdersCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to generate CSV export',
      details: 'Database failure',
    });
  });
});