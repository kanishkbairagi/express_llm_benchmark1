import { jest } from '@jest/globals';
import {
  createComment,
  getCommentsByPost,
  reactToComment,
  CommentModel
} from '../dataset/08_comment_controller.js';

describe('Comment Controller', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createComment', () => {
    test('should create a top‑level comment successfully', async () => {
      const req = {
        body: {
          postId: 'post_123',
          content: '   Nice post!   '
        },
        user: { id: 'user_1' }
      };
      const res = makeRes();

      const created = { id: 'cmt_1', postId: 'post_123', authorId: 'user_1', content: 'Nice post!', parentId: null };
      jest.spyOn(CommentModel, 'create').mockResolvedValue(created);
      jest.spyOn(CommentModel, 'findById'); // should not be called

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comment created',
        data: created
      });
      expect(CommentModel.findById).not.toHaveBeenCalled();
    });

    test('should reject when user is not authenticated', async () => {
      const req = { body: { postId: 'p', content: 'c' } };
      const res = makeRes();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should reject when postId is missing', async () => {
      const req = { body: { content: 'c' }, user: { id: 'u' } };
      const res = makeRes();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid postId is required'
      });
    });

    test('should reject when content is empty', async () => {
      const req = { body: { postId: 'p', content: '   ' }, user: { id: 'u' } };
      const res = makeRes();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment content cannot be empty'
      });
    });

    test('should reject when parent comment does not exist', async () => {
      const req = {
        body: { postId: 'p', content: 'c', parentId: 'nonexistent' },
        user: { id: 'u' }
      };
      const res = makeRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent comment not found'
      });
    });

    test('should reject when parent comment already has a parent (exceeds nesting depth)', async () => {
      const req = {
        body: { postId: 'p', content: 'c', parentId: 'parent_1' },
        user: { id: 'u' }
      };
      const res = makeRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({ id: 'parent_1', parentId: 'grandparent' });

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
      });
    });

    test('should create a reply when a valid parent is provided', async () => {
      const req = {
        body: { postId: 'p', content: 'reply', parentId: 'parent_1' },
        user: { id: 'u' }
      };
      const res = makeRes();

      const parent = { id: 'parent_1', parentId: null };
      const created = { id: 'cmt_2', postId: 'p', authorId: 'u', content: 'reply', parentId: 'parent_1' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(parent);
      jest.spyOn(CommentModel, 'create').mockResolvedValue(created);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reply created',
        data: created
      });
    });
  });

  describe('getCommentsByPost', () => {
    test('should return comments tree for a post', async () => {
      const req = { params: { postId: 'post_123' } };
      const res = makeRes();

      const flat = [
        { id: 'c1', postId: 'post_123', authorId: 'u1', content: 'root', parentId: null },
        { id: 'c2', postId: 'post_123', authorId: 'u2', content: 'reply', parentId: 'c1' },
        { id: 'c3', postId: 'post_123', authorId: 'u3', content: 'another root', parentId: null }
      ];

      jest.spyOn(CommentModel, 'findByPostId').mockResolvedValue(flat);

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.data.total).toBe(3);
      // root comments count should be 2
      expect(jsonArg.data.comments).toHaveLength(2);
      const rootIds = jsonArg.data.comments.map(c => c.id);
      expect(rootIds).toContain('c1');
      expect(rootIds).toContain('c3');
      // check that reply is nested under c1
      const c1 = jsonArg.data.comments.find(c => c.id === 'c1');
      expect(c1.replies).toHaveLength(1);
      expect(c1.replies[0].id).toBe('c2');
    });

    test('should reject when postId param is missing', async () => {
      const req = { params: {} };
      const res = makeRes();

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post ID is required'
      });
    });
  });

  describe('reactToComment', () => {
    test('should add reaction successfully', async () => {
      const req = {
        params: { commentId: 'cmt_1' },
        body: { reactionType: 'Like' },
        user: { id: 'user_5' }
      };
      const res = makeRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({ id: 'cmt_1' });
      const updated = { id: 'cmt_1', reactions: { like: 1 } };
      jest.spyOn(CommentModel, 'addReaction').mockResolvedValue(updated);

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reaction "Like" updated',
        data: updated
      });
    });

    test('should reject when unauthenticated', async () => {
      const req = { params: { commentId: 'cmt' }, body: { reactionType: 'like' } };
      const res = makeRes();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should reject when reaction type is invalid', async () => {
      const req = {
        params: { commentId: 'cmt' },
        body: { reactionType: 'angry' },
        user: { id: 'u' }
      };
      const res = makeRes();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid reaction')
      });
    });

    test('should reject when comment does not exist', async () => {
      const req = {
        params: { commentId: 'missing' },
        body: { reactionType: 'like' },
        user: { id: 'u' }
      };
      const res = makeRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found'
      });
    });
  });
});