import { jest } from '@jest/globals';
import {
  searchProducts,
  getSearchSuggestions,
  SearchIndex,
} from '../dataset/13_search_controller.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('searchProducts controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when query param "q" is missing', async () => {
    const req = { query: {} };
    const res = createRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query parameter "q" is required',
    });
  });

  test('returns 400 when sanitized query is too short', async () => {
    const req = { query: { q: '+' } }; // sanitizes to empty string
    const res = createRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query must be at least 2 alphanumeric characters',
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { query: { q: 'test', page: '0', limit: '150' } };
    const res = createRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100',
    });
  });

  test('returns 200 with expected payload on successful search', async () => {
    const mockResult = {
      totalHits: 5,
      tookMs: 23,
      hits: [{ id: 1 }, { id: 2 }],
      facets: {
        categories: { electronics: 3 },
        priceRanges: { '0-50': 2 },
      },
    };
    jest.spyOn(SearchIndex, 'search').mockResolvedValueOnce(mockResult);

    const req = {
      query: {
        q: 'smart+phone',
        category: ' electronics ',
        minPrice: '100',
        maxPrice: '500',
        page: '2',
        limit: '10',
      },
    };
    const res = createRes();

    await searchProducts(req, res);

    expect(SearchIndex.search).toHaveBeenCalledWith({
      query: 'smart phone',
      filters: {
        category: 'electronics',
        minPrice: 100,
        maxPrice: 500,
      },
      page: 2,
      limit: 10,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      query: 'smart phone',
      data: {
        total: 5,
        tookMs: 23,
        page: 2,
        limit: 10,
        items: [{ id: 1 }, { id: 2 }],
        facets: mockResult.facets,
      },
    });
  });

  test('returns 500 when SearchIndex.search throws', async () => {
    const error = new Error('DB failure');
    jest.spyOn(SearchIndex, 'search').mockRejectedValueOnce(error);

    const req = { query: { q: 'test' } };
    const res = createRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'An error occurred while executing search query',
      details: 'DB failure',
    });
  });
});

describe('getSearchSuggestions controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when query prefix "q" is missing', async () => {
    const req = { query: {} };
    const res = createRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Query prefix is required',
    });
  });

  test('returns empty array when sanitized prefix length < 1', async () => {
    const req = { query: { q: '+' } }; // sanitizes to ''
    const res = createRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
    });
    // ensure suggest not called
    expect(SearchIndex.suggest).not.toHaveBeenCalled();
  });

  test('returns 200 with suggestions on successful call', async () => {
    const suggestions = ['apple', 'apricot'];
    jest.spyOn(SearchIndex, 'suggest').mockResolvedValueOnce(suggestions);

    const req = { query: { q: 'ap+' } };
    const res = createRes();

    await getSearchSuggestions(req, res);

    expect(SearchIndex.suggest).toHaveBeenCalledWith('ap ');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: suggestions,
    });
  });

  test('returns 500 when SearchIndex.suggest throws', async () => {
    const error = new Error('Suggestion engine down');
    jest.spyOn(SearchIndex, 'suggest').mockRejectedValueOnce(error);

    const req = { query: { q: 'test' } };
    const res = createRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve search suggestions',
      details: 'Suggestion engine down',
    });
  });
});