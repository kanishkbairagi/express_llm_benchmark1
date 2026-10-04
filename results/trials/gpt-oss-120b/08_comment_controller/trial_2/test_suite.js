import { jest } from '@jest/globals';
import {
  createComment,
  getCommentsByPost,
  reactToComment,
  CommentModel
} from '../dataset/08_comment_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Comment Controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- createComment ----------
  test('creates a top‑level comment successfully', async () => {
    const req = {
      body: {
        postId: 'post_123',
        content: '  Hello world  ',
        authorId: 'user_1'
      }
    };
    const res = mockRes();

    const created = { id: 'cmt_1', postId: 'post_123', authorId: 'user_1', content: 'Hello world', parentId: null };
    jest.spyOn(CommentModel, 'create').mockResolvedValue(created);
    jest.spyOn(CommentModel, 'findById').mockResolvedValue(null); // not used for top level

    await createComment(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Comment created',
      data: created
    });
  });

  test('creates a reply when parent comment exists and is not nested', async () => {
    const req = {
      body: {
        postId: 'post_123',
        content: 'Reply',
        parentId: 'cmt_parent',
        authorId: 'user_2'
      }
    };
    const res = mockRes();

    const parentComment = { id: 'cmt_parent', parentId: null };
    const created = { id: 'cmt_reply', postId: 'post_123', authorId: 'user_2', content: 'Reply', parentId: 'cmt_parent' };

    jest.spyOn(CommentModel, 'findById').mockResolvedValue(parentComment);
    jest.spyOn(CommentModel, 'create').mockResolvedValue(created);

    await createComment(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Reply created',
      data: created
    });
  });

  test('fails when authentication is missing', async () => {
    const req = { body: { postId: 'p', content: 'c' } };
    const res = mockRes();

    await createComment(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('fails when postId is invalid', async () => {
    const req = { body: { postId: 123, content: 'c', authorId: 'u' } };
    const res = mockRes();

    await createComment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Valid postId is required'
    });
  });

  test('fails when content is empty or whitespace', async () => {
    const req = { body: { postId: 'p', content: '   ', authorId: 'u' } };
    const res = mockRes();

    await createComment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Comment content cannot be empty'
    });
  });

  test('fails when parent comment not found', async () => {
    const req = {
      body: { postId: 'p', content: 'c', parentId: 'nonexistent', authorId: 'u' }
    };
    const res = mockRes();

    jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

    await createComment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Parent comment not found'
    });
  });

  test('fails when replying to a nested comment (depth limit)', async () => {
    const req = {
      body: { postId: 'p', content: 'c', parentId: 'cmt_child', authorId: 'u' }
    };
    const res = mockRes();

    const nestedParent = { id: 'cmt_child', parentId: 'cmt_root' };
    jest.spyOn(CommentModel, 'findById').mockResolvedValue(nestedParent);

    await createComment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
    });
  });

  // ---------- getCommentsByPost ----------
  test('retrieves comments tree correctly', async () => {
    const req = { params: { postId: 'post_123' } };
    const res = mockRes();

    const flat = [
      { id: 'c1', parentId: null, content: 'root1' },
      { id: 'c2', parentId: 'c1', content: 'reply to root1' },
      { id: 'c3', parentId: null, content: 'root2' }
    ];
    jest.spyOn(CommentModel, 'findByPostId').mockResolvedValue(flat);

    await getCommentsByPost(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        total: 3,
        comments: [
          {
            id: 'c1',
            parentId: null,
            content: 'root1',
            replies: [
              {
                id: 'c2',
                parentId: 'c1',
                content: 'reply to root1',
                replies: []
              }
            ]
          },
          {
            id: 'c3',
            parentId: null,
            content: 'root2',
            replies: []
          }
        ]
      }
    });
  });

  test('fails when postId param is missing', async () => {
    const req = { params: {} };
    const res = mockRes();

    await getCommentsByPost(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Post ID is required'
    });
  });

  // ---------- reactToComment ----------
  test('adds a reaction successfully', async () => {
    const req = {
      params: { commentId: 'cmt_1' },
      body: { reactionType: 'Love' },
      user: { id: 'user_1' }
    };
    const res = mockRes();

    const comment = { id: 'cmt_1' };
    const updated = { id: 'cmt_1', reactions: { love: 1 } };

    jest.spyOn(CommentModel, 'findById').mockResolvedValue(comment);
    jest.spyOn(CommentModel, 'addReaction').mockResolvedValue(updated);

    await reactToComment(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Reaction "Love" updated',
      data: updated
    });
  });

  test('fails reaction when user not authenticated', async () => {
    const req = {
      params: { commentId: 'cmt_1' },
      body: { reactionType: 'like' }
    };
    const res = mockRes();

    await reactToComment(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('fails reaction with invalid reaction type', async () => {
    const req = {
      params: { commentId: 'cmt_1' },
      body: { reactionType: 'invalid' },
      user: { id: 'u' }
    };
    const res = mockRes();

    await reactToComment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: `Invalid reaction. Allowed: ${['like', 'love', 'insightful', 'celebrate'].join(', ')}`
    });
  });

  test('fails reaction when comment does not exist', async () => {
    const req = {
      params: { commentId: 'missing' },
      body: { reactionType: 'like' },
      user: { id: 'u' }
    };
    const res = mockRes();

    jest.spyOn(CommentModel, 'findById').mockResolvedValue(null);

    await reactToComment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Comment not found'
    });
  });
});