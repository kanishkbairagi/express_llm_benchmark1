import { jest } from '@jest/globals';
import {
  CategoryModel,
  getCategoryTree,
  createCategory,
  getCategoryPath,
} from '../dataset/15_category_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Category Controller', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getCategoryTree', () => {
    test('should return hierarchical tree when categories are flat', async () => {
      const flat = [
        { id: '1', name: 'Root', parentId: null },
        { id: '2', name: 'Child A', parentId: '1' },
        { id: '3', name: 'Child B', parentId: '1' },
        { id: '4', name: 'Grandchild', parentId: '2' },
      ];
      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(flat);

      const req = {};
      const res = mockRes();

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      // root array should contain only the root category
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe('1');
      expect(response.data[0].children).toHaveLength(2);
      expect(response.data[0].children.find(c => c.id === '2').children[0].id).toBe('4');
    });

    test('should handle internal errors', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockRejectedValue(new Error('DB fail'));

      const req = {};
      const res = mockRes();

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Failed to construct category tree');
      expect(payload.details).toBe('DB fail');
    });
  });

  describe('createCategory', () => {
    const baseReq = (body) => ({ body });

    test('should reject when name is missing or empty', async () => {
      const req = baseReq({ slug: 'valid-slug' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('Category name is required');
    });

    test('should reject when slug is invalid', async () => {
      const req = baseReq({ name: 'Test', slug: 'Invalid Slug!' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toMatch(/Valid URL-friendly slug/);
    });

    test('should reject when slug already exists', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue({ id: 'existing' });

      const req = baseReq({ name: 'Test', slug: 'duplicate' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].error).toBe('Category with slug "duplicate" already exists');
    });

    test('should reject when parentId does not exist', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null); // parent not found

      const req = baseReq({ name: 'Child', slug: 'child', parentId: 'nonexistent' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error).toBe('Parent category with ID nonexistent does not exist');
    });

    test('should create category successfully without parent', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
        id: 'new-id',
        ...data,
        createdAt: new Date(),
      }));

      const req = baseReq({ name: '  New Category  ', slug: 'new-category', description: '  Desc ' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.id).toBe('new-id');
      expect(payload.data.name).toBe('New Category');
      expect(payload.data.slug).toBe('new-category');
      expect(payload.data.description).toBe('Desc');
      expect(payload.data.parentId).toBeNull();
    });

    test('should create category successfully with valid parent', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      const parent = { id: 'p1', name: 'Parent' };
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(parent);
      jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
        id: 'new-id-2',
        ...data,
        createdAt: new Date(),
      }));

      const req = baseReq({ name: 'Child', slug: 'child', parentId: 'p1' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data.parentId).toBe('p1');
    });

    test('should handle unexpected errors', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockRejectedValue(new Error('Unexpected'));

      const req = baseReq({ name: 'Test', slug: 'test' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error).toBe('Failed to create category');
      expect(res.json.mock.calls[0][0].details).toBe('Unexpected');
    });
  });

  describe('getCategoryPath', () => {
    test('should require categoryId param', async () => {
      const req = { params: {} };
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('Category ID is required');
    });

    test('should return 404 when category not found', async () => {
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);
      const req = { params: { categoryId: 'missing' } };
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error).toBe('Category with ID missing not found');
    });

    test('should return breadcrumb path for deep hierarchy', async () => {
      const chain = {
        g: { id: 'g', name: 'Grand', slug: 'grand', parentId: 'p' },
        p: { id: 'p', name: 'Parent', slug: 'parent', parentId: 'r' },
        r: { id: 'r', name: 'Root', slug: 'root', parentId: null },
      };
      jest.spyOn(CategoryModel, 'findById')
        .mockImplementation(async (id) => chain[id]);

      const req = { params: { categoryId: 'g' } };
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;
      expect(data).toEqual([
        { id: 'r', name: 'Root', slug: 'root' },
        { id: 'p', name: 'Parent', slug: 'parent' },
        { id: 'g', name: 'Grand', slug: 'grand' },
      ]);
    });

    test('should break on cyclic parent references', async () => {
      const cyclic = {
        a: { id: 'a', name: 'A', slug: 'a', parentId: 'b' },
        b: { id: 'b', name: 'B', slug: 'b', parentId: 'a' },
      };
      jest.spyOn(CategoryModel, 'findById')
        .mockImplementation(async (id) => cyclic[id]);

      const req = { params: { categoryId: 'a' } };
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const breadcrumbs = res.json.mock.calls[0][0].data;
      // Should contain only the first two entries before cycle detection stops
      expect(breadcrumbs).toEqual([
        { id: 'b', name: 'B', slug: 'b' },
        { id: 'a', name: 'A', slug: 'a' },
      ]);
    });

    test('should handle internal errors', async () => {
      jest.spyOn(CategoryModel, 'findById').mockRejectedValue(new Error('DB error'));

      const req = { params: { categoryId: 'any' } };
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error).toBe('Failed to retrieve category hierarchy path');
      expect(res.json.mock.calls[0][0].details).toBe('DB error');
    });
  });
});