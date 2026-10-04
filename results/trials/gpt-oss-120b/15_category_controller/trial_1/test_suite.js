import { jest } from '@jest/globals';
import {
  getCategoryTree,
  createCategory,
  getCategoryPath,
  CategoryModel
} from '../dataset/15_category_controller.js';

describe('Category Controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCategoryTree', () => {
    it('should build a hierarchical tree from flat categories', async () => {
      const flat = [
        { id: '1', name: 'Root', parentId: null },
        { id: '2', name: 'Child A', parentId: '1' },
        { id: '3', name: 'Child B', parentId: '1' },
        { id: '4', name: 'Grandchild', parentId: '2' }
      ];
      CategoryModel.findAll = jest.fn().mockResolvedValue(flat);

      const res = mockRes();

      await getCategoryTree({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      // root categories array length should be 1 (id 1)
      expect(payload.data).toHaveLength(1);
      const root = payload.data[0];
      expect(root.id).toBe('1');
      expect(root.children).toHaveLength(2);
      const childA = root.children.find(c => c.id === '2');
      expect(childA.children).toHaveLength(1);
      expect(childA.children[0].id).toBe('4');
    });

    it('should return empty array when no categories exist', async () => {
      CategoryModel.findAll = jest.fn().mockResolvedValue([]);

      const res = mockRes();

      await getCategoryTree({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should handle errors from the model', async () => {
      CategoryModel.findAll = jest.fn().mockRejectedValue(new Error('DB error'));

      const res = mockRes();

      await getCategoryTree({}, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Failed to construct category tree');
      expect(payload.details).toBe('DB error');
    });
  });

  describe('createCategory', () => {
    const baseReq = (body) => ({ body });

    it('should create a category without parent', async () => {
      CategoryModel.findBySlug = jest.fn().mockResolvedValue(null);
      CategoryModel.create = jest.fn().mockImplementation(async (data) => ({
        id: 'cat_123',
        ...data,
        createdAt: new Date()
      }));

      const res = mockRes();
      const req = baseReq({
        name: 'New Category',
        slug: 'new-category',
        description: 'Some description'
      });

      await createCategory(req, res);

      expect(CategoryModel.findBySlug).toHaveBeenCalledWith('new-category');
      expect(CategoryModel.create).toHaveBeenCalledWith({
        name: 'New Category',
        slug: 'new-category',
        parentId: null,
        description: 'Some description'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.id).toBe('cat_123');
    });

    it('should create a category with an existing parent', async () => {
      CategoryModel.findBySlug = jest.fn().mockResolvedValue(null);
      CategoryModel.findById = jest.fn().mockResolvedValue({ id: 'p1', name: 'Parent' });
      CategoryModel.create = jest.fn().mockResolvedValue({ id: 'cat_456' });

      const req = baseReq({
        name: 'Child',
        slug: 'child',
        parentId: 'p1'
      });
      const res = mockRes();

      await createCategory(req, res);

      expect(CategoryModel.findById).toHaveBeenCalledWith('p1');
      expect(CategoryModel.create).toHaveBeenCalledWith(expect.objectContaining({
        parentId: 'p1'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should reject missing name', async () => {
      const req = baseReq({ slug: 'no-name' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category name is required'
      });
    });

    it('should reject invalid slug format', async () => {
      const req = baseReq({ name: 'Test', slug: 'Invalid_Slug!' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid URL-friendly slug (lowercase letters, numbers, hyphens) is required'
      });
    });

    it('should detect duplicate slug', async () => {
      CategoryModel.findBySlug = jest.fn().mockResolvedValue({ id: 'existing' });

      const req = baseReq({ name: 'Dup', slug: 'dup' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with slug "dup" already exists'
      });
    });

    it('should return 404 when parent does not exist', async () => {
      CategoryModel.findBySlug = jest.fn().mockResolvedValue(null);
      CategoryModel.findById = jest.fn().mockResolvedValue(null);

      const req = baseReq({
        name: 'Orphan',
        slug: 'orphan',
        parentId: 'missing'
      });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent category with ID missing does not exist'
      });
    });

    it('should handle unexpected errors', async () => {
      CategoryModel.findBySlug = jest.fn().mockRejectedValue(new Error('boom'));

      const req = baseReq({ name: 'Err', slug: 'err' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Failed to create category');
      expect(payload.details).toBe('boom');
    });
  });

  describe('getCategoryPath', () => {
    const baseReq = (params) => ({ params });

    it('should return breadcrumbs from leaf to root', async () => {
      const chain = {
        a3: { id: 'a3', name: 'Level3', slug: 'lvl3', parentId: 'a2' },
        a2: { id: 'a2', name: 'Level2', slug: 'lvl2', parentId: 'a1' },
        a1: { id: 'a1', name: 'Root', slug: 'root', parentId: null }
      };
      CategoryModel.findById = jest.fn()
        .mockImplementation(async (id) => chain[id]);

      const req = baseReq({ categoryId: 'a3' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual([
        { id: 'a1', name: 'Root', slug: 'root' },
        { id: 'a2', name: 'Level2', slug: 'lvl2' },
        { id: 'a3', name: 'Level3', slug: 'lvl3' }
      ]);
    });

    it('should return 400 when categoryId missing', async () => {
      const req = baseReq({});
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category ID is required'
      });
    });

    it('should return 404 when category not found', async () => {
      CategoryModel.findById = jest.fn().mockResolvedValue(null);
      const req = baseReq({ categoryId: 'unknown' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with ID unknown not found'
      });
    });

    it('should break on cyclic parent references', async () => {
      const cyclic = {
        x1: { id: 'x1', name: 'Node1', slug: 'node1', parentId: 'x2' },
        x2: { id: 'x2', name: 'Node2', slug: 'node2', parentId: 'x1' }
      };
      CategoryModel.findById = jest.fn()
        .mockImplementation(async (id) => cyclic[id]);

      const req = baseReq({ categoryId: 'x1' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      // Should contain the two nodes without infinite loop
      expect(payload.data).toEqual([
        { id: 'x2', name: 'Node2', slug: 'node2' },
        { id: 'x1', name: 'Node1', slug: 'node1' }
      ]);
    });

    it('should handle unexpected errors', async () => {
      CategoryModel.findById = jest.fn().mockRejectedValue(new Error('oops'));

      const req = baseReq({ categoryId: 'any' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Failed to retrieve category hierarchy path');
      expect(payload.details).toBe('oops');
    });
  });
});