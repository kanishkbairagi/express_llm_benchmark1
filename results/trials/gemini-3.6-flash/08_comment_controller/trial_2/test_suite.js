import { jest } from '@jest/globals';
import {
  CommentModel,
  createComment,
  getCommentsByPost,
  reactToComment
} from '../dataset/08_comment_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Comment Controller Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createComment', () => {
    test('should return 401 if user is not authenticated', async () => {
      const req = { body: { postId: 'post1', content: 'Hello' } };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should accept authorId in body if req.user is absent', async () => {
      const req = {
        body: { authorId: 'usr_1', postId: 'post1', content: 'Hello' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'create').mockResolvedValue({
        id: 'cmt_1',
        postId: 'post1',
        authorId: 'usr_1',
        content: 'Hello',
        parentId: null
      });

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comment created',
        data: expect.objectContaining({ id: 'cmt_1' })
      });
    });

    test('should return 400 if postId is missing or invalid', async () => {
      const req = {
        user: { id: 'usr_1' },
        body: { content: 'Test content' }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid postId is required'
      });
    });

    test('should return 400 if content is missing, not a string, or empty', async () => {
      const req = {
        user: { id: 'usr_1' },
        body: { postId: 'post1', content: '   ' }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment content cannot be empty'
      });
    });

    test('should return 400 if content exceeds 1000 characters', async () => {
      const req = {
        user: { id: 'usr_1' },
        body: { postId: 'post1', content: 'a'.repeat(1001) }
      };
      const res = mockResponse();

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment cannot exceed 1000 characters'
      });
    });

    test('should return 404 if parent comment is not found', async () => {
      const req = {
        user: { id: 'usr_1' },
        body: { postId: 'post1', content: 'Reply', parentId: 'non_existent' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent comment not found'
      });
    });

    test('should return 400 if attempting to nest beyond one level of replies', async () => {
      const req = {
        user: { id: 'usr_1' },
        body: { postId: 'post1', content: 'Deep reply', parentId: 'cmt_2' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({
        id: 'cmt_2',
        parentId: 'cmt_1',
        content: 'First level reply'
      });

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
      });
    });

    test('should successfully create a valid reply comment', async () => {
      const req = {
        user: { id: 'usr_1' },
        body: { postId: 'post1', content: '  Valid reply  ', parentId: 'cmt_1' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({
        id: 'cmt_1',
        parentId: null,
        content: 'Parent comment'
      });

      jest.spyOn(CommentModel, 'create').mockResolvedValue({
        id: 'cmt_2',
        postId: 'post1',
        authorId: 'usr_1',
        content: 'Valid reply',
        parentId: 'cmt_1'
      });

      await createComment(req, res);

      expect(CommentModel.create).toHaveBeenCalledWith({
        postId: 'post1',
        authorId: 'usr_1',
        content: 'Valid reply',
        parentId: 'cmt_1'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reply created',
        data: expect.objectContaining({ id: 'cmt_2' })
      });
    });

    test('should handle internal errors and return 500', async () => {
      const req = {
        user: { id: 'usr_1' },
        body: { postId: 'post1', content: 'Hello' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'create').mockRejectedValue(new Error('Database crash'));

      await createComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create comment',
        details: 'Database crash'
      });
    });
  });

  describe('getCommentsByPost', () => {
    test('should return 400 if postId parameter is missing', async () => {
      const req = { params: {} };
      const res = mockResponse();

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post ID is required'
      });
    });

    test('should return structured comment tree successfully', async () => {
      const req = { params: { postId: 'post1' } };
      const res = mockResponse();

      const flatComments = [
        { id: 'cmt_1', postId: 'post1', content: 'Root comment', parentId: null },
        { id: 'cmt_2', postId: 'post1', content: 'Reply 1', parentId: 'cmt_1' },
        { id: 'cmt_3', postId: 'post1', content: 'Orphan or Root 2', parentId: null }
      ];

      jest.spyOn(CommentModel, 'findByPostId').mockResolvedValue(flatComments);

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 3,
          comments: [
            {
              id: 'cmt_1',
              postId: 'post1',
              content: 'Root comment',
              parentId: null,
              replies: [
                {
                  id: 'cmt_2',
                  postId: 'post1',
                  content: 'Reply 1',
                  parentId: 'cmt_1',
                  replies: []
                }
              ]
            },
            {
              id: 'cmt_3',
              postId: 'post1',
              content: 'Orphan or Root 2',
              parentId: null,
              replies: []
            }
          ]
        }
      });
    });

    test('should handle database failure and return 500', async () => {
      const req = { params: { postId: 'post1' } };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'findByPostId').mockRejectedValue(new Error('DB failure'));

      await getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve comments',
        details: 'DB failure'
      });
    });
  });

  describe('reactToComment', () => {
    test('should return 401 if user is not authenticated', async () => {
      const req = { params: { commentId: 'cmt_1' }, body: { reactionType: 'like' } };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if commentId is missing', async () => {
      const req = { user: { id: 'usr_1' }, params: {}, body: { reactionType: 'like' } };
      const res = mockResponse();

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment ID is required'
      });
    });

    test('should return 400 for disallowed reaction types', async () => {
      const req = {
        user: { id: 'usr_1' },
        params: { commentId: 'cmt_1' },
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

    test('should return 404 if target comment does not exist', async () => {
      const req = {
        user: { id: 'usr_1' },
        params: { commentId: 'cmt_99' },
        body: { reactionType: 'like' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found'
      });
    });

    test('should successfully record a valid case-insensitive reaction', async () => {
      const req = {
        user: { id: 'usr_1' },
        params: { commentId: 'cmt_1' },
        body: { reactionType: 'INSIGHTFUL' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'findById').mockResolvedValue({ id: 'cmt_1' });
      jest.spyOn(CommentModel, 'addReaction').mockResolvedValue({
        id: 'cmt_1',
        reactions: { insightful: 1 }
      });

      await reactToComment(req, res);

      expect(CommentModel.addReaction).toHaveBeenCalledWith('cmt_1', 'usr_1', 'insightful');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reaction "INSIGHTFUL" updated',
        data: { id: 'cmt_1', reactions: { insightful: 1 } }
      });
    });

    test('should handle error during reaction processing and return 500', async () => {
      const req = {
        user: { id: 'usr_1' },
        params: { commentId: 'cmt_1' },
        body: { reactionType: 'love' }
      };
      const res = mockResponse();

      jest.spyOn(CommentModel, 'findById').mockRejectedValue(new Error('Unexpected error'));

      await reactToComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process reaction',
        details: 'Unexpected error'
      });
    });
  });
});