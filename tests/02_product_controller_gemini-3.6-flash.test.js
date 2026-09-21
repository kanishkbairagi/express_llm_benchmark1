import { jest } from '@jest/globals';
import { Product, getProducts, getProductById } from '../dataset/02_product_controller.js';

describe('Product Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      query: {},
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getProducts', () => {
    it('should return product list with default pagination and sorting when query is empty', async () => {
      const mockData = {
        count: 2,
        rows: [{ id: '1', name: 'Product A' }, { id: '2', name: 'Product B' }]
      };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue(mockData);

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
          items: mockData.rows,
          pagination: {
            totalItems: 2,
            totalPages: 1,
            currentPage: 1,
            limit: 10,
            hasNextPage: false,
            hasPrevPage: false
          }
        }
      });
    });

    it('should process valid custom query parameters correctly', async () => {
      req.query = {
        page: '2',
        limit: '5',
        category: '  electronics ',
        minPrice: '10',
        maxPrice: '100',
        sortBy: 'price',
        sortOrder: 'ASC',
        inStock: 'true'
      };

      const mockData = { count: 12, rows: [{ id: '6', name: 'Product F' }] };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue(mockData);

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith({
        filters: {
          category: 'electronics',
          minPrice: 10,
          maxPrice: 100,
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
          items: mockData.rows,
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

    it('should return 400 for invalid page parameter', async () => {
      req.query = { page: '0' };

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Page parameter must be a positive integer'
      });
    });

    it('should return 400 for limit parameter out of bounds (>100)', async () => {
      req.query = { limit: '101' };

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit parameter must be between 1 and 100'
      });
    });

    it('should return 400 for empty or whitespace-only category filter', async () => {
      req.query = { category: '   ' };

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid category filter'
      });
    });

    it('should return 400 for negative minPrice', async () => {
      req.query = { minPrice: '-5' };

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'minPrice must be a non-negative number'
      });
    });

    it('should return 400 when maxPrice is less than minPrice', async () => {
      req.query = { minPrice: '50', maxPrice: '30' };

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'maxPrice cannot be less than minPrice'
      });
    });

    it('should return 400 for disallowed sortBy field', async () => {
      req.query = { sortBy: 'unallowedField' };

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid sortBy field. Allowed fields: price, name, createdAt, rating'
      });
    });

    it('should return 400 for invalid sortOrder', async () => {
      req.query = { sortOrder: 'invalid' };

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sortOrder must be either "asc" or "desc"'
      });
    });

    it('should handle false value for inStock filter parameter', async () => {
      req.query = { inStock: 'false' };
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

      await getProducts(req, res);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ inStock: false })
        })
      );
    });

    it('should return 500 when database operation throws an exception', async () => {
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
    it('should return 200 and product data when found', async () => {
      req.params = { id: '123' };
      const mockProduct = { id: '123', name: 'Test Product', price: 99.99 };
      jest.spyOn(Product, 'findById').mockResolvedValue(mockProduct);

      await getProductById(req, res);

      expect(Product.findById).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockProduct
      });
    });

    it('should return 400 if product ID is missing or empty', async () => {
      req.params = { id: '   ' };

      await getProductById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 404 if product is not found', async () => {
      req.params = { id: '999' };
      jest.spyOn(Product, 'findById').mockResolvedValue(null);

      await getProductById(req, res);

      expect(Product.findById).toHaveBeenCalledWith('999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product with ID 999 not found'
      });
    });

    it('should return 500 when database throws an exception', async () => {
      req.params = { id: '123' };
      jest.spyOn(Product, 'findById').mockRejectedValue(new Error('Connection failure'));

      await getProductById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch product details',
        details: 'Connection failure'
      });
    });
  });
});