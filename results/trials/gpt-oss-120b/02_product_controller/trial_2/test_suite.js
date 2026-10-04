import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getProducts,
  getProductById,
  Product
} from '../dataset/02_product_controller.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getProducts controller', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 400 when page is not a positive integer', async () => {
    const req = { query: { page: '0' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Page parameter must be a positive integer'
    });
  });

  it('returns 400 when limit is out of allowed range', async () => {
    const req = { query: { limit: '101' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit parameter must be between 1 and 100'
    });
  });

  it('returns 400 for invalid category filter', async () => {
    const req = { query: { category: '   ' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid category filter'
    });
  });

  it('returns 400 when minPrice is negative', async () => {
    const req = { query: { minPrice: '-5' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minPrice must be a non-negative number'
    });
  });

  it('returns 400 when maxPrice is less than minPrice', async () => {
    const req = { query: { minPrice: '50', maxPrice: '30' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'maxPrice cannot be less than minPrice'
    });
  });

  it('returns 400 for unsupported sortBy field', async () => {
    const req = { query: { sortBy: 'unknownField' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Invalid sortBy field. Allowed fields: price, name, createdAt, rating'
    });
  });

  it('returns 400 for invalid sortOrder value', async () => {
    const req = { query: { sortOrder: 'ascending' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'sortOrder must be either "asc" or "desc"'
    });
  });

  it('returns 200 with correct pagination and forwards filters to model', async () => {
    const mockRows = [{ id: 1 }, { id: 2 }];
    const mockCount = 25;
    const findAndCountAllSpy = jest
      .spyOn(Product, 'findAndCountAll')
      .mockResolvedValue({ count: mockCount, rows: mockRows });

    const req = {
      query: {
        page: '2',
        limit: '10',
        category: 'Electronics',
        minPrice: '100',
        maxPrice: '500',
        sortBy: 'price',
        sortOrder: 'ASC',
        inStock: 'true'
      }
    };
    const res = createRes();

    await getProducts(req, res);

    // Verify model call
    expect(findAndCountAllSpy).toHaveBeenCalledWith({
      filters: {
        category: 'Electronics',
        minPrice: 100,
        maxPrice: 500,
        inStock: true
      },
      sortBy: 'price',
      sortOrder: 'asc',
      offset: 10, // (page-1)*limit
      limit: 10
    });

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: mockRows,
        pagination: {
          totalItems: mockCount,
          totalPages: 3,
          currentPage: 2,
          limit: 10,
          hasNextPage: true,
          hasPrevPage: true
        }
      }
    });
  });

  it('handles unexpected errors with 500', async () => {
    jest.spyOn(Product, 'findAndCountAll').mockRejectedValue(new Error('DB fail'));

    const req = { query: {} };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve products',
      details: 'DB fail'
    });
  });
});

describe('getProductById controller', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 400 when id param is missing', async () => {
    const req = { params: {} };
    const res = createRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  it('returns 404 when product not found', async () => {
    jest.spyOn(Product, 'findById').mockResolvedValue(null);

    const req = { params: { id: '123' } };
    const res = createRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('123');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID 123 not found'
    });
  });

  it('returns 200 with product data when found', async () => {
    const mockProduct = { id: 'abc', name: 'Test Product' };
    jest.spyOn(Product, 'findById').mockResolvedValue(mockProduct);

    const req = { params: { id: ' abc ' } };
    const res = createRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProduct
    });
  });

  it('handles unexpected errors with 500', async () => {
    jest.spyOn(Product, 'findById').mockRejectedValue(new Error('DB error'));

    const req = { params: { id: 'x' } };
    const res = createRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch product details',
      details: 'DB error'
    });
  });
});