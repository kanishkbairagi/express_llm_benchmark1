import { jest } from '@jest/globals';
import {
  createComment,
  getCommentsByPost,
  reactToComment,
  CommentModel
} from '../dataset/08_comment_controller.js';

describe('Comment Controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createComment', () => {
    it('should create a root comment successfully', async () => {
      const req = {
        body: {
          postId: 'post_123',
          content: '  Nice post!  ',
          authorId: 'user_1'
        }
      };
      const res = mockRes();

      const created = { id: 'cmt_1', postId: 'post_123', authorId: 'user_1', content: 'Nice post!', parentId: null };
      jest.spyOn(CommentModel, 'create').mockResolvedValue(created);
      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null); // not used for root

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Comment created',
          data: created
        })
      );
      expect(CommentModel.create).toHaveBeenCalledWith({
        postId: 'post_123',
        authorId: 'user_1',
        content: 'Nice post!',
        parentId: null
      });
    });

    it('should return 401 when authentication is missing', async () => {
      const req = { body: { postId: 'post_123', content: 'test' } };
      const res = mockRes();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Authentication required' })
      );
    });

    it('should return 400 for invalid postId', async () => {
      const req = { body: { postId: 123, content: 'test', authorId: 'u1' } };
      const res = mockRes();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Valid postId is required' })
      );
    });

    it('should return 400 for empty content', async () => {
      const req = { body: { postId: 'p1', content: '   ', authorId: 'u1' } };
      const res = mockRes();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Comment content cannot be empty' })
      );
    });

    it('should return 400 when content exceeds 1000 characters', async () => {
      const longContent = 'a'.repeat(1001);
      const req = { body: { postId: 'p1', content: longContent, authorId: 'u1' } };
      const res = mockRes();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Comment cannot exceed 1000 characters' })
      );
    });

    it('should return 404 when parent comment does not exist', async () => {
      const req = {
        body: { postId: 'p1', content: 'reply', authorId: 'u1', parentId: 'cmt_missing' }
      };
      const res = mockRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Parent comment not found' })
      );
    });

    it('should return 400 when nesting depth exceeds one level', async () => {
      const parentComment = { id: 'cmt_parent', parentId: 'cmt_grand' };
      const req = {
        body: { postId: 'p1', content: 'reply', authorId: 'u1', parentId: 'cmt_parent' }
      };
      const res = mockRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(parentComment);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error:
            'Maximum nesting depth reached: nesting is restricted to one level of replies'
        })
      );
    });

    it('should create a reply when parent comment is valid', async () => {
      const parentComment = { id: 'cmt_parent', parentId: null };
      const req = {
        body: { postId: 'p1', content: 'reply', authorId: 'u1', parentId: 'cmt_parent' }
      };
      const res = mockRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(parentComment);
      const created = { id: 'cmt_reply', postId: 'p1', authorId: 'u1', content: 'reply', parentId: 'cmt_parent' };
      jest.spyOn(CommentModel, 'create').mockResolvedValue(created);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Reply created',
          data: created
        })
      );
      expect(CommentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'cmt_parent' })
      );
    });
  });

  describe('getCommentsByPost', () => {
    it('should retrieve comments and build a tree', async () => {
      const flat = [
        { id: 'c1', postId: 'p1', parentId: null, content: 'root1' },
        { id: 'c2', postId: 'p1', parentId: null, content: 'root2' },
        { id: 'c3', postId: 'p1', parentId: 'c1', content: 'reply1' }
      ];
      const req = { params: { postId: 'p1' } };
      const res = mockRes();

      jest.spyOn(CommentModel, 'findByPostId').mockResolvedValue(flat);

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.data.total).toBe(3);
      expect(jsonArg.data.comments).toHaveLength(2);
      const root1 = jsonArg.data.comments.find(c => c.id === 'c1');
      expect(root1.replies).toHaveLength(1);
      expect(root1.replies[0].id).toBe('c3');
    });

    it('should return 400 when postId param is missing', async () => {
      const req = { params: {} };
      const res = mockRes();

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Post ID is required' })
      );
    });

    it('should return 500 on unexpected error', async () => {
      const req = { params: { postId: 'p1' } };
      const res = mockRes();

      jest.spyOn(CommentModel, 'findByPostId').mockRejectedValue(new Error('DB fail'));

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Failed to retrieve comments' })
      );
    });
  });

  describe('reactToComment', () => {
    it('should add a reaction successfully', async () => {
      const req = {
        params: { commentId: 'c1' },
        body: { reactionType: 'Like' },
        user: { id: 'u1' }
      };
      const res = mockRes();

      const comment = { id: 'c1', content: 'test' };
      jest.spyOn(CommentModel, 'findById').mockResolvedValue(comment);
      const updated = { id: 'c1', reactions: { like: 1 } };
      jest.spyOn(CommentModel, 'addReaction').mockResolvedValue(updated);

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Reaction "Like" updated',
          data: updated
        })
      );
      expect(CommentModel.addReaction).toHaveBeenCalledWith('c1', 'u1', 'like');
    });

    it('should return 401 when not authenticated', async () => {
      const req = { params: { commentId: 'c1' }, body: { reactionType: 'like' } };
      const res = mockRes();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Authentication required' })
      );
    });

    it('should return 400 for invalid reaction type', async () => {
      const req = {
        params: { commentId: 'c1' },
        body: { reactionType: 'invalid' },
        user: { id: 'u1' }
      };
      const res = mockRes();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid reaction')
        })
      );
    });

    it('should return 404 when comment does not exist', async () => {
      const req = {
        params: { commentId: 'c_missing' },
        body: { reactionType: 'love' },
        user: { id: 'u1' }
      };
      const res = mockRes();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Comment not found' })
      );
    });

    it('should return 400 when commentId param is missing', async () => {
      const req = {
        params: {},
        body: { reactionType: 'like' },
        user: { id: 'u1' }
      };
      const res = mockRes();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Comment ID is required' })
      );
    });

    it('should return 500 on unexpected error', async () => {
      const req = {
        params: { commentId: 'c1' },
        body: { reactionType: 'like' },
        user: { id: 'u1' }
      };
      const res = mockRes();

      jest.spyOn(CommentModel, 'findById').mockRejectedValue(new Error('DB err'));

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith