import { jest } from '@jest/globals';
import {
  getCategoryTree,
  createCategory,
  getCategoryPath,
  CategoryModel
} from '../dataset/15_category_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getCategoryTree', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should return hierarchical tree for flat list', async () => {
    const flat = [
      { id: 'root', parentId: null, name: 'Root' },
      { id: 'child1', parentId: 'root', name: 'Child 1' },
      { id: 'child2', parentId: 'root', name: 'Child 2' },
      { id: 'grand', parentId: 'child1', name: 'Grandchild' }
    ];
    jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(flat);

    const req = {};
    const res = mockResponse();

    await getCategoryTree(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(1);
    const root = payload.data[0];
    expect(root.id).toBe('root');
    expect(root.children).toHaveLength(2);
    const child1 = root.children.find(c => c.id === 'child1');
    expect(child1.children).toHaveLength(1);
    expect(child1.children[0].id).toBe('grand');
  });

  test('should handle empty category list', async () => {
    jest.spyOn(CategoryModel, 'findAll').mockResolvedValue([]);

    const req = {};
    const res = mockResponse();

    await getCategoryTree(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual([]);
  });

  test('should return 500 on database error', async () => {
    jest.spyOn(CategoryModel, 'findAll').mockRejectedValue(new Error('db fail'));

    const req = {};
    const res = mockResponse();

    await getCategoryTree(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Failed to construct category tree');
    expect(payload.details).toBe('db fail');
  });
});

describe('createCategory', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseReq = (body) => ({ body });

  test('creates category without parent', async () => {
    const body = { name: 'New Cat', slug: 'new-cat' };
    jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
    jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
      id: 'generated',
      ...data,
      createdAt: new Date()
    }));

    const req = baseReq(body);
    const res = mockResponse();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.name).toBe('New Cat');
    expect(payload.data.parentId).toBeNull();
  });

  test('creates category with existing parent', async () => {
    const body = { name: 'Child', slug: 'child', parentId: 'parent1' };
    jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
    jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => {
      return id === 'parent1' ? { id: 'parent1', name: 'Parent' } : null;
    });
    jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
      id: 'generated',
      ...data,
      createdAt: new Date()
    }));

    const req = baseReq(body);
    const res = mockResponse();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.parentId).toBe('parent1');
  });

  test('fails when name is missing', async () => {
    const req = baseReq({ slug: 'no-name' });
    const res = mockResponse();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Category name is required');
  });

  test('fails when slug is invalid', async () => {
    const req = baseReq({ name: 'Bad', slug: 'Invalid Slug!' });
    const res = mockResponse();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe(
      'Valid URL-friendly slug (lowercase letters, numbers, hyphens) is required'
    );
  });

  test('fails on duplicate slug', async () => {
    const req = baseReq({ name: 'Dup', slug: 'dup-slug' });
    jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue({ id: 'existing' });

    const res = mockResponse();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Category with slug "dup-slug" already exists');
  });

  test('fails when parent does not exist', async () => {
    const req = baseReq({ name: 'Orphan', slug: 'orphan', parentId: 'missing' });
    jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
    jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);

    const res = mockResponse();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Parent category with ID missing does not exist');
  });

  test('returns 500 on unexpected error', async () => {
    const req = baseReq({ name: 'Err', slug: 'err' });
    jest.spyOn(CategoryModel, 'findBySlug').mockRejectedValue(new Error('boom'));

    const res = mockResponse();

    await createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Failed to create category');
    expect(payload.details).toBe('boom');
  });
});

describe('getCategoryPath', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns full breadcrumb path', async () => {
    // Build chain: root -> middle -> leaf
    const chain = {
      leaf: { id: 'leaf', name: 'Leaf', slug: 'leaf', parentId: 'mid' },
      mid: { id: 'mid', name: 'Middle', slug: 'mid', parentId: 'root' },
      root: { id: 'root', name: 'Root', slug: 'root', parentId: null }
    };
    jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => chain[id]);

    const req = { params: { categoryId: 'leaf' } };
    const res = mockResponse();

    await getCategoryPath(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual([
      { id: 'root', name: 'Root', slug: 'root' },
      { id: 'mid', name: 'Middle', slug: 'mid' },
      { id: 'leaf', name: 'Leaf', slug: 'leaf' }
    ]);
  });

  test('returns 400 when categoryId missing', async () => {
    const req = { params: {} };
    const res = mockResponse();

    await getCategoryPath(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Category ID is required');
  });

  test('returns 404 when category not found', async () => {
    jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);
    const req = { params: { categoryId: 'unknown' } };
    const res = mockResponse();

    await getCategoryPath(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Category with ID unknown not found');
  });

  test('breaks cycle and returns partial breadcrumbs', async () => {
    // A <-> B cycle
    const data = {
      A: { id: 'A', name: 'A', slug: 'a', parentId: 'B' },
      B: { id: 'B', name: 'B', slug: 'b', parentId: 'A' }
    };
    jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => data[id]);

    const req = { params: { categoryId: 'A' } };
    const res = mockResponse();

    await getCategoryPath(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    // Should contain only the first visited node (A) before cycle detection stops
    expect(payload.data).toEqual([
      { id: 'A', name: 'A', slug: 'a' }
    ]);
  });

  test('returns 500 on internal error', async () => {
    jest.spyOn(CategoryModel, 'findById').mockRejectedValue(new Error('db err'));
    const req = { params: { categoryId: 'any' } };
    const res = mockResponse();

    await getCategoryPath(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Failed to retrieve category hierarchy path');
    expect(payload.details).toBe('db err');
  });
});