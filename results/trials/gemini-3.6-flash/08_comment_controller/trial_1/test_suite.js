import { jest } from '@jest/globals';
import {
  createComment,
  getCommentsByPost,
  reactToComment,
  CommentModel
} from '../dataset/08_comment_controller.js';

describe('08_comment_controller unit tests', () => {
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
    jest.restoreAllMocks();
  });

  describe('createComment', () => {
    it('should return 401 if user is not authenticated', async () => {
      req.body = { postId: 'post1', content: 'hello' };
      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should authenticate via req.body.authorId if req.user is absent', async () => {
      req.body = { authorId: 'user1', postId: 'post1', content: 'hello' };
      jest.spyOn(CommentModel, 'create').mockResolvedValue({ id: 'cmt1' });

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 400 if postId is missing or not a string', async () => {
      req.user = { id: 'user1' };
      req.body = { content: 'hello' };

      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid postId is required'
      });

      req.body = { postId: 123, content: 'hello' };
      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if content is empty or whitespace or not a string', async () => {
      req.user = { id: 'user1' };
      req.body = { postId: 'post1', content: '   ' };

      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment content cannot be empty'
      });

      req.body = { postId: 'post1', content: 123 };
      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if content exceeds 1000 characters', async () => {
      req.user = { id: 'user1' };
      req.body = { postId: 'post1', content: 'a'.repeat(1001) };

      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment cannot exceed 1000 characters'
      });
    });

    it('should return 404 if parent comment does not exist', async () => {
      req.user = { id: 'user1' };
      req.body = { postId: 'post1', content: 'reply', parentId: 'parent1' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent comment not found'
      });
    });

    it('should return 400 if parent comment is already a reply (depth limit)', async () => {
      req.user = { id: 'user1' };
      req.body = { postId: 'post1', content: 'nested reply', parentId: 'parent1' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({
        id: 'parent1',
        parentId: 'grandparent1'
      });

      await createComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
      });
    });

    it('should create a reply successfully when parentId is valid', async () => {
      req.user = { id: 'user1' };
      req.body = { postId: 'post1', content: '  valid reply  ', parentId: 'parent1' };

      const parentComment = { id: 'parent1', parentId: null };
      const createdComment = { id: 'cmt2', postId: 'post1', authorId: 'user1', content: 'valid reply', parentId: 'parent1' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(parentComment);
      jest.spyOn(CommentModel, 'create').mockResolvedValue(createdComment);

      await createComment(req, res);

      expect(CommentModel.create).toHaveBeenCalledWith({
        postId: 'post1',
        authorId: 'user1',
        content: 'valid reply',
        parentId: 'parent1'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reply created',
        data: createdComment
      });
    });

    it('should create a top-level comment successfully', async () => {
      req.user = { id: 'user1' };
      req.body = { postId: 'post1', content: 'Top comment' };

      const createdComment = { id: 'cmt1', postId: 'post1', authorId: 'user1', content: 'Top comment', parentId: null };
      jest.spyOn(CommentModel, 'create').mockResolvedValue(createdComment);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comment created',
        data: createdComment
      });
    });

    it('should handle internal errors gracefully', async () => {
      req.user = { id: 'user1' };
      req.body = { postId: 'post1', content: 'Test comment' };

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
    it('should return 400 if postId is missing', async () => {
      req.params = {};

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post ID is required'
      });
    });

    it('should build and return comment tree structure correctly', async () => {
      req.params = { postId: 'post1' };

      const flatComments = [
        { id: 'c1', parentId: null, content: 'First' },
        { id: 'c2', parentId: 'c1', content: 'Reply to First' },
        { id: 'c3', parentId: null, content: 'Second' },
        { id: 'c4', parentId: 'orphan', content: 'Orphan reply' }
      ];

      jest.spyOn(CommentModel, 'findByPostId').mockResolvedValue(flatComments);

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
              content: 'First',
              replies: [
                { id: 'c2', parentId: 'c1', content: 'Reply to First', replies: [] }
              ]
            },
            { id: 'c3', parentId: null, content: 'Second', replies: [] },
            { id: 'c4', parentId: 'orphan', content: 'Orphan reply', replies: [] }
          ]
        }
      });
    });

    it('should handle internal errors gracefully', async () => {
      req.params = { postId: 'post1' };
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

    it('should return 400 if commentId is missing', async () => {
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

    it('should return 400 for invalid or missing reactionType', async () => {
      req.user = { id: 'u1' };
      req.params = { commentId: 'c1' };

      req.body = { reactionType: 'angry' };
      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid reaction. Allowed: like, love, insightful, celebrate'
      });

      req.body = {};
      await reactToComment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if comment is not found', async () => {
      req.user = { id: 'u1' };
      req.params = { commentId: 'c1' };
      req.body = { reactionType: 'LIKE' };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found'
      });
    });

    it('should add reaction successfully and return 200', async () => {
      req.body = { userId: 'u1', reactionType: 'LOVE' };
      req.params = { commentId: 'c1' };

      const existingComment = { id: 'c1' };
      const updatedComment = { id: 'c1', reactions: { love: 1 } };

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(existingComment);
      jest.spyOn(CommentModel, 'addReaction').mockResolvedValue(updatedComment);

      await reactToComment(req, res);

      expect(CommentModel.addReaction).toHaveBeenCalledWith('c1', 'u1', 'love');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reaction "LOVE" updated',
        data: updatedComment
      });
    });

    it('should handle internal errors gracefully', async () => {
      req.user = { id: 'u1' };
      req.params = { commentId: 'c1' };
      req.body = { reactionType: 'like' };

      jest.spyOn(CommentModel, 'findById').mockRejectedValue(new Error('DB failure'));

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process reaction',
        details: 'DB failure'
      });
    });
  });

  describe('CommentModel default implementations', () => {
    it('should test fallback method implementations of CommentModel', async () => {
      await expect(CommentModel.findById('1')).resolves.toBeNull();
      await expect(CommentModel.findByPostId('1')).resolves.toEqual([]);
      
      const created = await CommentModel.create({ content: 'test' });
      expect(created).toHaveProperty('id');
      expect(created.content).toBe('test');

      const reacted = await CommentModel.addReaction('c1', 'u1', 'like');
      expect(reacted).toEqual({
        id: 'c1',
        reactions: { like: 1 }
      });
    });
  });
});