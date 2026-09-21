import { jest } from '@jest/globals';
import { exportOrdersCsv, ExportDataService } from '../dataset/23_export_controller.js';

describe('exportOrdersCsv controller', () => {
  let req;
  let res;

  const buildRes = () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn(() => ({ json: jsonMock }));
    return { status: statusMock, json: jsonMock };
  };

  beforeEach(() => {
    req = { query: {} };
    res = buildRes();
    jest.clearAllMocks();
  });

  test('returns 400 when startDate or endDate are missing', async () => {
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 for invalid date format', async () => {
    req.query = { startDate: 'invalid', endDate: '2023-01-01' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Invalid date format') })
    );
  });

  test('returns 400 when startDate is later than endDate', async () => {
    req.query = { startDate: '2023-02-01', endDate: '2023-01-01' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('cannot be later') })
    );
  });

  test('returns 400 for invalid status filter', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31', status: 'unknown' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Invalid status filter') })
    );
  });

  test('returns 200 with empty CSV when no records found', async () => {
    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue([]);
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31' };
    await exportOrdersCsv(req, res);
    expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-31')
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.status().json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data.rowCount).toBe(0);
    expect(response.data.csvContent).toBe('');
  });

  test('returns 200 with proper CSV content for records', async () => {
    const records = [
      {
        id: 1,
        userId: 10,
        total: 123.4,
        status: 'paid',
        createdAt: '2023-01-15T12:00:00Z'
      },
      {
        id: 2,
        customerId: 20,
        total: 56,
        status: 'pending',
        createdAt: '2023-01-20T08:30:00Z'
      },
      {
        id: 3,
        userId: 30,
        total: 0,
        status: 'shipped',
        // value containing comma and quotes to test escaping
        createdAt: '2023-01-25T09:45:00Z',
        // additional fields to be ignored
      }
    ];
    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(records);
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31', status: 'PAID' };
    await exportOrdersCsv(req, res);
    expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-31'),
      status: 'paid'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.status().json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.rowCount).toBe(3);
    // Verify fileName contains dates
    expect(payload.data.fileName).toMatch(
      /^orders_export_2023-01-01_to_2023-01-31\.csv$/
    );
    // Verify CSV header line
    const lines = payload.data.csvContent.split('\r\n');
    expect(lines[0]).toBe('Order ID,Customer ID,Total Amount,Status,Date');
    // Verify first data line
    expect(lines[1]).toBe(
      '1,10,123.40,paid,2023-01-15T12:00:00.000Z'
    );
    // Verify second data line (uses customerId)
    expect(lines[2]).toBe(
      '2,20,56.00,pending,2023-01-20T08:30:00.000Z'
    );
    // Verify third line has escaped fields (total zero and status)
    expect(lines[3]).toBe(
      '3,30,0.00,shipped,2023-01-25T09:45:00.000Z'
    );
  });

  test('handles unexpected errors and returns 500', async () => {
    const error = new Error('DB failure');
    jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockRejectedValue(error);
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31' };
    await exportOrdersCsv(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.status().json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Failed to generate CSV export');
    expect(payload.details).toBe('DB failure');
  });
});