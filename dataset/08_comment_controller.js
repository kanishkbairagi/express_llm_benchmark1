// 08_comment_controller.js - Nested Comment CRUD & Reactions

// Mock Database Model
export const CommentModel = {
  findById: async (id) => null,
  findByPostId: async (postId) => [],
  create: async (data) => ({ id: `cmt_${Date.now()}`, ...data, createdAt: new Date(), reactions: {} }),
  addReaction: async (commentId, userId, reactionType) => ({
    id: commentId,
    reactions: { [reactionType]: 1 }
  })
};

const ALLOWED_REACTIONS = ['like', 'love', 'insightful', 'celebrate'];

export const createComment = async (req, res) => {
  try {
    const { postId, content, parentId } = req.body || {};
    const userId = req.user?.id || req.body?.authorId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!postId || typeof postId !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid postId is required' });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Comment content cannot be empty' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ success: false, error: 'Comment cannot exceed 1000 characters' });
    }

    let resolvedParentId = null;
    if (parentId) {
      const parentComment = await CommentModel.findById(parentId);
      if (!parentComment) {
        return res.status(404).json({ success: false, error: 'Parent comment not found' });
      }
      if (parentComment.parentId) {
        return res.status(400).json({
          success: false,
          error: 'Maximum nesting depth reached: nesting is restricted to one level of replies'
        });
      }
      resolvedParentId = parentId;
    }

    const newComment = await CommentModel.create({
      postId,
      authorId: userId,
      content: content.trim(),
      parentId: resolvedParentId
    });

    return res.status(201).json({
      success: true,
      message: resolvedParentId ? 'Reply created' : 'Comment created',
      data: newComment
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to create comment',
      details: error.message
    });
  }
};

export const getCommentsByPost = async (req, res) => {
  try {
    const { postId } = req.params || {};

    if (!postId) {
      return res.status(400).json({ success: false, error: 'Post ID is required' });
    }

    const flatComments = await CommentModel.findByPostId(postId);

    // Build comment tree
    const rootComments = [];
    const commentMap = new Map();

    flatComments.forEach((c) => {
      commentMap.set(c.id, { ...c, replies: [] });
    });

    commentMap.forEach((c) => {
      if (c.parentId && commentMap.has(c.parentId)) {
        commentMap.get(c.parentId).replies.push(c);
      } else {
        rootComments.push(c);
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        total: flatComments.length,
        comments: rootComments
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve comments',
      details: error.message
    });
  }
};

export const reactToComment = async (req, res) => {
  try {
    const { commentId } = req.params || {};
    const { reactionType } = req.body || {};
    const userId = req.user?.id || req.body?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!commentId) {
      return res.status(400).json({ success: false, error: 'Comment ID is required' });
    }

    if (!reactionType || !ALLOWED_REACTIONS.includes(reactionType.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid reaction. Allowed: ${ALLOWED_REACTIONS.join(', ')}`
      });
    }

    const comment = await CommentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const updated = await CommentModel.addReaction(commentId, userId, reactionType.toLowerCase());

    return res.status(200).json({
      success: true,
      message: `Reaction "${reactionType}" updated`,
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process reaction',
      details: error.message
    });
  }
};
