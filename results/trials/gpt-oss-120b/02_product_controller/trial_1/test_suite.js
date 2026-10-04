import { jest } from '@jest/globals';
import {
  getProducts,
  getProductById,
  Product
} from '../dataset/02_product_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getProducts controller', () => {
  test('returns 200 with correct pagination when request is valid', async () => {
    const req = {
      query: {
        page: '2',
        limit: '5',
        sortBy: 'price',
        sortOrder: 'ASC',
        inStock: 'true'
      }
    };
    const res = mockRes();

    jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 12,
      rows: [{ id: 1 }, { id: 2 }]
    });

    await getProducts(req, res);

    expect(Product.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      filters: { inStock: true },
      sortBy: 'price',
      sortOrder: 'asc',
      offset: 5,
      limit: 5
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: {
        items: [{ id: 1 }, { id: 2 }],
        pagination: {
          totalItems: 12,
          totalPages: 3,
          currentPage: 2,
          limit: 5,
          hasNextPage: true,
          hasPrevPage: true
        }
      }
    }));
  });

  test('returns 400 when page is not a positive integer', async () => {
    const req = { query: { page: '0' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Page parameter must be a positive integer'
    });
  });

  test('returns 400 when limit is out of allowed range', async () => {
    const req = { query: { limit: '101' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit parameter must be between 1 and 100'
    });
  });

  test('returns 400 for invalid category filter', async () => {
    const req = { query: { category: '   ' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid category filter'
    });
  });

  test('returns 400 when minPrice is negative', async () => {
    const req = { query: { minPrice: '-5' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minPrice must be a non-negative number'
    });
  });

  test('returns 400 when maxPrice < minPrice', async () => {
    const req = { query: { minPrice: '10', maxPrice: '5' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'maxPrice cannot be less than minPrice'
    });
  });

  test('returns 400 for unsupported sortBy field', async () => {
    const req = { query: { sortBy: 'unknownField' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid sortBy field')
    });
  });

  test('returns 400 for invalid sortOrder value', async () => {
    const req = { query: { sortOrder: 'invalid' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'sortOrder must be either "asc" or "desc"'
    });
  });

  test('handles internal errors with 500', async () => {
    const req = { query: {} };
    const res = mockRes();

    jest.spyOn(Product, 'findAndCountAll').mockRejectedValue(new Error('DB failure'));

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve products',
      details: 'DB failure'
    });
  });
});

describe('getProductById controller', () => {
  test('returns 200 with product when found', async () => {
    const req = { params: { id: 'abc123' } };
    const res = mockRes();

    jest.spyOn(Product, 'findById').mockResolvedValue({ id: 'abc123', name: 'Test' });

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('abc123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'abc123', name: 'Test' }
    });
  });

  test('returns 400 when id param is missing', async () => {
    const req = { params: {} };
    const res = mockRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 400 when id param is empty string', async () => {
    const req = { params: { id: '   ' } };
    const res = mockRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 404 when product not found', async () => {
    const req = { params: { id: 'not-found' } };
    const res = mockRes();

    jest.spyOn(Product, 'findById').mockResolvedValue(null);

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('not-found');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID not-found not found'
    });
  });

  test('handles internal errors with 500', async () => {
    const req = { params: { id: 'abc' } };
    const res = mockRes();

    jest.spyOn(Product, 'findById').mockRejectedValue(new Error('DB error'));

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch product details',
      details: 'DB error'
    });
  });
});