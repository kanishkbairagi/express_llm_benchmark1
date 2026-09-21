import { jest } from '@jest/globals';
import {
  createComment,
  getCommentsByPost,
  reactToComment,
  CommentModel
} from '../dataset/08_comment_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('08_comment_controller Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createComment', () => {
    it('should return 401 if user is not authenticated', async () => {
      const req = { body: { postId: 'post_1', content: 'Hello' } };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if postId is missing or not a string', async () => {
      const req = { user: { id: 'user_1' }, body: { content: 'Hello', postId: 123 } };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid postId is required'
      });
    });

    it('should return 400 if content is empty or whitespace only', async () => {
      const req = { user: { id: 'user_1' }, body: { postId: 'post_1', content: '   ' } };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment content cannot be empty'
      });
    });

    it('should return 400 if content exceeds 1000 characters', async () => {
      const req = {
        user: { id: 'user_1' },
        body: { postId: 'post_1', content: 'a'.repeat(1001) }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment cannot exceed 1000 characters'
      });
    });

    it('should return 404 if parent comment is not found', async () => {
      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      const req = {
        user: { id: 'user_1' },
        body: { postId: 'post_1', content: 'A reply', parentId: 'nonexistent' }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(CommentModel.findById).toHaveBeenCalledWith('nonexistent');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent comment not found'
      });
    });

    it('should return 400 if parent comment already has a parentId (nesting limit reached)', async () => {
      jest.spyOn(CommentModel, 'findById').mockResolvedValue({
        id: 'reply_1',
        parentId: 'root_1'
      });

      const req = {
        user: { id: 'user_1' },
        body: { postId: 'post_1', content: 'Nested too deep', parentId: 'reply_1' }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
      });
    });

    it('should create a top-level comment successfully', async () => {
      const createdObj = { id: 'cmt_1', postId: 'post_1', authorId: 'user_1', content: 'Hello' };
      jest.spyOn(CommentModel, 'create').mockResolvedValue(createdObj);

      const req = {
        body: { authorId: 'user_1', postId: 'post_1', content: '  Hello  ' }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(CommentModel.create).toHaveBeenCalledWith({
        postId: 'post_1',
        authorId: 'user_1',
        content: 'Hello',
        parentId: null
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comment created',
        data: createdObj
      });
    });

    it('should create a reply comment successfully', async () => {
      jest.spyOn(CommentModel, 'findById').mockResolvedValue({ id: 'root_1', parentId: null });
      const createdObj = { id: 'cmt_2', postId: 'post_1', authorId: 'user_1', content: 'Reply', parentId: 'root_1' };
      jest.spyOn(CommentModel, 'create').mockResolvedValue(createdObj);

      const req = {
        user: { id: 'user_1' },
        body: { postId: 'post_1', content: 'Reply', parentId: 'root_1' }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reply created',
        data: createdObj
      });
    });

    it('should return 500 when database throws an error', async () => {
      jest.spyOn(CommentModel, 'create').mockRejectedValue(new Error('DB connection failed'));

      const req = {
        user: { id: 'user_1' },
        body: { postId: 'post_1', content: 'Hello' }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create comment',
        details: 'DB connection failed'
      });
    });
  });

  describe('getCommentsByPost', () => {
    it('should return 400 if postId is missing', async () => {
      const req = { params: {} };
      const res = mockResponse();

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post ID is required'
      });
    });

    it('should retrieve comments and return a structured tree with replies', async () => {
      const flatComments = [
        { id: 'c1', postId: 'p1', content: 'Root 1', parentId: null },
        { id: 'c2', postId: 'p1', content: 'Reply to 1', parentId: 'c1' },
        { id: 'c3', postId: 'p1', content: 'Root 2', parentId: null }
      ];
      jest.spyOn(CommentModel, 'findByPostId').mockResolvedValue(flatComments);

      const req = { params: { postId: 'p1' } };
      const res = mockResponse();

      await getCommentsByPost(req, res);

      expect(CommentModel.findByPostId).toHaveBeenCalledWith('p1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 3,
          comments: [
            {
              id: 'c1',
              postId: 'p1',
              content: 'Root 1',
              parentId: null,
              replies: [
                { id: 'c2', postId: 'p1', content: 'Reply to 1', parentId: 'c1', replies: [] }
              ]
            },
            { id: 'c3', postId: 'p1', content: 'Root 2', parentId: null, replies: [] }
          ]
        }
      });
    });

    it('should return 500 when fetching comments fails', async () => {
      jest.spyOn(CommentModel, 'findByPostId').mockRejectedValue(new Error('Fetch error'));

      const req = { params: { postId: 'p1' } };
      const res = mockResponse();

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
    it('should return 401 if userId is missing', async () => {
      const req = { params: { commentId: 'c1' }, body: { reactionType: 'like' } };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if commentId is missing', async () => {
      const req = { user: { id: 'u1' }, params: {}, body: { reactionType: 'like' } };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment ID is required'
      });
    });

    it('should return 400 for an invalid reactionType', async () => {
      const req = {
        user: { id: 'u1' },
        params: { commentId: 'c1' },
        body: { reactionType: 'dislike' }
      };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid reaction. Allowed: like, love, insightful, celebrate'
      });
    });

    it('should return 404 if comment is not found', async () => {
      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      const req = {
        user: { id: 'u1' },
        params: { commentId: 'c1' },
        body: { reactionType: 'like' }
      };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(CommentModel.findById).toHaveBeenCalledWith('c1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found'
      });
    });

    it('should add reaction successfully and return 200', async () => {
      jest.spyOn(CommentModel, 'findById').mockResolvedValue({ id: 'c1' });
      jest.spyOn(CommentModel, 'addReaction').mockResolvedValue({ id: 'c1', reactions: { love: 1 } });

      const req = {
        body: { userId: 'u1', reactionType: 'LOVE' },
        params: { commentId: 'c1' }
      };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(CommentModel.addReaction).toHaveBeenCalledWith('c1', 'u1', 'love');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reaction "LOVE" updated',
        data: { id: 'c1', reactions: { love: 1 } }
      });
    });

    it('should return 500 if adding reaction throws an error', async () => {
      jest.spyOn(CommentModel, 'findById').mockRejectedValue(new Error('Reaction error'));

      const req = {
        user: { id: 'u1' },
        params: { commentId: 'c1' },
        body: { reactionType: 'like' }
      };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process reaction',
        details: 'Reaction error'
      });
    });
  });
});