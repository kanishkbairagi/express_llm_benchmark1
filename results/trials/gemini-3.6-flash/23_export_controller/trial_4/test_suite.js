import { jest } from '@jest/globals';
import { exportOrdersCsv, ExportDataService } from '../dataset/23_export_controller.js';

describe('23_export_controller - exportOrdersCsv', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.restoreAllMocks();
  });

  describe('Validation Checks', () => {
    test('should return 400 if req.query is missing or missing startDate/endDate', async () => {
      mockReq.query = { startDate: '2023-01-01' };

      await exportOrdersCsv(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    });

    test('should return 400 if endDate is missing', async () => {
      mockReq.query = { startDate: '2023-01-01' };

      await exportOrdersCsv(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if startDate or endDate are invalid date strings', async () => {
      mockReq.query = { startDate: 'invalid-date', endDate: '2023-01-10' };

      await exportOrdersCsv(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Expected ISO-8601 string'
      });
    });

    test('should return 400 if startDate is after endDate', async () => {
      mockReq.query = { startDate: '2023-01-10', endDate: '2023-01-01' };

      await exportOrdersCsv(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'startDate cannot be later than endDate'
      });
    });

    test('should return 400 if an invalid status is provided', async () => {
      mockReq.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-10',
        status: 'invalid_status'
      };

      await exportOrdersCsv(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid status filter. Allowed values: pending, paid, shipped, cancelled'
      });
    });
  });

  describe('Successful Export Logic', () => {
    test('should return 200 with empty CSV content when no records match', async () => {
      mockReq.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-10',
        status: 'paid'
      };

      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue([]);

      await exportOrdersCsv(mockReq, mockRes);

      expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-10'),
        status: 'paid'
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'No records found for the specified period',
        data: {
          rowCount: 0,
          csvContent: '',
          exportedAt: expect.any(String)
        }
      });
    });

    test('should generate CSV correctly for valid records including formatting and escapes', async () => {
      mockReq.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-10',
        status: 'PAID' // Upper case should be converted to lower case
      };

      const mockRecords = [
        {
          id: 'ORD-001',
          userId: 'USR-123',
          total: 99.9,
          status: 'paid',
          createdAt: '2023-01-02T10:00:00.000Z'
        },
        {
          id: 'ORD-002,WITH_COMMA',
          customerId: 'CUST-456',
          total: 0,
          status: 'paid',
          createdAt: '2023-01-03T12:00:00.000Z'
        },
        {
          id: 'ORD-003 "QUOTED"',
          userId: 'USR-789\nNEWLINE',
          total: 150.555,
          status: 'paid',
          createdAt: '2023-01-04T15:00:00.000Z'
        }
      ];

      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(mockRecords);

      await exportOrdersCsv(mockReq, mockRes);

      expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-10'),
        status: 'paid'
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);

      const responseCall = mockRes.json.mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.data.rowCount).toBe(3);
      expect(responseCall.data.fileName).toBe('orders_export_2023-01-01_to_2023-01-10.csv');
      expect(responseCall.data.mimeType).toBe('text/csv');

      const expectedCsvLines = [
        'Order ID,Customer ID,Total Amount,Status,Date',
        'ORD-001,USR-123,99.90,paid,2023-01-02T10:00:00.000Z',
        '"ORD-002,WITH_COMMA",CUST-456,0.00,paid,2023-01-03T12:00:00.000Z',
        '"ORD-003 ""QUOTED""","USR-789\nNEWLINE",150.56,paid,2023-01-04T15:00:00.000Z'
      ];
      expect(responseCall.data.csvContent).toBe(expectedCsvLines.join('\r\n'));
    });
  });

  describe('Error Handling', () => {
    test('should return 500 when ExportDataService throws an exception', async () => {
      mockReq.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-10'
      };

      const errorMsg = 'Database connection error';
      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockRejectedValue(new Error(errorMsg));

      await exportOrdersCsv(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate CSV export',
        details: errorMsg
      });
    });
  });
});