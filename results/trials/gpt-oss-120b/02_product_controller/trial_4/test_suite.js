import { jest } from '@jest/globals';
import { Product, getProducts, getProductById } from '../dataset/02_product_controller.js';

describe('getProducts controller', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 400 when page is not a positive integer', async () => {
    const req = { query: { page: '-2' } };
    const res = makeRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Page parameter must be a positive integer'
    });
  });

  test('returns 400 when limit is out of allowed range', async () => {
    const req = { query: { limit: '0' } };
    const res = makeRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit parameter must be between 1 and 100'
    });
  });

  test('returns 400 for invalid category filter', async () => {
    const req = { query: { category: '   ' } };
    const res = makeRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid category filter'
    });
  });

  test('returns 400 when minPrice is negative', async () => {
    const req = { query: { minPrice: '-10' } };
    const res = makeRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minPrice must be a non-negative number'
    });
  });

  test('returns 400 when maxPrice < minPrice', async () => {
    const req = { query: { minPrice: '50', maxPrice: '30' } };
    const res = makeRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'maxPrice cannot be less than minPrice'
    });
  });

  test('returns 400 for unsupported sortBy field', async () => {
    const req = { query: { sortBy: 'unknownField' } };
    const res = makeRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid sortBy field')
    });
  });

  test('returns 400 for invalid sortOrder value', async () => {
    const req = { query: { sortOrder: 'ascending' } };
    const res = makeRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'sortOrder must be either "asc" or "desc"'
    });
  });

  test('successful response with correct pagination and filter forwarding', async () => {
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
    const res = makeRes();

    await getProducts(req, res);

    expect(findAndCountAllSpy).toHaveBeenCalledWith({
      filters: {
        category: 'Electronics',
        minPrice: 100,
        maxPrice: 500,
        inStock: true
      },
      sortBy: 'price',
      sortOrder: 'asc',
      offset: 10,
      limit: 10
    });

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

  test('handles internal errors and returns 500', async () => {
    jest.spyOn(Product, 'findAndCountAll').mockRejectedValue(new Error('DB failure'));

    const req = { query: {} };
    const res = makeRes();

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
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 400 when id param is missing or empty', async () => {
    const req = { params: {} };
    const res = makeRes();

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
    const res = makeRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('123');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID 123 not found'
    });
  });

  test('successful retrieval returns product data', async () => {
    const mockProduct = { id: 'abc', name: 'Test Product' };
    jest.spyOn(Product, 'findById').mockResolvedValue(mockProduct);

    const req = { params: { id: ' abc ' } };
    const res = makeRes();

    await getProductById(req, res);

    expect(Product.findById).toHaveBeenCalledWith('abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProduct
    });
  });

  test('handles internal errors and returns 500', async () => {
    jest.spyOn(Product, 'findById').mockRejectedValue(new Error('Unexpected DB error'));

    const req = { params: { id: 'any' } };
    const res = makeRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch product details',
      details: 'Unexpected DB error'
    });
  });
});