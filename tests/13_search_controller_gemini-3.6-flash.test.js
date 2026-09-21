import { jest } from '@jest/globals';
import { searchProducts, getSearchSuggestions, SearchIndex } from '../dataset/13_search_controller.js';

describe('Search Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('searchProducts', () => {
    test('should return 400 if q parameter is missing', async () => {
      req.query = {};

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    test('should return 400 if q is not a string', async () => {
      req.query = { q: 12345 };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    test('should return 400 if q is empty string or only whitespace', async () => {
      req.query = { q: '   ' };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    test('should return 400 if req.query is undefined', async () => {
      req = {};

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    test('should return 400 if query after sanitization is less than 2 characters', async () => {
      req.query = { q: 'a!' };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query must be at least 2 alphanumeric characters'
      });
    });

    test('should return 400 for invalid page parameter (< 1)', async () => {
      req.query = { q: 'laptop', page: '0' };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
      });
    });

    test('should return 400 for invalid page parameter (NaN)', async () => {
      req.query = { q: 'laptop', page: 'invalid' };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
      });
    });

    test('should return 400 for invalid limit parameter (> 100)', async () => {
      req.query = { q: 'laptop', limit: '101' };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
      });
    });

    test('should return 400 for invalid limit parameter (< 1)', async () => {
      req.query = { q: 'laptop', limit: '0' };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
      });
    });

    test('should execute search with sanitized query and filters, returning 200', async () => {
      req.query = {
        q: 'phone+case!',
        category: ' electronics ',
        minPrice: '10.5',
        maxPrice: '50.0',
        page: '2',
        limit: '10'
      };

      const mockSearchResult = {
        totalHits: 15,
        tookMs: 8,
        hits: [{ id: 1, name: 'Phone Case' }],
        facets: { categories: { electronics: 15 }, priceRanges: {} }
      };

      const searchSpy = jest.spyOn(SearchIndex, 'search').mockResolvedValueOnce(mockSearchResult);

      await searchProducts(req, res);

      expect(searchSpy).toHaveBeenCalledWith({
        query: 'phone case',
        filters: {
          category: 'electronics',
          minPrice: 10.5,
          maxPrice: 50.0
        },
        page: 2,
        limit: 10
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        query: 'phone case',
        data: {
          total: 15,
          tookMs: 8,
          page: 2,
          limit: 10,
          items: [{ id: 1, name: 'Phone Case' }],
          facets: { categories: { electronics: 15 }, priceRanges: {} }
        }
      });
    });

    test('should use default page (1) and limit (20) if omitted', async () => {
      req.query = { q: 'shoes' };

      const searchSpy = jest.spyOn(SearchIndex, 'search').mockResolvedValueOnce({
        totalHits: 0,
        tookMs: 2,
        hits: [],
        facets: { categories: {}, priceRanges: {} }
      });

      await searchProducts(req, res);

      expect(searchSpy).toHaveBeenCalledWith({
        query: 'shoes',
        filters: {},
        page: 1,
        limit: 20
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 when SearchIndex.search throws an exception', async () => {
      req.query = { q: 'laptop' };
      jest.spyOn(SearchIndex, 'search').mockRejectedValueOnce(new Error('Index service failure'));

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while executing search query',
        details: 'Index service failure'
      });
    });
  });

  describe('getSearchSuggestions', () => {
    test('should return 400 if q parameter is missing', async () => {
      req.query = {};

      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Query prefix is required'
      });
    });

    test('should return 400 if q is not a string', async () => {
      req.query = { q: ['invalid'] };

      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Query prefix is required'
      });
    });

    test('should return 200 with empty data array if sanitized prefix length is less than 1', async () => {
      req.query = { q: '!!' };

      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    test('should return 200 with suggestions from SearchIndex.suggest', async () => {
      req.query = { q: 'lap' };
      const suggestSpy = jest.spyOn(SearchIndex, 'suggest').mockResolvedValueOnce(['laptop', 'laptop bag']);

      await getSearchSuggestions(req, res);

      expect(suggestSpy).toHaveBeenCalledWith('lap');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: ['laptop', 'laptop bag']
      });
    });

    test('should return 500 when SearchIndex.suggest throws an error', async () => {
      req.query = { q: 'lap' };
      jest.spyOn(SearchIndex, 'suggest').mockRejectedValueOnce(new Error('Suggestion timeout'));

      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve search suggestions',
        details: 'Suggestion timeout'
      });
    });
  });
});