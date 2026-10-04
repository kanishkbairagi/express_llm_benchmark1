import { jest } from '@jest/globals';
import { searchProducts, getSearchSuggestions, SearchIndex } from '../dataset/13_search_controller.js';

describe('Search Controller & SearchIndex', () => {
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

  describe('SearchIndex (Default Methods)', () => {
    it('should execute default search method successfully', async () => {
      const result = await SearchIndex.search({ query: 'test', filters: {}, page: 1, limit: 10 });
      expect(result).toEqual({
        totalHits: 0,
        tookMs: 12,
        hits: [],
        facets: {
          categories: {},
          priceRanges: {}
        }
      });
    });

    it('should execute default suggest method successfully', async () => {
      const result = await SearchIndex.suggest('app');
      expect(result).toEqual([]);
    });
  });

  describe('searchProducts', () => {
    it('should return 400 if req.query is missing or "q" is not provided', async () => {
      req = {}; // req.query is undefined
      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    it('should return 400 if "q" is empty or only whitespace', async () => {
      req.query = { q: '   ' };
      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    it('should return 400 if "q" is not a string', async () => {
      req.query = { q: 123 };
      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    });

    it('should return 400 if sanitized query length is less than 2', async () => {
      req.query = { q: 'a+!' }; // sanitizes to 'a'
      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search query must be at least 2 alphanumeric characters'
      });
    });

    it('should return 400 for invalid page parameter (page < 1 or NaN)', async () => {
      req.query = { q: 'laptop', page: 'invalid' };
      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
      });

      req.query = { q: 'laptop', page: 0 };
      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid limit parameter (limit < 1, limit > 100, or NaN)', async () => {
      req.query = { q: 'laptop', limit: 0 };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { q: 'laptop', limit: 101 };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { q: 'laptop', limit: 'abc' };
      await searchProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should successfully search products with default pagination and filters', async () => {
      const mockSearchResults = {
        totalHits: 2,
        tookMs: 15,
        hits: [{ id: 1, name: 'Phone' }, { id: 2, name: 'Smartphone' }],
        facets: { categories: { Electronics: 2 }, priceRanges: {} }
      };

      jest.spyOn(SearchIndex, 'search').mockResolvedValueOnce(mockSearchResults);

      req.query = { q: 'phone' };
      await searchProducts(req, res);

      expect(SearchIndex.search).toHaveBeenCalledWith({
        query: 'phone',
        filters: {},
        page: 1,
        limit: 20
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        query: 'phone',
        data: {
          total: 2,
          tookMs: 15,
          page: 1,
          limit: 20,
          items: mockSearchResults.hits,
          facets: mockSearchResults.facets
        }
      });
    });

    it('should correctly parse filters (category, minPrice, maxPrice) and custom pagination', async () => {
      const mockSearchResults = {
        totalHits: 1,
        tookMs: 5,
        hits: [{ id: 1, name: 'Pro Laptop' }],
        facets: {}
      };

      jest.spyOn(SearchIndex, 'search').mockResolvedValueOnce(mockSearchResults);

      req.query = {
        q: 'laptop + pro!',
        category: ' Electronics ',
        minPrice: '500.50',
        maxPrice: '2000',
        page: '2',
        limit: '10'
      };

      await searchProducts(req, res);

      expect(SearchIndex.search).toHaveBeenCalledWith({
        query: 'laptop   pro',
        filters: {
          category: 'Electronics',
          minPrice: 500.50,
          maxPrice: 2000
        },
        page: 2,
        limit: 10
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle internal errors from SearchIndex.search', async () => {
      jest.spyOn(SearchIndex, 'search').mockRejectedValueOnce(new Error('Index connection failed'));

      req.query = { q: 'test query' };
      await searchProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while executing search query',
        details: 'Index connection failed'
      });
    });
  });

  describe('getSearchSuggestions', () => {
    it('should return 400 if req.query is missing or "q" is not provided', async () => {
      req = {};
      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Query prefix is required'
      });
    });

    it('should return 400 if "q" is empty string or not a string', async () => {
      req.query = { q: '   ' };
      await getSearchSuggestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { q: 12345 };
      await getSearchSuggestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return empty suggestions list if sanitized prefix length is less than 1', async () => {
      req.query = { q: '+++' }; // sanitizeSearchQuery turns '+++' into ''
      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should return suggestions successfully', async () => {
      const mockSuggestions = ['apple', 'appliance', 'application'];
      jest.spyOn(SearchIndex, 'suggest').mockResolvedValueOnce(mockSuggestions);

      req.query = { q: 'app' };
      await getSearchSuggestions(req, res);

      expect(SearchIndex.suggest).toHaveBeenCalledWith('app');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSuggestions
      });
    });

    it('should handle internal errors from SearchIndex.suggest', async () => {
      jest.spyOn(SearchIndex, 'suggest').mockRejectedValueOnce(new Error('Suggestion engine failure'));

      req.query = { q: 'app' };
      await getSearchSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve search suggestions',
        details: 'Suggestion engine failure'
      });
    });
  });
});