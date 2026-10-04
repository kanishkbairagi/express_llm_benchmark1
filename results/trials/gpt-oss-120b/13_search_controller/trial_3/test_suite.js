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
  afterEach(() => {
    jest.restoreAllMocks();
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
    const req = { query: { q: 'a' } };
    const res = createRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Search query must be at least 2 alphanumeric characters',
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { query: { q: 'valid query', page: '0', limit: '200' } };
    const res = createRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100',
    });
  });

  test('calls SearchIndex.search with correct arguments and returns 200', async () => {
    const mockSearchResult = {
      totalHits: 5,
      tookMs: 13,
      hits: [{ id: 1 }, { id: 2 }],
      facets: { categories: { electronics: 2 }, priceRanges: { low: 3 } },
    };
    const searchMock = jest
      .spyOn(SearchIndex, 'search')
      .mockResolvedValue(mockSearchResult);

    const req = {
      query: {
        q: 'phone+case',
        category: ' accessories ',
        minPrice: '10',
        maxPrice: '50',
        page: '2',
        limit: '10',
      },
    };
    const res = createRes();

    await searchProducts(req, res);

    expect(searchMock).toHaveBeenCalledWith({
      query: 'phone case', // sanitized
      filters: {
        category: 'accessories',
        minPrice: 10,
        maxPrice: 50,
      },
      page: 2,
      limit: 10,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      query: 'phone case',
      data: {
        total: 5,
        tookMs: 13,
        page: 2,
        limit: 10,
        items: [{ id: 1 }, { id: 2 }],
        facets: mockSearchResult.facets,
      },
    });
  });

  test('returns 500 when SearchIndex.search throws', async () => {
    const error = new Error('search failed');
    jest.spyOn(SearchIndex, 'search').mockRejectedValue(error);

    const req = { query: { q: 'valid' } };
    const res = createRes();

    await searchProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'An error occurred while executing search query',
      details: 'search failed',
    });
  });
});

describe('getSearchSuggestions controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 400 when query prefix is missing', async () => {
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
    const req = { query: { q: '!!' } }; // sanitizes to empty string
    const res = createRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
    });
  });

  test('calls SearchIndex.suggest and returns suggestions', async () => {
    const mockSuggestions = ['phone', 'phone case'];
    const suggestMock = jest
      .spyOn(SearchIndex, 'suggest')
      .mockResolvedValue(mockSuggestions);

    const req = { query: { q: 'pho' } };
    const res = createRes();

    await getSearchSuggestions(req, res);

    expect(suggestMock).toHaveBeenCalledWith('pho');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockSuggestions,
    });
  });

  test('returns 500 when SearchIndex.suggest throws', async () => {
    const error = new Error('suggest failed');
    jest.spyOn(SearchIndex, 'suggest').mockRejectedValue(error);

    const req = { query: { q: 'test' } };
    const res = createRes();

    await getSearchSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve search suggestions',
      details: 'suggest failed',
    });
  });
});