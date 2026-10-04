import { jest } from '@jest/globals';
import {
  CommentModel,
  createComment,
  getCommentsByPost,
  reactToComment
} from '../dataset/08_comment_controller.js';

describe('08_comment_controller.js Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('createComment', () => {
    test('should return 401 if user is not authenticated (no user.id or authorId)', async () => {
      req.body = { postId: 'post_1', content: 'Hello' };

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if postId is missing or not a string', async () => {
      req.user = { id: 'user_1' };
      req.body = { content: 'Hello' };

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid postId is required'
      });

      req.body = { postId: 123, content: 'Hello' };
      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if content is missing, empty, or not a string', async () => {
      req.user = { id: 'user_1' };
      req.body = { postId: 'post_1', content: '   ' };

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment content cannot be empty'
      });

      req.body = { postId: 'post_1', content: 100 };
      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if content exceeds 1000 characters', async () => {
      req.user = { id: 'user_1' };
      req.body = {
        postId: 'post_1',
        content: 'a'.repeat(1001)
      };

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment cannot exceed 1000 characters'
      });
    });

    test('should return 404 if parentId is provided but parent comment is not found', async () => {
      req.user = { id: 'user_1' };
      req.body = {
        postId: 'post_1',
        content: 'Reply',
        parentId: 'parent_999'
      };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await createComment(req, res);

      expect(CommentModel.findById).toHaveBeenCalledWith('parent_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent comment not found'
      });
    });

    test('should return 400 if parent comment itself has a parentId (max nesting depth reached)', async () => {
      req.user = { id: 'user_1' };
      req.body = {
        postId: 'post_1',
        content: 'Nested reply',
        parentId: 'parent_2'
      };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({
        id: 'parent_2',
        parentId: 'parent_1',
        content: 'First reply'
      });

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
      });
    });

    test('should successfully create a root comment and return 201', async () => {
      req.body = {
        authorId: 'author_1',
        postId: 'post_1',
        content: '   Great post!   '
      };

      const mockCreated = {
        id: 'cmt_123',
        postId: 'post_1',
        authorId: 'author_1',
        content: 'Great post!',
        parentId: null
      };

      jest.spyOn(CommentModel, 'create').mockResolvedValue(mockCreated);

      await createComment(req, res);

      expect(CommentModel.create).toHaveBeenCalledWith({
        postId: 'post_1',
        authorId: 'author_1',
        content: 'Great post!',
        parentId: null
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comment created',
        data: mockCreated
      });
    });

    test('should successfully create a reply comment and return 201', async () => {
      req.user = { id: 'user_1' };
      req.body = {
        postId: 'post_1',
        content: 'I agree',
        parentId: 'parent_1'
      };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({
        id: 'parent_1',
        parentId: null,
        content: 'Top comment'
      });

      const mockCreated = {
        id: 'cmt_124',
        postId: 'post_1',
        authorId: 'user_1',
        content: 'I agree',
        parentId: 'parent_1'
      };

      jest.spyOn(CommentModel, 'create').mockResolvedValue(mockCreated);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reply created',
        data: mockCreated
      });
    });

    test('should return 500 when an exception occurs', async () => {
      req.user = { id: 'user_1' };
      req.body = { postId: 'post_1', content: 'Test' };

      jest.spyOn(CommentModel, 'create').mockRejectedValue(new Error('Database error'));

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create comment',
        details: 'Database error'
      });
    });
  });

  describe('getCommentsByPost', () => {
    test('should return 400 if postId parameter is missing', async () => {
      req.params = {};

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post ID is required'
      });
    });

    test('should structure comments into a nested tree and return 200', async () => {
      req.params = { postId: 'post_1' };

      const flatComments = [
        { id: 'c1', parentId: null, content: 'Comment 1' },
        { id: 'c2', parentId: 'c1', content: 'Reply 1.1' },
        { id: 'c3', parentId: null, content: 'Comment 2' },
        { id: 'c4', parentId: 'c999', content: 'Orphan comment' }
      ];

      jest.spyOn(CommentModel, 'findByPostId').mockResolvedValue(flatComments);

      await getCommentsByPost(req, res);

      expect(CommentModel.findByPostId).toHaveBeenCalledWith('post_1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 4,
          comments: [
            {
              id: 'c1',
              parentId: null,
              content: 'Comment 1',
              replies: [{ id: 'c2', parentId: 'c1', content: 'Reply 1.1', replies: [] }]
            },
            {
              id: 'c3',
              parentId: null,
              content: 'Comment 2',
              replies: []
            },
            {
              id: 'c4',
              parentId: 'c999',
              content: 'Orphan comment',
              replies: []
            }
          ]
        }
      });
    });

    test('should return 500 when an exception occurs', async () => {
      req.params = { postId: 'post_1' };

      jest.spyOn(CommentModel, 'findByPostId').mockRejectedValue(new Error('Fetch error'));

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve comments',
        details: 'Fetch error'
      });
    });
  });

  describe('reactToComment', () => {
    test('should return 401 if user is not authenticated', async () => {
      req.params = { commentId: 'cmt_1' };
      req.body = { reactionType: 'like' };

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if commentId parameter is missing', async () => {
      req.user = { id: 'user_1' };
      req.params = {};
      req.body = { reactionType: 'like' };

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment ID is required'
      });
    });

    test('should return 400 if reactionType is missing or invalid', async () => {
      req.user = { id: 'user_1' };
      req.params = { commentId: 'cmt_1' };

      req.body = { reactionType: '' };
      await reactToComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.body = { reactionType: 'dislike' };
      await reactToComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid reaction. Allowed: like, love, insightful, celebrate'
      });
    });

    test('should return 404 if comment is not found', async () => {
      req.body = { userId: 'user_1', reactionType: 'like' };
      req.params = { commentId: 'cmt_999' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await reactToComment(req, res);

      expect(CommentModel.findById).toHaveBeenCalledWith('cmt_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found'
      });
    });

    test('should successfully add a reaction and return 200', async () => {
      req.user = { id: 'user_1' };
      req.params = { commentId: 'cmt_1' };
      req.body = { reactionType: 'INSIGHTFUL' };

      const mockComment = { id: 'cmt_1', content: 'Nice post' };
      const mockUpdated = { id: 'cmt_1', reactions: { insightful: 1 } };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(mockComment);
      jest.spyOn(CommentModel, 'addReaction').mockResolvedValue(mockUpdated);

      await reactToComment(req, res);

      expect(CommentModel.addReaction).toHaveBeenCalledWith('cmt_1', 'user_1', 'insightful');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reaction "INSIGHTFUL" updated',
        data: mockUpdated
      });
    });

    test('should return 500 when an exception occurs', async () => {
      req.user = { id: 'user_1' };
      req.params = { commentId: 'cmt_1' };
      req.body = { reactionType: 'like' };

      jest.spyOn(CommentModel, 'findById').mockRejectedValue(new Error('Reaction failure'));

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process reaction',
        details: 'Reaction failure'
      });
    });
  });

  describe('CommentModel default implementations', () => {
    test('findById should resolve to null by default', async () => {
      const result = await CommentModel.findById('123');
      expect(result).toBeNull();
    });

    test('findByPostId should resolve to empty array by default', async () => {
      const result = await CommentModel.findByPostId('123');
      expect(result).toEqual([]);
    });

    test('create should resolve with new object by default', async () => {
      const result = await CommentModel.create({ content: 'test' });
      expect(result).toHaveProperty('id');
      expect(result.content).toBe('test');
    });

    test('addReaction should resolve with reaction counts by default', async () => {
      const result = await CommentModel.addReaction('c1', 'u1', 'like');
      expect(result).toEqual({ id: 'c1', reactions: { like: 1 } });
    });
  });
});