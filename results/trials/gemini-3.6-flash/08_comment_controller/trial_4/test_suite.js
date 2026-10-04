import { jest } from '@jest/globals';
import { createComment, getCommentsByPost, reactToComment, CommentModel } from '../dataset/08_comment_controller.js';

describe('Comment Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      params: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('CommentModel default implementations', () => {
    it('should execute default model methods without throwing', async () => {
      await expect(CommentModel.findById('1')).resolves.toBeNull();
      await expect(CommentModel.findByPostId('1')).resolves.toEqual([]);
      const created = await CommentModel.create({ content: 'test' });
      expect(created.content).toBe('test');
      expect(created.id).toBeDefined();
      const reacted = await CommentModel.addReaction('c1', 'u1', 'like');
      expect(reacted).toEqual({ id: 'c1', reactions: { like: 1 } });
    });
  });

  describe('createComment', () => {
    it('should return 401 if user is not authenticated', async () => {
      req.body = { postId: 'p123', content: 'Hello' };

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should accept authorId in body if req.user is absent', async () => {
      req.body = { authorId: 'u123', postId: 'p123', content: 'Hello' };
      jest.spyOn(CommentModel, 'create').mockResolvedValueOnce({ id: 'c1', content: 'Hello' });

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comment created',
        data: { id: 'c1', content: 'Hello' }
      });
    });

    it('should return 400 if postId is missing or not a string', async () => {
      req.user = { id: 'u123' };
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

    it('should return 400 if content is missing, not a string, or empty', async () => {
      req.user = { id: 'u123' };
      req.body = { postId: 'p123' };

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment content cannot be empty'
      });

      req.body = { postId: 'p123', content: '   ' };
      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if content exceeds 1000 characters', async () => {
      req.user = { id: 'u123' };
      req.body = { postId: 'p123', content: 'a'.repeat(1001) };

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment cannot exceed 1000 characters'
      });
    });

    it('should return 404 if parent comment is not found', async () => {
      req.user = { id: 'u123' };
      req.body = { postId: 'p123', content: 'Reply', parentId: 'parent_999' };
      jest.spyOn(CommentModel, 'findById').mockResolvedValueOnce(null);

      await createComment(req, res);

      expect(CommentModel.findById).toHaveBeenCalledWith('parent_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent comment not found'
      });
    });

    it('should return 400 if max nesting depth is exceeded (parent already has parentId)', async () => {
      req.user = { id: 'u123' };
      req.body = { postId: 'p123', content: 'Nested Reply', parentId: 'reply_123' };
      jest.spyOn(CommentModel, 'findById').mockResolvedValueOnce({
        id: 'reply_123',
        parentId: 'root_123',
        content: 'I am a reply'
      });

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
      });
    });

    it('should create a valid nested reply when parent has no parentId', async () => {
      req.user = { id: 'u123' };
      req.body = { postId: 'p123', content: ' Valid Reply ', parentId: 'root_123' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValueOnce({
        id: 'root_123',
        parentId: null,
        content: 'Root comment'
      });

      const newComment = { id: 'reply_1', postId: 'p123', authorId: 'u123', content: 'Valid Reply', parentId: 'root_123' };
      jest.spyOn(CommentModel, 'create').mockResolvedValueOnce(newComment);

      await createComment(req, res);

      expect(CommentModel.create).toHaveBeenCalledWith({
        postId: 'p123',
        authorId: 'u123',
        content: 'Valid Reply',
        parentId: 'root_123'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reply created',
        data: newComment
      });
    });

    it('should return 500 when an exception occurs', async () => {
      req.user = { id: 'u123' };
      req.body = { postId: 'p123', content: 'Test' };
      jest.spyOn(CommentModel, 'create').mockRejectedValueOnce(new Error('Database error'));

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
    it('should return 400 if postId parameter is missing', async () => {
      req.params = {};

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post ID is required'
      });
    });

    it('should retrieve and build nested comment tree correctly', async () => {
      req.params = { postId: 'p100' };

      const flatComments = [
        { id: 'c1', parentId: null, content: 'Root 1' },
        { id: 'c2', parentId: 'c1', content: 'Reply to Root 1' },
        { id: 'c3', parentId: null, content: 'Root 2' },
        { id: 'c4', parentId: 'non_existent', content: 'Orphan comment' }
      ];

      jest.spyOn(CommentModel, 'findByPostId').mockResolvedValueOnce(flatComments);

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 4,
          comments: [
            {
              id: 'c1',
              parentId: null,
              content: 'Root 1',
              replies: [
                { id: 'c2', parentId: 'c1', content: 'Reply to Root 1', replies: [] }
              ]
            },
            { id: 'c3', parentId: null, content: 'Root 2', replies: [] },
            { id: 'c4', parentId: 'non_existent', content: 'Orphan comment', replies: [] }
          ]
        }
      });
    });

    it('should return 500 when database operation fails', async () => {
      req.params = { postId: 'p100' };
      jest.spyOn(CommentModel, 'findByPostId').mockRejectedValueOnce(new Error('Fetch failed'));

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve comments',
        details: 'Fetch failed'
      });
    });
  });

  describe('reactToComment', () => {
    it('should return 401 if user is not authenticated', async () => {
      req.params = { commentId: 'c1' };
      req.body = { reactionType: 'like' };

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if commentId parameter is missing', async () => {
      req.user = { id: 'u1' };
      req.params = {};
      req.body = { reactionType: 'like' };

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment ID is required'
      });
    });

    it('should return 400 if reactionType is missing or invalid', async () => {
      req.user = { id: 'u1' };
      req.params = { commentId: 'c1' };
      req.body = { reactionType: 'dislike' };

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid reaction. Allowed: like, love, insightful, celebrate'
      });
    });

    it('should return 404 if comment is not found', async () => {
      req.user = { id: 'u1' };
      req.params = { commentId: 'c999' };
      req.body = { reactionType: 'LOVE' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValueOnce(null);

      await reactToComment(req, res);

      expect(CommentModel.findById).toHaveBeenCalledWith('c999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found'
      });
    });

    it('should process reaction successfully with case-insensitive reactionType', async () => {
      req.body = { userId: 'u1', reactionType: 'INSIGHTFUL' };
      req.params = { commentId: 'c1' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValueOnce({ id: 'c1' });
      jest.spyOn(CommentModel, 'addReaction').mockResolvedValueOnce({
        id: 'c1',
        reactions: { insightful: 1 }
      });

      await reactToComment(req, res);

      expect(CommentModel.addReaction).toHaveBeenCalledWith('c1', 'u1', 'insightful');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reaction "INSIGHTFUL" updated',
        data: { id: 'c1', reactions: { insightful: 1 } }
      });
    });

    it('should return 500 when an exception occurs', async () => {
      req.user = { id: 'u1' };
      req.params = { commentId: 'c1' };
      req.body = { reactionType: 'like' };

      jest.spyOn(CommentModel, 'findById').mockRejectedValueOnce(new Error('Connection error'));

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process reaction',
        details: 'Connection error'
      });
    });
  });
});