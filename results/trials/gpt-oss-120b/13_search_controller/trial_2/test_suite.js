import { jest } from '@jest/globals';
import {
  searchProducts,
  getSearchSuggestions,
  SearchIndex
} from '../dataset/13_search_controller.js';

const mockRes = () => {
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
    const res = mockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query parameter "q" is required'
    });
  });

  test('returns 400 when sanitized query is less than 2 characters', async () => {
    const req = { query: { q: 'a' } };
    const res = mockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query must be at least 2 alphanumeric characters'
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = {
      query: { q: 'test', page: '0', limit: '150' }
    };
    const res = mockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
    });
  });

  test('successful search returns formatted response and calls SearchIndex.search with correct args', async () => {
    const fakeResults = {
      totalHits: 5,
      tookMs: 23,
      hits: [{ id: 1 }, { id: 2 }],
      facets: { categories: { cat1: 2 }, priceRanges: {} }
    };
    jest.spyOn(SearchIndex, 'search').mockResolvedValue(fakeResults);

    const req = {
      query: {
        q: 'foo+bar',
        category: '  electronics ',
        minPrice: '10',
        maxPrice: '100',
        page: '2',
        limit: '10'
      }
    };
    const res = mockRes();

    await searchProducts(req, res);

    expect(SearchIndex.search).toHaveBeenCalledWith({
      query: 'foo bar', // sanitized
      filters: {
        category: 'electronics',
        minPrice: 10,
        maxPrice: 100
      },
      page: 2,
      limit: 10
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      query: 'foo bar',
      data: {
        total: 5,
        tookMs: 23,
        page: 2,
        limit: 10,
        items: [{ id: 1 }, { id: 2 }],
        facets: { categories: { cat1: 2 }, priceRanges: {} }
      }
    });
  });

  test('catches errors from SearchIndex.search and returns 500', async () => {
    const error = new Error('search failure');
    jest.spyOn(SearchIndex, 'search').mockRejectedValue(error);

    const req = { query: { q: 'valid' } };
    const res = mockRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'An error occurred while executing search query',
      details: 'search failure'
    });
  });
});

describe('getSearchSuggestions controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 400 when query parameter "q" is missing', async () => {
    const req = { query: {} };
    const res = mockRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Query prefix is required'
    });
  });

  test('returns empty array when sanitized prefix length is less than 1', async () => {
    const req = { query: { q: '+' } }; // sanitizes to empty string
    const res = mockRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: []
    });
  });

  test('successful suggestions return data from SearchIndex.suggest', async () => {
    const suggestions = ['apple', 'application'];
    jest.spyOn(SearchIndex, 'suggest').mockResolvedValue(suggestions);

    const req = { query: { q: 'app' } };
    const res = mockRes();

    await getSearchSuggestions(req, res);

    expect(SearchIndex.suggest).toHaveBeenCalledWith('app');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: suggestions
    });
  });

  test('catches errors from SearchIndex.suggest and returns 500', async () => {
    const error = new Error('suggest failure');
    jest.spyOn(SearchIndex, 'suggest').mockRejectedValue(error);

    const req = { query: { q: 'test' } };
    const res = mockRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve search suggestions',
      details: 'suggest failure'
    });
  });
});