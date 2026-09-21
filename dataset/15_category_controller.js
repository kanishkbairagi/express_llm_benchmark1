// 15_category_controller.js - Hierarchical Category Tree Traversal

// Mock Database Model
export const CategoryModel = {
  findAll: async () => [],
  findById: async (id) => null,
  findBySlug: async (slug) => null,
  create: async (data) => ({ id: `cat_${Date.now()}`, ...data, createdAt: new Date() })
};

export const getCategoryTree = async (req, res) => {
  try {
    const flatCategories = await CategoryModel.findAll();

    const categoryMap = new Map();
    flatCategories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    const rootCategories = [];

    categoryMap.forEach((category) => {
      if (category.parentId && categoryMap.has(category.parentId)) {
        categoryMap.get(category.parentId).children.push(category);
      } else {
        rootCategories.push(category);
      }
    });

    return res.status(200).json({
      success: true,
      data: rootCategories
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to construct category tree',
      details: error.message
    });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, slug, parentId, description } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Category name is required'
      });
    }

    if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({
        success: false,
        error: 'Valid URL-friendly slug (lowercase letters, numbers, hyphens) is required'
      });
    }

    const existingSlug = await CategoryModel.findBySlug(slug);
    if (existingSlug) {
      return res.status(409).json({
        success: false,
        error: `Category with slug "${slug}" already exists`
      });
    }

    let verifiedParentId = null;
    if (parentId) {
      const parentCategory = await CategoryModel.findById(parentId);
      if (!parentCategory) {
        return res.status(404).json({
          success: false,
          error: `Parent category with ID ${parentId} does not exist`
        });
      }
      verifiedParentId = parentId;
    }

    const newCategory = await CategoryModel.create({
      name: name.trim(),
      slug: slug.trim(),
      parentId: verifiedParentId,
      description: description ? description.trim() : null
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: newCategory
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to create category',
      details: error.message
    });
  }
};

export const getCategoryPath = async (req, res) => {
  try {
    const { categoryId } = req.params || {};

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        error: 'Category ID is required'
      });
    }

    let current = await CategoryModel.findById(categoryId);
    if (!current) {
      return res.status(404).json({
        success: false,
        error: `Category with ID ${categoryId} not found`
      });
    }

    const breadcrumbs = [];
    const visited = new Set();

    while (current) {
      if (visited.has(current.id)) {
        // Break cycle if malformed data
        break;
      }
      visited.add(current.id);
      breadcrumbs.unshift({
        id: current.id,
        name: current.name,
        slug: current.slug
      });

      if (current.parentId) {
        current = await CategoryModel.findById(current.parentId);
      } else {
        current = null;
      }
    }

    return res.status(200).json({
      success: true,
      data: breadcrumbs
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve category hierarchy path',
      details: error.message
    });
  }
};
