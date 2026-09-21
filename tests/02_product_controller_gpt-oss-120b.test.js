import { jest } from '@jest/globals';
import {
  Product,
  getProducts,
  getProductById
} from '../dataset/02_product_controller.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getProducts controller', () => {
  test('returns paginated data on valid request', async () => {
    const mockFind = jest
      .spyOn(Product, 'findAndCountAll')
      .mockResolvedValue({ count: 25, rows: [{ id: 1 }, { id: 2 }] });

    const req = {
      query: { page: '2', limit: '10', sortBy: 'price', sortOrder: 'ASC' }
    };
    const res = createRes();

    await getProducts(req, res);

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {},
        sortBy: 'price',
        sortOrder: 'asc',
        offset: 10,
        limit: 10
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [{ id: 1 }, { id: 2 }],
        pagination: {
          totalItems: 25,
          totalPages: 3,
          currentPage: 2,
          limit: 10,
          hasNextPage: true,
          hasPrevPage: true
        }
      }
    });
  });

  test('rejects non‑numeric page parameter', async () => {
    const req = { query: { page: 'abc' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Page parameter must be a positive integer'
    });
  });

  test('rejects limit outside allowed range', async () => {
    const req = { query: { limit: '200' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit parameter must be between 1 and 100'
    });
  });

  test('rejects empty category filter', async () => {
    const req = { query: { category: '   ' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid category filter'
    });
  });

  test('rejects negative minPrice', async () => {
    const req = { query: { minPrice: '-5' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minPrice must be a non-negative number'
    });
  });

  test('rejects maxPrice lower than minPrice', async () => {
    const req = { query: { minPrice: '10', maxPrice: '5' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'maxPrice cannot be less than minPrice'
    });
  });

  test('rejects unsupported sortBy field', async () => {
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

  test('rejects invalid sortOrder value', async () => {
    const req = { query: { sortOrder: 'upward' } };
    const res = createRes();

    await getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'sortOrder must be either "asc" or "desc"'
    });
  });

  test('parses inStock filter correctly', async () => {
    const mockFind = jest
      .spyOn(Product, 'findAndCountAll')
      .mockResolvedValue({ count: 0, rows: [] });

    const req = { query: { inStock: 'true' } };
    const res = createRes();

    await getProducts(req, res);

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { inStock: true }
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('getProductById controller', () => {
  test('returns product when found', async () => {
    const mockFind = jest
      .spyOn(Product, 'findById')
      .mockResolvedValue({ id: 'abc', name: 'Test Product' });

    const req = { params: { id: 'abc' } };
    const res = createRes();

    await getProductById(req, res);

    expect(mockFind).toHaveBeenCalledWith('abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'abc', name: 'Test Product' }
    });
  });

  test('rejects missing id parameter', async () => {
    const req = { params: {} };
    const res = createRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 404 when product does not exist', async () => {
    jest.spyOn(Product, 'findById').mockResolvedValue(null);

    const req = { params: { id: 'nonexistent' } };
    const res = createRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product with ID nonexistent not found'
    });
  });

  test('handles internal errors gracefully', async () => {
    jest
      .spyOn(Product, 'findById')
      .mockRejectedValue(new Error('Database failure'));

    const req = { params: { id: 'abc' } };
    const res = createRes();

    await getProductById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to fetch product details',
        details: 'Database failure'
      })
    );
  });
});