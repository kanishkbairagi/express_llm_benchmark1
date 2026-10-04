import { jest } from '@jest/globals';
import {
  Product,
  getProducts,
  getProductById
} from '../dataset/02_product_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getProducts controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated result with default parameters', async () => {
    const mockCount = 25;
    const mockRows = [{ id: 1 }, { id: 2 }];
    jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: mockCount,
      rows: mockRows
    });

    const req = { query: {} };
    const res = mockRes();

    await getProducts(req, res);

    expect(Product.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {},
        sortBy: 'createdAt',
        sortOrder: 'desc',
        offset: 0,
        limit: 10
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload.success).toBe(true);
    expect(jsonPayload.data.items).toBe(mockRows);
    expect(jsonPayload.data.pagination).toMatchObject({
      totalItems: mockCount,
      totalPages: 3,
      currentPage: 1,
      limit: 10,
      hasNextPage: true,
      hasPrevPage: false
    });
  });

  test('rejects non‑positive page parameter', async () => {
    const req = { query: { page: '0' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Page parameter must be a positive integer'
    });
  });

  test('rejects limit outside allowed range', async () => {
    const req = { query: { limit: '101' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit parameter must be between 1 and 100'
    });
  });

  test('rejects invalid sortBy field', async () => {
    const req = { query: { sortBy: 'unknownField' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Invalid sortBy field/);
  });

  test('rejects invalid sortOrder value', async () => {
    const req = { query: { sortOrder: 'ascending' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'sortOrder must be either "asc" or "desc"'
    });
  });

  test('rejects negative minPrice', async () => {
    const req = { query: { minPrice: '-5' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minPrice must be a non-negative number'
    });
  });

  test('rejects maxPrice lower than minPrice', async () => {
    const req = { query: { minPrice: '10', maxPrice: '5' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'maxPrice cannot be less than minPrice'
    });
  });

  test('converts inStock query to boolean', async () => {
    const mockResult = { count: 0, rows: [] };
    const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue(mockResult);

    const req = { query: { inStock: 'true' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { inStock: true }
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('handles unexpected error from model', async () => {
    jest.spyOn(Product, 'findAndCountAll').mockRejectedValue(new Error('DB failure'));

    const req = { query: {} };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Failed to retrieve products');
    expect(payload.details).toBe('DB failure');
  });
});

describe('getProductById controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns product when found', async () => {
    const mockProduct = { id: 'abc', name: 'Test' };
    jest.spyOn(Product, 'findById').mockResolvedValue(mockProduct);

    const req = { params: { id: 'abc' } };
    const res = mockRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProduct
    });
  });

  test('rejects missing id parameter', async () => {
    const req = { params: {} };
    const res = mockRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 404 when product not found', async () => {
    jest.spyOn(Product, 'findById').mockResolvedValue(null);

    const req = { params: { id: 'nonexistent' } };
    const res = mockRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('nonexistent');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID nonexistent not found'
    });
  });

  test('handles unexpected error from model', async () => {
    jest.spyOn(Product, 'findById').mockRejectedValue(new Error('DB error'));

    const req = { params: { id: 'abc' } };
    const res = mockRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Failed to fetch product details');
    expect(payload.details).toBe('DB error');
  });
});