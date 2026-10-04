import { jest } from '@jest/globals';
import { Product, getProducts, getProductById } from '../dataset/02_product_controller.js';

describe('Product Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {}, params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('getProducts', () => {
    test('should return default paginated products list when no query params provided', async () => {
      const mockResult = {
        count: 15,
        rows: [{ id: '1', name: 'Product 1' }]
      };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue(mockResult);

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith({
        filters: {},
        sortBy: 'createdAt',
        sortOrder: 'desc',
        offset: 0,
        limit: 10
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          items: mockResult.rows,
          pagination: {
            totalItems: 15,
            totalPages: 2,
            currentPage: 1,
            limit: 10,
            hasNextPage: true,
            hasPrevPage: false
          }
        }
      });
    });

    test('should correctly apply all valid query filters, sorting, and pagination', async () => {
      req.query = {
        page: '2',
        limit: '5',
        category: 'Electronics ',
        minPrice: '100',
        maxPrice: '500',
        sortBy: 'price',
        sortOrder: 'ASC',
        inStock: 'true'
      };

      const mockResult = { count: 12, rows: [{ id: '2', name: 'Product 2' }] };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue(mockResult);

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith({
        filters: {
          category: 'Electronics',
          minPrice: 100,
          maxPrice: 500,
          inStock: true
        },
        sortBy: 'price',
        sortOrder: 'asc',
        offset: 5,
        limit: 5
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          items: mockResult.rows,
          pagination: {
            totalItems: 12,
            totalPages: 3,
            currentPage: 2,
            limit: 5,
            hasNextPage: true,
            hasPrevPage: true
          }
        }
      });
    });

    test('should reject invalid page parameter (< 1 or NaN)', async () => {
      req.query = { page: '0' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Page parameter must be a positive integer'
      });

      req.query = { page: 'abc' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should reject invalid limit parameter (< 1 or > 100 or NaN)', async () => {
      req.query = { limit: '0' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { limit: '101' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit parameter must be between 1 and 100'
      });
    });

    test('should reject empty or whitespace-only category string', async () => {
      req.query = { category: '   ' };
      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid category filter'
      });
    });

    test('should reject invalid or negative minPrice', async () => {
      req.query = { minPrice: '-10' };
      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'minPrice must be a non-negative number'
      });

      req.query = { minPrice: 'not-a-number' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should reject invalid or negative maxPrice', async () => {
      req.query = { maxPrice: '-5' };
      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'maxPrice must be a non-negative number'
      });
    });

    test('should reject maxPrice if it is less than minPrice', async () => {
      req.query = { minPrice: '100', maxPrice: '50' };
      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'maxPrice cannot be less than minPrice'
      });
    });

    test('should handle boolean inStock query value', async () => {
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

      req.query = { inStock: 'false' };
      await getProducts(req, res);
      expect(Product.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
        filters: { inStock: false }
      }));
    });

    test('should reject disallowed sortBy fields', async () => {
      req.query = { sortBy: 'unauthorized_column' };
      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid sortBy field. Allowed fields: price, name, createdAt, rating'
      });
    });

    test('should reject disallowed sortOrder values', async () => {
      req.query = { sortOrder: 'sideways' };
      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sortOrder must be either "asc" or "desc"'
      });
    });

    test('should return 500 when database throws an exception', async () => {
      jest.spyOn(Product, 'findAndCountAll').mockRejectedValue(new Error('Database error'));

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve products',
        details: 'Database error'
      });
    });
  });

  describe('getProductById', () => {
    test('should return 400 if ID parameter is missing or empty', async () => {
      req.params = {};
      await getProductById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });

      req.params = { id: '   ' };
      await getProductById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 404 if product is not found', async () => {
      req.params = { id: 'p123' };
      jest.spyOn(Product, 'findById').mockResolvedValue(null);

      await getProductById(req, res);

      expect(Product.findById).toHaveBeenCalledWith('p123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product with ID p123 not found'
      });
    });

    test('should return 200 with product data when found', async () => {
      const mockProduct = { id: 'p123', name: 'Test Laptop', price: 999.99 };
      req.params = { id: ' p123 ' };
      jest.spyOn(Product, 'findById').mockResolvedValue(mockProduct);

      await getProductById(req, res);

      expect(Product.findById).toHaveBeenCalledWith('p123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockProduct
      });
    });

    test('should return 500 when database throws an exception', async () => {
      req.params = { id: 'p123' };
      jest.spyOn(Product, 'findById').mockRejectedValue(new Error('Conn failure'));

      await getProductById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch product details',
        details: 'Conn failure'
      });
    });
  });
});