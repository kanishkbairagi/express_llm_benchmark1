import { jest } from '@jest/globals';
import {
  searchProducts,
  getSearchSuggestions,
  SearchIndex
} from '../dataset/13_search_controller.js';

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('searchProducts controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 400 when query parameter "q" is missing', async () => {
    const req = { query: {} };
    const res = createMockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query parameter "q" is required'
    });
  });

  test('returns 400 when sanitized query is shorter than 2 characters', async () => {
    const req = { query: { q: 'a' } };
    const res = createMockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query must be at least 2 alphanumeric characters'
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { query: { q: 'test', page: '0', limit: '101' } };
    const res = createMockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
    });
  });

  test('returns 200 with correct payload on successful search', async () => {
    const mockSearchResult = {
      totalHits: 42,
      tookMs: 15,
      hits: [{ id: 1, name: 'Product A' }],
      facets: {
        categories: { electronics: 10 },
        priceRanges: { '0-50': 5 }
      }
    };
    jest.spyOn(SearchIndex, 'search').mockResolvedValue(mockSearchResult);

    const req = {
      query: {
        q: 'phone+case',
        category: ' accessories ',
        minPrice: '5',
        maxPrice: '20',
        page: '2',
        limit: '10'
      }
    };
    const res = createMockRes();

    await searchProducts(req, res);

    expect(SearchIndex.search).toHaveBeenCalledWith({
      query: 'phone case',
      filters: {
        category: 'accessories',
        minPrice: 5,
        maxPrice: 20
      },
      page: 2,
      limit: 10
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      query: 'phone case',
      data: {
        total: 42,
        tookMs: 15,
        page: 2,
        limit: 10,
        items: [{ id: 1, name: 'Product A' }],
        facets: {
          categories: { electronics: 10 },
          priceRanges: { '0-50': 5 }
        }
      }
    });
  });

  test('returns 500 when SearchIndex.search throws', async () => {
    jest.spyOn(SearchIndex, 'search').mockRejectedValue(new Error('DB failure'));

    const req = { query: { q: 'test' } };
    const res = createMockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'An error occurred while executing search query',
      details: 'DB failure'
    });
  });
});

describe('getSearchSuggestions controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 400 when query prefix "q" is missing', async () => {
    const req = { query: {} };
    const res = createMockRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Query prefix is required'
    });
  });

  test('returns empty suggestions when sanitized prefix length is < 1', async () => {
    const req = { query: { q: '!!' } }; // sanitized to empty string
    const res = createMockRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: []
    });
  });

  test('returns 200 with suggestions on successful call', async () => {
    const mockSuggestions = ['phone case', 'phone charger'];
    jest.spyOn(SearchIndex, 'suggest').mockResolvedValue(mockSuggestions);

    const req = { query: { q: 'ph' } };
    const res = createMockRes();

    await getSearchSuggestions(req, res);

    expect(SearchIndex.suggest).toHaveBeenCalledWith('ph');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockSuggestions
    });
  });

  test('returns 500 when SearchIndex.suggest throws', async () => {
    jest.spyOn(SearchIndex, 'suggest').mockRejectedValue(new Error('Suggest failure'));

    const req = { query: { q: 'test' } };
    const res = createMockRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve search suggestions',
      details: 'Suggest failure'
    });
  });
});