// 02_product_controller.js - E-commerce Filtering, Sorting & Pagination

// Mock Database Model
export const Product = {
  findAndCountAll: async (options) => ({
    count: 0,
    rows: []
  }),
  findById: async (id) => null
};

export const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      inStock
    } = req.query || {};

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Page parameter must be a positive integer'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit parameter must be between 1 and 100'
      });
    }

    const filters = {};

    if (category) {
      if (typeof category !== 'string' || category.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid category filter' });
      }
      filters.category = category.trim();
    }

    if (minPrice !== undefined) {
      const min = parseFloat(minPrice);
      if (isNaN(min) || min < 0) {
        return res.status(400).json({ success: false, error: 'minPrice must be a non-negative number' });
      }
      filters.minPrice = min;
    }

    if (maxPrice !== undefined) {
      const max = parseFloat(maxPrice);
      if (isNaN(max) || max < 0) {
        return res.status(400).json({ success: false, error: 'maxPrice must be a non-negative number' });
      }
      if (filters.minPrice !== undefined && max < filters.minPrice) {
        return res.status(400).json({ success: false, error: 'maxPrice cannot be less than minPrice' });
      }
      filters.maxPrice = max;
    }

    if (inStock !== undefined) {
      filters.inStock = inStock === 'true' || inStock === true;
    }

    const allowedSortFields = ['price', 'name', 'createdAt', 'rating'];
    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sortBy field. Allowed fields: ${allowedSortFields.join(', ')}`
      });
    }

    const normalizedSortOrder = sortOrder.toLowerCase();
    if (!['asc', 'desc'].includes(normalizedSortOrder)) {
      return res.status(400).json({
        success: false,
        error: 'sortOrder must be either "asc" or "desc"'
      });
    }

    const offset = (pageNum - 1) * limitNum;
    const { count, rows } = await Product.findAndCountAll({
      filters,
      sortBy,
      sortOrder: normalizedSortOrder,
      offset,
      limit: limitNum
    });

    const totalPages = Math.ceil(count / limitNum) || 1;

    return res.status(200).json({
      success: true,
      data: {
        items: rows,
        pagination: {
          totalItems: count,
          totalPages,
          currentPage: pageNum,
          limit: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve products',
      details: error.message
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params || {};

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required'
      });
    }

    const product = await Product.findById(id.trim());
    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Product with ID ${id} not found`
      });
    }

    return res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch product details',
      details: error.message
    });
  }
};
