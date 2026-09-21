import { jest } from '@jest/globals';
import {
  searchProducts,
  getSearchSuggestions,
  SearchIndex
} from '../dataset/13_search_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('searchProducts controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when query parameter q is missing', async () => {
    const req = { query: {} };
    const res = mockResponse();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query parameter "q" is required'
    });
  });

  test('returns 400 when q is empty after trim', async () => {
    const req = { query: { q: '   ' } };
    const res = mockResponse();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query parameter "q" is required'
    });
  });

  test('returns 400 when sanitized query is shorter than 2 characters', async () => {
    const req = { query: { q: 'a' } };
    const res = mockResponse();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query must be at least 2 alphanumeric characters'
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { query: { q: 'test', page: '0', limit: '101' } };
    const res = mockResponse();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
    });
  });

  test('executes search with correct parameters and returns formatted response', async () => {
    const mockSearchResult = {
      totalHits: 5,
      tookMs: 42,
      hits: [{ id: 1 }, { id: 2 }],
      facets: { categories: { electronics: 3 }, priceRanges: { low: 2 } }
    };
    SearchIndex.search = jest.fn().mockResolvedValue(mockSearchResult);

    const req = {
      query: {
        q: 'smart+phone',
        category: '  electronics ',
        minPrice: '100',
        maxPrice: '500',
        page: '2',
        limit: '10'
      }
    };
    const res = mockResponse();

    await searchProducts(req, res);

    expect(SearchIndex.search).toHaveBeenCalledWith({
      query: 'smart phone',
      filters: {
        category: 'electronics',
        minPrice: 100,
        maxPrice: 500
      },
      page: 2,
      limit: 10
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      query: 'smart phone',
      data: {
        total: 5,
        tookMs: 42,
        page: 2,
        limit: 10,
        items: [{ id: 1 }, { id: 2 }],
        facets: { categories: { electronics: 3 }, priceRanges: { low: 2 } }
      }
    });
  });

  test('handles unexpected errors from SearchIndex.search', async () => {
    const errorMessage = 'DB connection failed';
    SearchIndex.search = jest.fn().mockRejectedValue(new Error(errorMessage));

    const req = { query: { q: 'test' } };
    const res = mockResponse();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'An error occurred while executing search query',
      details: errorMessage
    });
  });
});

describe('getSearchSuggestions controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when q parameter is missing', async () => {
    const req = { query: {} };
    const res = mockResponse();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Query prefix is required'
    });
  });

  test('returns 400 when q is empty after trim', async () => {
    const req = { query: { q: '   ' } };
    const res = mockResponse();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Query prefix is required'
    });
  });

  test('returns empty array when sanitized prefix length is < 1', async () => {
    const req = { query: { q: '!!' } }; // sanitization removes all special chars
    const res = mockResponse();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: []
    });
    expect(SearchIndex.suggest).not.toHaveBeenCalled();
  });

  test('returns suggestions from SearchIndex.suggest', async () => {
    const mockSuggestions = ['apple', 'applet', 'application'];
    SearchIndex.suggest = jest.fn().mockResolvedValue(mockSuggestions);

    const req = { query: { q: 'app' } };
    const res = mockResponse();

    await getSearchSuggestions(req, res);

    expect(SearchIndex.suggest).toHaveBeenCalledWith('app');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockSuggestions
    });
  });

  test('handles errors from SearchIndex.suggest', async () => {
    const errorMessage = 'Suggestion service down';
    SearchIndex.suggest = jest.fn().mockRejectedValue(new Error(errorMessage));

    const req = { query: { q: 'test' } };
    const res = mockResponse();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve search suggestions',
      details: errorMessage
    });
  });
});