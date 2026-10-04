import { jest } from '@jest/globals';
import { exportOrdersCsv, ExportDataService } from '../dataset/23_export_controller.js';

describe('exportOrdersCsv Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('Validation', () => {
    test('should return 400 if startDate or endDate is missing', async () => {
      req.query = { startDate: '2023-01-01' };

      await exportOrdersCsv(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Both startDate and endDate query parameters are required'
      });
    });

    test('should return 400 if date format is invalid', async () => {
      req.query = { startDate: 'invalid-date', endDate: '2023-01-10' };

      await exportOrdersCsv(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Expected ISO-8601 string'
      });
    });

    test('should return 400 if startDate is after endDate', async () => {
      req.query = { startDate: '2023-01-10', endDate: '2023-01-01' };

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
        endDate: '2023-01-10',
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

  describe('Export Data Generation', () => {
    test('should return 200 with empty CSV when no records found', async () => {
      req.query = { startDate: '2023-01-01', endDate: '2023-01-10' };
      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue([]);

      await exportOrdersCsv(req, res);

      expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-10')
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

    test('should generate CSV correctly with valid records and status filter', async () => {
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-01-10',
        status: 'PAID'
      };

      const mockOrders = [
        {
          id: 'ord-101',
          userId: 'usr-1',
          total: 49.99,
          status: 'paid',
          createdAt: '2023-01-02T10:00:00.000Z'
        },
        {
          id: 'ord-102',
          customerId: 'cust-2',
          total: 100,
          status: 'paid',
          createdAt: '2023-01-03T12:00:00.000Z'
        }
      ];

      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(mockOrders);

      await exportOrdersCsv(req, res);

      expect(ExportDataService.fetchOrdersForExport).toHaveBeenCalledWith({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-10'),
        status: 'paid'
      });

      const expectedCsv = [
        'Order ID,Customer ID,Total Amount,Status,Date',
        'ord-101,usr-1,49.99,paid,2023-01-02T10:00:00.000Z',
        'ord-102,cust-2,100.00,paid,2023-01-03T12:00:00.000Z'
      ].join('\r\n');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Export generated successfully',
        data: {
          fileName: 'orders_export_2023-01-01_to_2023-01-10.csv',
          mimeType: 'text/csv',
          rowCount: 2,
          csvContent: expectedCsv,
          exportedAt: expect.any(String)
        }
      });
    });

    test('should properly escape fields containing commas, quotes, and newlines', async () => {
      req.query = { startDate: '2023-01-01', endDate: '2023-01-10' };

      const mockOrders = [
        {
          id: 'ord,103',
          userId: 'usr "special" 3',
          total: null,
          status: 'shipped\nexpress',
          createdAt: '2023-01-05T08:00:00.000Z'
        }
      ];

      jest.spyOn(ExportDataService, 'fetchOrdersForExport').mockResolvedValue(mockOrders);

      await exportOrdersCsv(req, res);

      const expectedCsv = [
        'Order ID,Customer ID,Total Amount,Status,Date',
        '"ord,103","usr ""special"" 3",0.00,"shipped\nexpress",2023-01-05T08:00:00.000Z'
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
  });

  describe('Error Handling', () => {
    test('should return 500 if ExportDataService throws an error', async () => {
      req.query = { startDate: '2023-01-01', endDate: '2023-01-10' };
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
});