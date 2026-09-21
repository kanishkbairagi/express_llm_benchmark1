import { jest } from '@jest/globals';
import { exportOrdersCsv, ExportDataService } from '../dataset/23_export_controller.js';

describe('exportOrdersCsv controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      query: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('Validation', () => {
    test('should return 400 if req.query is missing or missing dates', async () => {
      req = {}; // no query property
      await exportOrdersCsv(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
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

    test('should return 400 if date formats are invalid', async () => {
      req.query = { startDate: 'invalid-date', endDate: '2023-01-31' };
      await exportOrdersCsv(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Expected ISO-8601 string'
      });
    });

    test('should return 400 if startDate is after endDate', async () => {
      req.query = { startDate: '2023-02-01', endDate: '2023-01-01' };
      await exportOrdersCsv(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'startDate cannot be later than endDate'
      });
    });

    test('should return 400 if status filter is invalid', async () => {
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        status: 'invalid_status'
      };
      await exportOrdersCsv(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid status filter. Allowed values: pending, paid, shipped, cancelled'
      });
    });
  });

  describe('Data Retrieval and CSV Generation', () => {
    test('should return 200 with empty payload when no records found', async () => {
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        status: 'PENDING'
      };

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
        data: expect.objectContaining({
          rowCount: 0,
          csvContent: '',
          exportedAt: expect.any(String)
        })
      });
    });

    test('should return 200 with CSV payload when records exist', async () => {
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-31'
      };

      const mockRecords = [
        {
          id: 'ord_1',
          userId: 'usr_1',
          total: 99.5,
          status: 'paid',
          createdAt: '2023-01-15T10:00:00.000Z'
        },
        {
          id: 'ord_2',
          customerId: 'cust_2',
          total: null,
          status: 'shipped',
          createdAt: '2023-01-16T12:00:00.000Z'
        }
      ];

      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(mockRecords);

      await exportOrdersCsv(req, res);

      const expectedFileName = 'orders_export_2023-01-01_to_2023-01-31.csv';
      const expectedHeader = 'Order ID,Customer ID,Total Amount,Status,Date';
      const expectedRow1 = 'ord_1,usr_1,99.50,paid,2023-01-15T10:00:00.000Z';
      const expectedRow2 = 'ord_2,cust_2,0.00,shipped,2023-01-16T12:00:00.000Z';
      const expectedCsvContent = `${expectedHeader}\r\n${expectedRow1}\r\n${expectedRow2}`;

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Export generated successfully',
        data: {
          fileName: expectedFileName,
          mimeType: 'text/csv',
          rowCount: 2,
          csvContent: expectedCsvContent,
          exportedAt: expect.any(String)
        }
      });
    });

    test('should escape CSV fields containing commas, quotes, and newlines', async () => {
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-31'
      };

      const mockRecords = [
        {
          id: 'ord,"1"',
          userId: 'usr,1',
          total: 100,
          status: 'line1\nline2',
          createdAt: '2023-01-15T10:00:00.000Z'
        },
        {
          id: null,
          userId: undefined,
          total: 0,
          status: 'paid',
          createdAt: '2023-01-16T10:00:00.000Z'
        }
      ];

      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(mockRecords);

      await exportOrdersCsv(req, res);

      const expectedHeader = 'Order ID,Customer ID,Total Amount,Status,Date';
      const expectedRow1 = '"ord,""1"""\r\n"usr,1"\r\n100.00\r\n"line1\nline2"\r\n2023-01-15T10:00:00.000Z';
      const expectedRow2 = '\r\n\r\n0.00\r\npaid\r\n2023-01-16T10:00:00.000Z';

      const jsonResponse = res.json.mock.calls[0][0];
      expect(jsonResponse.data.csvContent).toContain('"ord,""1"""');
      expect(jsonResponse.data.csvContent).toContain('"usr,1"');
      expect(jsonResponse.data.csvContent).toContain('"line1\nline2"');
    });
  });

  describe('Error Handling', () => {
    test('should return 500 when ExportDataService throws an error', async () => {
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-31'
      };

      const dbError = new Error('Database connection failed');
      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockRejectedValue(dbError);

      await exportOrdersCsv(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate CSV export',
        details: 'Database connection failed'
      });
    });
  });
});