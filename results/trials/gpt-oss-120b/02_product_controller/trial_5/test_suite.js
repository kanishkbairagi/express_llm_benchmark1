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

describe('getProducts controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  test('returns 400 for negative minPrice', async () => {
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

  test('returns 400 for invalid sortBy field', async () => {
    const req = { query: { sortBy: 'unknown' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error:
        'Invalid sortBy field. Allowed fields: price, name, createdAt, rating'
    });
  });

  test('returns 400 for invalid sortOrder', async () => {
    const req = { query: { sortOrder: 'ascending' } };
    const res = mockRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'sortOrder must be either "asc" or "desc"'
    });
  });

  test('calls Product.findAndCountAll with correct params and returns paginated result', async () => {
    const fakeRows = [{ id: 1 }, { id: 2 }];
    const findAndCountAllSpy = jest
      .spyOn(Product, 'findAndCountAll')
      .mockResolvedValue({ count: 2, rows: fakeRows });

    const req = {
      query: {
        page: '2',
        limit: '5',
        category: 'electronics',
        minPrice: '100',
        maxPrice: '500',
        sortBy: 'price',
        sortOrder: 'ASC',
        inStock: 'true'
      }
    };
    const res = mockRes();

    await getProducts(req, res);

    expect(findAndCountAllSpy).toHaveBeenCalledWith({
      filters: {
        category: 'electronics',
        minPrice: 100,
        maxPrice: 500,
        inStock: true
      },
      sortBy: 'price',
      sortOrder: 'asc',
      offset: 5, // (page-1)*limit = (2-1)*5
      limit: 5
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: fakeRows,
        pagination: {
          totalItems: 2,
          totalPages: 1,
          currentPage: 2,
          limit: 5,
          hasNextPage: false,
          hasPrevPage: true
        }
      }
    });
  });

  test('handles unexpected errors with 500', async () => {
    jest
      .spyOn(Product, 'findAndCountAll')
      .mockRejectedValue(new Error('DB failure'));

    const req = { query: {} };
    const res = mockRes();

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when id param is missing or empty', async () => {
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

    const req = { params: { id: '123' } };
    const res = mockRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('123');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID 123 not found'
    });
  });

  test('returns 200 with product data when found', async () => {
    const fakeProduct = { id: 'abc', name: 'Test' };
    jest.spyOn(Product, 'findById').mockResolvedValue(fakeProduct);

    const req = { params: { id: ' abc ' } };
    const res = mockRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeProduct
    });
  });

  test('handles unexpected errors with 500', async () => {
    jest
      .spyOn(Product, 'findById')
      .mockRejectedValue(new Error('Unexpected DB error'));

    const req = { params: { id: '1' } };
    const res = mockRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch product details',
      details: 'Unexpected DB error'
    });
  });
});