import { jest } from '@jest/globals';
import {
  CategoryModel,
  getCategoryTree,
  createCategory,
  getCategoryPath
} from '../dataset/15_category_controller.js';

describe('Category Controller Unit Tests', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('CategoryModel Default Methods', () => {
    test('findAll returns empty array by default', async () => {
      const res = await CategoryModel.findAll();
      expect(res).toEqual([]);
    });

    test('findById returns null by default', async () => {
      const res = await CategoryModel.findById('123');
      expect(res).toBeNull();
    });

    test('findBySlug returns null by default', async () => {
      const res = await CategoryModel.findBySlug('test');
      expect(res).toBeNull();
    });

    test('create returns new object with id and createdAt', async () => {
      const data = { name: 'Test' };
      const res = await CategoryModel.create(data);
      expect(res).toHaveProperty('id');
      expect(res).toHaveProperty('createdAt');
      expect(res.name).toBe('Test');
    });
  });

  describe('getCategoryTree', () => {
    test('should return empty array when no categories exist', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue([]);

      const req = {};
      await getCategoryTree(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    test('should build nested category tree correctly', async () => {
      const flatList = [
        { id: '1', name: 'Electronics', parentId: null },
        { id: '2', name: 'Laptops', parentId: '1' },
        { id: '3', name: 'Gaming Laptops', parentId: '2' },
        { id: '4', name: 'Clothing', parentId: null }
      ];
      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(flatList);

      const req = {};
      await getCategoryTree(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0].data;

      expect(responseData.length).toBe(2);
      expect(responseData[0].id).toBe('1');
      expect(responseData[0].children.length).toBe(1);
      expect(responseData[0].children[0].id).toBe('2');
      expect(responseData[0].children[0].children.length).toBe(1);
      expect(responseData[0].children[0].children[0].id).toBe('3');
      expect(responseData[1].id).toBe('4');
      expect(responseData[1].children).toEqual([]);
    });

    test('should handle categories with orphan parentId as root categories', async () => {
      const flatList = [
        { id: '1', name: 'Subcategory', parentId: 'non-existent' }
      ];
      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(flatList);

      await getCategoryTree({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0].data;
      expect(responseData.length).toBe(1);
      expect(responseData[0].id).toBe('1');
    });

    test('should return 500 when database throws error', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockRejectedValue(new Error('Database error'));

      await getCategoryTree({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to construct category tree',
        details: 'Database error'
      });
    });
  });

  describe('createCategory', () => {
    test('should return 400 if name is missing or invalid', async () => {
      const invalidBodies = [
        {},
        { name: '' },
        { name: '   ' },
        { name: 123 }
      ];

      for (const body of invalidBodies) {
        await createCategory({ body }, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Category name is required'
        });
        jest.clearAllMocks();
      }
    });

    test('should return 400 if slug is missing or invalid format', async () => {
      const invalidSlugs = [
        { name: 'Valid Name' },
        { name: 'Valid Name', slug: '' },
        { name: 'Valid Name', slug: 'Invalid Slug' },
        { name: 'Valid Name', slug: 'INVALID_SLUG' },
        { name: 'Valid Name', slug: 'slug_with_underscore' },
        { name: 'Valid Name', slug: 123 }
      ];

      for (const body of invalidSlugs) {
        await createCategory({ body }, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Valid URL-friendly slug (lowercase letters, numbers, hyphens) is required'
        });
        jest.clearAllMocks();
      }
    });

    test('should return 409 if slug already exists', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue({ id: 'existing_cat', slug: 'electronics' });

      const req = {
        body: {
          name: 'Electronics',
          slug: 'electronics'
        }
      };

      await createCategory(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with slug "electronics" already exists'
      });
    });

    test('should return 404 if specified parentId does not exist', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);

      const req = {
        body: {
          name: 'Laptops',
          slug: 'laptops',
          parentId: 'parent_999'
        }
      };

      await createCategory(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent category with ID parent_999 does not exist'
      });
    });

    test('should create category successfully without parentId and description', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
        id: 'cat_100',
        ...data,
        createdAt: new Date()
      }));

      const req = {
        body: {
          name: '  Electronics  ',
          slug: 'electronics'
        }
      };

      await createCategory(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category created successfully',
        data: expect.objectContaining({
          id: 'cat_100',
          name: 'Electronics',
          slug: 'electronics',
          parentId: null,
          description: null
        })
      });
    });

    test('should create category successfully with valid parentId and trimmed description', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue({ id: 'cat_root', name: 'Tech' });
      jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
        id: 'cat_101',
        ...data,
        createdAt: new Date()
      }));

      const req = {
        body: {
          name: 'Laptops',
          slug: 'laptops',
          parentId: 'cat_root',
          description: '  All laptops  '
        }
      };

      await createCategory(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category created successfully',
        data: expect.objectContaining({
          name: 'Laptops',
          slug: 'laptops',
          parentId: 'cat_root',
          description: 'All laptops'
        })
      });
    });

    test('should return 500 when exception is thrown during creation', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockRejectedValue(new Error('DB failure'));

      const req = {
        body: {
          name: 'Laptops',
          slug: 'laptops'
        }
      };

      await createCategory(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create category',
        details: 'DB failure'
      });
    });

    test('should handle empty req.body gracefully', async () => {
      await createCategory({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category name is required'
      });
    });
  });

  describe('getCategoryPath', () => {
    test('should return 400 if categoryId parameter is missing', async () => {
      await getCategoryPath({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category ID is required'
      });
    });

    test('should return 404 if category is not found', async () => {
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);

      const req = { params: { categoryId: '999' } };
      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with ID 999 not found'
      });
    });

    test('should return breadcrumbs path for single root category', async () => {
      const category = { id: '1', name: 'Electronics', slug: 'electronics', parentId: null };
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(category);

      const req = { params: { categoryId: '1' } };
      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: '1', name: 'Electronics', slug: 'electronics' }
        ]
      });
    });

    test('should return breadcrumbs path for deeply nested category', async () => {
      const categories = {
        '3': { id: '3', name: 'Gaming Laptops', slug: 'gaming-laptops', parentId: '2' },
        '2': { id: '2', name: 'Laptops', slug: 'laptops', parentId: '1' },
        '1': { id: '1', name: 'Electronics', slug: 'electronics', parentId: null }
      };

      jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => categories[id] || null);

      const req = { params: { categoryId: '3' } };
      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: '1', name: 'Electronics', slug: 'electronics' },
          { id: '2', name: 'Laptops', slug: 'laptops' },
          { id: '3', name: 'Gaming Laptops', slug: 'gaming-laptops' }
        ]
      });
    });

    test('should prevent infinite loops when circular parent references exist', async () => {
      const categories = {
        '1': { id: '1', name: 'Cat 1', slug: 'cat-1', parentId: '2' },
        '2': { id: '2', name: 'Cat 2', slug: 'cat-2', parentId: '1' }
      };

      jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => categories[id] || null);

      const req = { params: { categoryId: '1' } };
      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: '2', name: 'Cat 2', slug: 'cat-2' },
          { id: '1', name: 'Cat 1', slug: 'cat-1' }
        ]
      });
    });

    test('should return 500 when database error occurs', async () => {
      jest.spyOn(CategoryModel, 'findById').mockRejectedValue(new Error('Path DB error'));

      const req = { params: { categoryId: '1' } };
      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve category hierarchy path',
        details: 'Path DB error'
      });
    });
  });
});