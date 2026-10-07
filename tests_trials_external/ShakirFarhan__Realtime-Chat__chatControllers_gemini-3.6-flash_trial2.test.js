import { jest } from '@jest/globals';

const mockChat = {
  find: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};

const mockUser = {
  populate: jest.fn(),
};

jest.unstable_mockModule('../dataset/external/ShakirFarhan__Realtime-Chat/server/models/chatModel.js', () => ({
  default: mockChat,
}));

jest.unstable_mockModule('../dataset/external/ShakirFarhan__Realtime-Chat/server/models/userModel.js', () => ({
  default: mockUser,
}));

const {
  accessChats,
  fetchAllChats,
  creatGroup,
  renameGroup,
  addToGroup,
  removeFromGroup,
  removeContact,
} = await import('../dataset/external/ShakirFarhan__Realtime-Chat/server/controllers/chatControllers.js');

describe('chatControllers Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      rootUserId: 'rootUser123',
      rootUser: { _id: 'rootUser123', name: 'Root User' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    };
  });

  describe('accessChats', () => {
    it('should prompt if userId is not provided', async () => {
      req.body = {};
      const populateSecond = jest.fn();
      const populateFirst = jest.fn().mockReturnValue({ populate: populateSecond });
      mockChat.find.mockReturnValue({ populate: populateFirst });
      mockUser.populate.mockResolvedValue([]);

      await accessChats(req, res);

      expect(res.send).toHaveBeenCalledWith({ message: "Provide User's Id" });
    });

    it('should return existing chat if found', async () => {
      req.body = { userId: 'user456' };

      const existingChat = [{ _id: 'chat123', isGroup: false }];
      const populateSecond = jest.fn().mockResolvedValue(existingChat);
      const populateFirst = jest.fn().mockReturnValue({ populate: populateSecond });
      mockChat.find.mockReturnValue({ populate: populateFirst });
      mockUser.populate.mockResolvedValue(existingChat);

      await accessChats(req, res);

      expect(mockChat.find).toHaveBeenCalledWith({
        isGroup: false,
        $and: [
          { users: { $elemMatch: { $eq: 'user456' } } },
          { users: { $elemMatch: { $eq: 'rootUser123' } } },
        ],
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(existingChat[0]);
    });

    it('should create new chat if not existing', async () => {
      req.body = { userId: 'user456' };

      const populateSecond = jest.fn().mockResolvedValue([]);
      const populateFirst = jest.fn().mockReturnValue({ populate: populateSecond });
      mockChat.find.mockReturnValueOnce({ populate: populateFirst });
      mockUser.populate.mockResolvedValue([]);

      const newChatObj = { _id: 'newChat123' };
      mockChat.create.mockResolvedValue(newChatObj);

      const createdChatResult = [{ _id: 'newChat123', users: ['user456', 'rootUser123'] }];
      const populateCreated = jest.fn().mockResolvedValue(createdChatResult);
      mockChat.find.mockReturnValueOnce({ populate: populateCreated });

      await accessChats(req, res);

      expect(mockChat.create).toHaveBeenCalledWith({
        chatName: 'sender',
        users: ['user456', 'rootUser123'],
        isGroup: false,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(createdChatResult);
    });

    it('should handle error when creating new chat fails', async () => {
      req.body = { userId: 'user456' };

      const populateSecond = jest.fn().mockResolvedValue([]);
      const populateFirst = jest.fn().mockReturnValue({ populate: populateSecond });
      mockChat.find.mockReturnValueOnce({ populate: populateFirst });
      mockUser.populate.mockResolvedValue([]);

      const dbError = new Error('Database Failure');
      mockChat.create.mockRejectedValue(dbError);

      await accessChats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(dbError);
    });
  });

  describe('fetchAllChats', () => {
    it('should fetch and populate all chats for root user', async () => {
      const mockChats = [{ _id: 'chat1' }, { _id: 'chat2' }];
      const sortMock = jest.fn().mockResolvedValue(mockChats);
      const popGroupAdmin = jest.fn().mockReturnValue({ sort: sortMock });
      const popLatestMsg = jest.fn().mockReturnValue({ populate: popGroupAdmin });
      const popUsers = jest.fn().mockReturnValue({ populate: popLatestMsg });

      mockChat.find.mockReturnValue({ populate: popUsers });
      mockUser.populate.mockResolvedValue(mockChats);

      await fetchAllChats(req, res);

      expect(mockChat.find).toHaveBeenCalledWith({
        users: { $elemMatch: { $eq: 'rootUser123' } },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockChats);
    });

    it('should return 500 error if query fails', async () => {
      const dbError = new Error('Query error');
      mockChat.find.mockImplementation(() => {
        throw dbError;
      });

      await fetchAllChats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(dbError);
    });
  });

  describe('creatGroup', () => {
    it('should return 400 if required fields are missing', async () => {
      req.body = { chatName: 'Group Chat' };

      await creatGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Please fill the fields' });
    });

    it('should process user list and create a new group chat', async () => {
      req.body = {
        chatName: 'Dev Team',
        users: JSON.stringify(['user1', 'user2']),
      };

      const createdChatObj = { _id: 'groupChat123' };
      mockChat.create.mockResolvedValue(createdChatObj);

      const fullChat = { _id: 'groupChat123', chatName: 'Dev Team', isGroup: true };
      const popAdmin = jest.fn().mockResolvedValue(fullChat);
      const popUsers = jest.fn().mockReturnValue({ populate: popAdmin });
      mockChat.findOne.mockReturnValue({ populate: popUsers });

      await creatGroup(req, res);

      expect(mockChat.create).toHaveBeenCalledWith({
        chatName: 'Dev Team',
        users: ['user1', 'user2', req.rootUser],
        isGroup: true,
        groupAdmin: 'rootUser123',
      });
      expect(res.send).toHaveBeenCalledWith(fullChat);
    });

    it('should return 500 status on creation error', async () => {
      req.body = {
        chatName: 'Dev Team',
        users: JSON.stringify(['user1', 'user2']),
      };

      mockChat.create.mockRejectedValue(new Error('Creation failed'));

      await creatGroup(req, res);

      expect(res.sendStatus).toHaveBeenCalledWith(500);
    });
  });

  describe('renameGroup', () => {
    it('should return 400 if chatId or chatName is missing', async () => {
      req.body = { chatId: 'chat123' };

      await renameGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Provide Chat id and Chat name');
    });

    it('should update group name successfully', async () => {
      req.body = { chatId: 'chat123', chatName: 'New Name' };

      const updatedChat = { _id: 'chat123', chatName: 'New Name' };
      const popAdmin = jest.fn().mockResolvedValue(updatedChat);
      const popUsers = jest.fn().mockReturnValue({ populate: popAdmin });
      mockChat.findByIdAndUpdate.mockReturnValue({ populate: popUsers });

      await renameGroup(req, res);

      expect(mockChat.findByIdAndUpdate).toHaveBeenCalledWith('chat123', {
        $set: { chatName: 'New Name' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(updatedChat);
    });

    it('should set status 404 if chat is not found after update', async () => {
      req.body = { chatId: 'chat123', chatName: 'New Name' };

      const popAdmin = jest.fn().mockResolvedValue(null);
      const popUsers = jest.fn().mockReturnValue({ populate: popAdmin });
      mockChat.findByIdAndUpdate.mockReturnValue({ populate: popUsers });

      await renameGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(null);
    });

    it('should handle error with 500 response', async () => {
      req.body = { chatId: 'chat123', chatName: 'New Name' };

      const dbError = new Error('Update error');
      mockChat.findByIdAndUpdate.mockImplementation(() => {
        throw dbError;
      });

      await renameGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(dbError);
    });
  });

  describe('addToGroup', () => {
    it('should add user to group if user is not already in group', async () => {
      req.body = { userId: 'user1', chatId: 'chat123' };

      mockChat.findOne.mockResolvedValue({ _id: 'chat123', users: ['user2'] });

      const updatedChat = { _id: 'chat123', users: ['user2', 'user1'] };
      const popUsers = jest.fn().mockResolvedValue(updatedChat);
      const popAdmin = jest.fn().mockReturnValue({ populate: popUsers });
      mockChat.findByIdAndUpdate.mockReturnValue({ populate: popAdmin });

      await addToGroup(req, res);

      expect(mockChat.findByIdAndUpdate).toHaveBeenCalledWith('chat123', {
        $push: { users: 'user1' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(updatedChat);
    });

    it('should return 409 if user already exists in group', async () => {
      req.body = { userId: 'user1', chatId: 'chat123' };

      mockChat.findOne.mockResolvedValue({ _id: 'chat123', users: ['user1'] });

      await addToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.send).toHaveBeenCalledWith('user already exists');
    });
  });

  describe('removeFromGroup', () => {
    it('should remove user from group if user is in group', async () => {
      req.body = { userId: 'user1', chatId: 'chat123' };

      mockChat.findOne.mockResolvedValue({ _id: 'chat123', users: ['user1', 'user2'] });

      const updatedChat = { _id: 'chat123', users: ['user2'] };
      const popUsers = jest.fn().mockResolvedValue(updatedChat);
      const popAdmin = jest.fn().mockReturnValue({ populate: popUsers });
      mockChat.findByIdAndUpdate.mockReturnValue({ populate: popAdmin });

      await removeFromGroup(req, res);

      expect(mockChat.findByIdAndUpdate).toHaveBeenCalledWith('chat123', {
        $pull: { users: 'user1' },
      });

      await new Promise(process.nextTick);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(updatedChat);
    });

    it('should return 409 if user does not exist in group', async () => {
      req.body = { userId: 'user1', chatId: 'chat123' };

      mockChat.findOne.mockResolvedValue({ _id: 'chat123', users: ['user2'] });

      await removeFromGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.send).toHaveBeenCalledWith('user doesnt exists');
    });

    it('should return 404 when findByIdAndUpdate chain rejects', async () => {
      req.body = { userId: 'user1', chatId: 'chat123' };

      mockChat.findOne.mockResolvedValue({ _id: 'chat123', users: ['user1'] });

      const popUsers = jest.fn().mockRejectedValue(new Error('Failed'));
      const popAdmin = jest.fn().mockReturnValue({ populate: popUsers });
      mockChat.findByIdAndUpdate.mockReturnValue({ populate: popAdmin });

      await removeFromGroup(req, res);

      await new Promise(process.nextTick);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('removeContact', () => {
    it('should execute without errors', async () => {
      await expect(removeContact(req, res)).resolves.not.toThrow();
    });
  });
});