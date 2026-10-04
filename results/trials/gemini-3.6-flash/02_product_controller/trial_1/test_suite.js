import { jest } from '@jest/globals';
import { getProducts, getProductById, Product } from '../dataset/02_product_controller.js';

describe('Product Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {}, params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getProducts', () => {
    test('should return default paginated products when no query parameters are provided', async () => {
      const mockResult = { count: 1, rows: [{ id: '1', name: 'Product 1' }] };
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
            totalItems: 1,
            totalPages: 1,
            currentPage: 1,
            limit: 10,
            hasNextPage: false,
            hasPrevPage: false
          }
        }
      });
    });

    test('should return 400 if page is invalid (NaN or < 1)', async () => {
      req.query = { page: 'invalid' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Page parameter must be a positive integer'
      });

      req.query = { page: '0' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if limit is invalid (< 1 or > 100 or NaN)', async () => {
      req.query = { limit: '0' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit parameter must be between 1 and 100'
      });

      req.query = { limit: '101' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { limit: 'abc' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if category is invalid or empty string', async () => {
      req.query = { category: '   ' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid category filter'
      });
    });

    test('should apply category filter when valid string provided', async () => {
      req.query = { category: 'Electronics ' };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ category: 'Electronics' })
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 400 if minPrice is invalid or negative', async () => {
      req.query = { minPrice: '-10' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'minPrice must be a non-negative number'
      });

      req.query = { minPrice: 'abc' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if maxPrice is invalid or negative', async () => {
      req.query = { maxPrice: '-5' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'maxPrice must be a non-negative number'
      });
    });

    test('should return 400 if maxPrice is less than minPrice', async () => {
      req.query = { minPrice: '50', maxPrice: '20' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'maxPrice cannot be less than minPrice'
      });
    });

    test('should handle valid minPrice and maxPrice filters', async () => {
      req.query = { minPrice: '10', maxPrice: '50' };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ minPrice: 10, maxPrice: 50 })
        })
      );
    });

    test('should correctly parse inStock query param as boolean', async () => {
      req.query = { inStock: 'true' };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ inStock: true })
        })
      );

      req.query = { inStock: 'false' };
      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ inStock: false })
        })
      );
    });

    test('should return 400 if sortBy is not allowed', async () => {
      req.query = { sortBy: 'unallowedField' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid sortBy field. Allowed fields: price, name, createdAt, rating'
      });
    });

    test('should return 400 if sortOrder is not "asc" or "desc"', async () => {
      req.query = { sortOrder: 'invalidOrder' };
      await getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sortOrder must be either "asc" or "desc"'
      });
    });

    test('should calculate pagination properties correctly when multiple pages exist', async () => {
      req.query = { page: '2', limit: '5' };
      const mockResult = { count: 12, rows: [{}, {}, {}, {}, {}] };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue(mockResult);

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 5, limit: 5 })
      );
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

    test('should handle database errors and return 500 status code', async () => {
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
    test('should return 400 if id parameter is missing or invalid string', async () => {
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

    test('should return 200 and product data if found', async () => {
      const mockProduct = { id: 'p123', name: 'Sample Item', price: 99.99 };
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

    test('should handle errors and return 500 status code', async () => {
      req.params = { id: 'p123' };
      jest.spyOn(Product, 'findById').mockRejectedValue(new Error('Lookup error'));

      await getProductById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch product details',
        details: 'Lookup error'
      });
    });
  });
});