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
    test('should return 400 if q parameter is missing, empty, or not a string', async () => {
      // Missing q
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });

      // q is empty string
      req.query = { q: '   ' };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // q is not a string
      req.query = { q: 123 };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if req.query is undefined', async () => {
      const reqNoQuery = {};
      await searchProducts(reqNoQuery, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    test('should return 400 if sanitized search query length is less than 2 characters', async () => {
      req.query = { q: 'a+' }; // '+' becomes space, sanitized to 'a'
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query must be at least 2 alphanumeric characters'
      });
    });

    test('should return 400 for invalid pagination parameters', async () => {
      // Invalid page (< 1)
      req.query = { q: 'laptop', page: '0', limit: '20' };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
      });

      // Invalid page (NaN)
      req.query = { q: 'laptop', page: 'abc' };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Invalid limit (< 1)
      req.query = { q: 'laptop', limit: '0' };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Invalid limit (> 100)
      req.query = { q: 'laptop', limit: '101' };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Invalid limit (NaN)
      req.query = { q: 'laptop', limit: 'xyz' };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should execute search successfully with default pagination and filters', async () => {
      const mockResult = {
        totalHits: 2,
        tookMs: 15,
        hits: [{ id: 1, name: 'Laptop' }, { id: 2, name: 'Gaming Laptop' }],
        facets: { categories: { Electronics: 2 }, priceRanges: {} }
      };

      const spySearch = jest.spyOn(SearchIndex, 'search').mockResolvedValue(mockResult);

      req.query = { q: 'laptop (brand)' }; // Special characters like () should be sanitized

      await searchProducts(req, res);

      expect(spySearch).toHaveBeenCalledWith({
        query: 'laptop   brand',
        filters: {},
        page: 1,
        limit: 20
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        query: 'laptop   brand',
        data: {
          total: 2,
          tookMs: 15,
          page: 1,
          limit: 20,
          items: mockResult.hits,
          facets: mockResult.facets
        }
      });

      spySearch.mockRestore();
    });

    test('should apply category, minPrice, maxPrice filters correctly', async () => {
      const spySearch = jest.spyOn(SearchIndex, 'search').mockResolvedValue({
        totalHits: 1,
        tookMs: 10,
        hits: [{ id: 1 }],
        facets: {}
      });

      req.query = {
        q: 'phone',
        category: ' Electronics ',
        minPrice: '100.5',
        maxPrice: '500.0',
        page: '2',
        limit: '10'
      };

      await searchProducts(req, res);

      expect(spySearch).toHaveBeenCalledWith({
        query: 'phone',
        filters: {
          category: 'Electronics',
          minPrice: 100.5,
          maxPrice: 500.0
        },
        page: 2,
        limit: 10
      });

      expect(res.status).toHaveBeenCalledWith(200);

      spySearch.mockRestore();
    });

    test('should handle search index errors and return 500 status', async () => {
      const spySearch = jest.spyOn(SearchIndex, 'search').mockRejectedValue(new Error('Index unavailable'));

      req.query = { q: 'keyboard' };

      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while executing search query',
        details: 'Index unavailable'
      });

      spySearch.mockRestore();
    });
  });

  describe('getSearchSuggestions', () => {
    test('should return 400 if q parameter is missing, empty, or not a string', async () => {
      await getSearchSuggestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Query prefix is required'
      });

      req.query = { q: '   ' };
      await getSearchSuggestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { q: 123 };
      await getSearchSuggestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if req.query is undefined', async () => {
      const reqNoQuery = {};
      await getSearchSuggestions(reqNoQuery, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Query prefix is required'
      });
    });

    test('should return 200 with empty array if sanitized prefix length is less than 1', async () => {
      req.query = { q: '+++' }; // Sanitizes to empty string

      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    test('should return suggestions successfully', async () => {
      const mockSuggestions = ['laptop', 'laptop bag', 'laptop stand'];
      const spySuggest = jest.spyOn(SearchIndex, 'suggest').mockResolvedValue(mockSuggestions);

      req.query = { q: 'lap' };

      await getSearchSuggestions(req, res);

      expect(spySuggest).toHaveBeenCalledWith('lap');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSuggestions
      });

      spySuggest.mockRestore();
    });

    test('should handle suggestion errors and return 500 status', async () => {
      const spySuggest = jest.spyOn(SearchIndex, 'suggest').mockRejectedValue(new Error('Suggestion engine failure'));

      req.query = { q: 'phone' };

      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve search suggestions',
        details: 'Suggestion engine failure'
      });

      spySuggest.mockRestore();
    });
  });
});