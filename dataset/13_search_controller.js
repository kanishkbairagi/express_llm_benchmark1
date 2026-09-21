// 13_search_controller.js - Full-Text Search across Products

// Mock Search Index & Database
export const SearchIndex = {
  search: async ({ query, filters, page, limit }) => ({
    totalHits: 0,
    tookMs: 12,
    hits: [],
    facets: {
      categories: {},
      priceRanges: {}
    }
  }),
  suggest: async (prefix) => []
};

const sanitizeSearchQuery = (term) => {
  return term.replace(/[+\-=&|><!(){}[\]^"~*?:\\\/]/g, ' ').trim();
};

export const searchProducts = async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, page = 1, limit = 20 } = req.query || {};

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    }

    const cleanQuery = sanitizeSearchQuery(q);
    if (cleanQuery.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 alphanumeric characters'
      });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Pagination parameters invalid: page >= 1, 1 <= limit <= 100'
      });
    }

    const filters = {};
    if (category) filters.category = category.trim();
    if (minPrice) filters.minPrice = parseFloat(minPrice);
    if (maxPrice) filters.maxPrice = parseFloat(maxPrice);

    const searchResults = await SearchIndex.search({
      query: cleanQuery,
      filters,
      page: pageNum,
      limit: limitNum
    });

    return res.status(200).json({
      success: true,
      query: cleanQuery,
      data: {
        total: searchResults.totalHits,
        tookMs: searchResults.tookMs,
        page: pageNum,
        limit: limitNum,
        items: searchResults.hits,
        facets: searchResults.facets
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'An error occurred while executing search query',
      details: error.message
    });
  }
};

export const getSearchSuggestions = async (req, res) => {
  try {
    const { q } = req.query || {};

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query prefix is required'
      });
    }

    const prefix = sanitizeSearchQuery(q);
    if (prefix.length < 1) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    const suggestions = await SearchIndex.suggest(prefix);

    return res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve search suggestions',
      details: error.message
    });
  }
};
