import { jest } from '@jest/globals';

jest.unstable_mockModule('../models/chatModel.js', () => ({
  default: {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.unstable_mockModule('../models/userModel.js', () => ({
  default: {
    populate: jest.fn(),
  },
}));

const { default: Chat } = await import('../models/chatModel.js');
const { default: user } = await import('../models/userModel.js');
const {
  accessChats,
  fetchAllChats,
  creatGroup,
  renameGroup,
  addToGroup,
  removeFromGroup,
  removeContact,
} = await import(
  '../dataset/external/ShakirFarhan__Realtime-Chat/server/controllers/chatControllers.js'
);

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.sendStatus = jest.fn().mockReturnValue(res);
  return res;
};

const mockQuery = (result) => ({
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  catch: (reject) => Promise.resolve(result).catch(reject),
});

const mockQueryError = (error) => ({
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  then: (resolve, reject) => Promise.reject(error).then(resolve, reject),
  catch: (reject) => Promise.reject(error).catch(reject),
});

describe('chatControllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('accessChats', () => {
    test('should return message if userId is missing in req.body', async () => {
      const req = { body: {} };
      const res = createMockRes();

      await accessChats(req, res);

      expect(res.send).toHaveBeenCalledWith({ message: "Provide User's Id" });
    });

    test('should return existing chat if chat exists', async () => {
      const req = { body: { userId: 'u123' }, rootUserId: 'root123' };
      const res = createMockRes();
      const existingChats = [{ _id: 'chat1', isGroup: false }];

      Chat.find.mockReturnValue(mockQuery(existingChats));
      user.populate.mockResolvedValue(existingChats);

      await accessChats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(existingChats[0]);
    });

    test('should create and return a new chat if chat does not exist', async () => {
      const req = { body: { userId: 'u123' }, rootUserId: 'root123' };
      const res = createMockRes();
      const newChatObj = { _id: 'newChatId' };
      const createdChat = [{ _id: 'newChatId', isGroup: false }];

      Chat.find
        .mockReturnValueOnce(mockQuery([]))
        .mockReturnValueOnce(mockQuery(createdChat));
      user.populate.mockResolvedValue([]);
      Chat.create.mockResolvedValue(newChatObj);

      await accessChats(req, res);

      expect(Chat.create).toHaveBeenCalledWith({
        chatName: 'sender',
        users: ['u123', 'root123'],
        isGroup: false,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(createdChat);
    });

    test('should return status 500 when error occurs during creation', async () => {
      const req = { body: { userId: 'u123' }, rootUserId: 'root123' };
      const res = createMockRes();
      const error = new Error('Database error');

      Chat.find.mockReturnValue(mockQuery([]));
      user.populate.mockResolvedValue([]);
      Chat.create.mockRejectedValue(error);

      await accessChats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(error);
    });
  });

  describe('fetchAllChats', () => {
    test('should fetch all chats for user successfully', async () => {
      const req = { rootUserId: 'root123' };
      const res = createMockRes();
      const chatsList = [{ _id: 'chat1' }, { _id: 'chat2' }];

      Chat.find.mockReturnValue(mockQuery(chatsList));
      user.populate.mockResolvedValue(chatsList);

      await fetchAllChats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(chatsList);
    });

    test('should return status 500 if error occurs', async () => {
      const req = { rootUserId: 'root123' };
      const res = createMockRes();
      const error = new Error('Fetch failed');

      Chat.find.mockReturnValue(mockQueryError(error));
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await fetchAllChats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(error);
    });
  });

  describe('creatGroup', () => {
    test('should return 400 if chatName or users are missing', async () => {
      const req = { body: { chatName: 'Group 1' } };
      const res = createMockRes();

      await creatGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Please fill the fields' });
    });

    test('should trigger send when users length is less than 2', async () => {
      const req = {
        body: { chatName: 'Group 1', users: JSON.stringify(['user1']) },
      };
      const res = createMockRes();

      await creatGroup(req, res);

      expect(res.send).toHaveBeenCalled();
    });

    test('should create group successfully and send result', async () => {
      const req = {
        body: { chatName: 'Group 1', users: JSON.stringify(['user1', 'user2']) },
        rootUser: 'rootUserObj',
        rootUserId: 'root123',
      };
      const res = createMockRes();
      const createdGroup = { _id: 'group1', chatName: 'Group 1' };

      Chat.create.mockResolvedValue({ _id: 'group1' });
      Chat.findOne.mockReturnValue(mockQuery(createdGroup));

      await creatGroup(req, res);

      expect(Chat.create).toHaveBeenCalledWith({
        chatName: 'Group 1',
        users: ['user1', 'user2', 'rootUserObj'],
        isGroup: true,
        groupAdmin: 'root123',
      });
      expect(res.send).toHaveBeenCalledWith(createdGroup);
    });

    test('should return status 500 on create error', async () => {
      const req = {
        body: { chatName: 'Group 1', users: JSON.stringify(['user1', 'user2']) },
        rootUser: 'rootUserObj',
        rootUserId: 'root123',
      };
      const res = createMockRes();

      Chat.create.mockRejectedValue(new Error('Creation error'));

      await creatGroup(req, res);

      expect(res.sendStatus).toHaveBeenCalledWith(500);
    });
  });

  describe('renameGroup', () => {
    test('should return 400 if chatId or chatName missing', async () => {
      const req = { body: { chatId: 'c1' } };
      const res = createMockRes();

      await renameGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Provide Chat id and Chat name');
    });

    test('should rename group and return updated chat', async () => {
      const req = { body: { chatId: 'c1', chatName: 'New Name' } };
      const res = createMockRes();
      const updatedChat = { _id: 'c1', chatName: 'New Name' };

      Chat.findByIdAndUpdate.mockReturnValue(mockQuery(updatedChat));

      await renameGroup(req, res);

      expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
        $set: { chatName: 'New Name' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(updatedChat);
    });

    test('should set status 404 if chat not found when renaming', async () => {
      const req = { body: { chatId: 'c1', chatName: 'New Name' } };
      const res = createMockRes();

      Chat.findByIdAndUpdate.mockReturnValue(mockQuery(null));

      await renameGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(null);
    });

    test('should handle error and return status 500', async () => {
      const req = { body: { chatId: 'c1', chatName: 'New Name' } };
      const res = createMockRes();
      const error = new Error('Rename error');

      Chat.findByIdAndUpdate.mockReturnValue(mockQueryError(error));
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await renameGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(error);
    });
  });

  describe('addToGroup', () => {
    test('should add user to group if not already present', async () => {
      const req = { body: { userId: 'u2', chatId: 'c1' } };
      const res = createMockRes();
      const existingChat = { _id: 'c1', users: ['u1'] };
      const updatedChat = { _id: 'c1', users: ['u1', 'u2'] };

      Chat.findOne.mockResolvedValue(existingChat);
      Chat.findByIdAndUpdate.mockReturnValue(mockQuery(updatedChat));

      await addToGroup(req, res);

      expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
        $push: { users: 'u2' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(updatedChat);
    });

    test('should set 404 status if updated chat is null when adding to group', async () => {
      const req = { body: { userId: 'u2', chatId: 'c1' } };
      const res = createMockRes();
      const existingChat = { _id: 'c1', users: ['u1'] };

      Chat.findOne.mockResolvedValue(existingChat);
      Chat.findByIdAndUpdate.mockReturnValue(mockQuery(null));

      await addToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('should return 409 if user already exists in group', async () => {
      const req = { body: { userId: 'u1', chatId: 'c1' } };
      const res = createMockRes();
      const existingChat = { _id: 'c1', users: ['u1'] };

      Chat.findOne.mockResolvedValue(existingChat);

      await addToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.send).toHaveBeenCalledWith('user already exists');
    });
  });

  describe('removeFromGroup', () => {
    test('should remove user from group if user exists in group', async () => {
      const req = { body: { userId: 'u1', chatId: 'c1' } };
      const res = createMockRes();
      const existingChat = { _id: 'c1', users: ['u1', 'u2'] };
      const updatedChat = { _id: 'c1', users: ['u2'] };

      Chat.findOne.mockResolvedValue(existingChat);
      Chat.findByIdAndUpdate.mockReturnValue(mockQuery(updatedChat));

      await removeFromGroup(req, res);
      await new Promise(process.nextTick);

      expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
        $pull: { users: 'u1' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(updatedChat);
    });

    test('should set status 404 if findByIdAndUpdate fails in removeFromGroup', async () => {
      const req = { body: { userId: 'u1', chatId: 'c1' } };
      const res = createMockRes();
      const existingChat = { _id: 'c1', users: ['u1', 'u2'] };

      Chat.findOne.mockResolvedValue(existingChat);
      Chat.findByIdAndUpdate.mockReturnValue(mockQueryError(new Error('Failed')));

      await removeFromGroup(req, res);
      await new Promise(process.nextTick);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('should return 409 if user does not exist in group', async () => {
      const req = { body: { userId: 'u3', chatId: 'c1' } };
      const res = createMockRes();
      const existingChat = { _id: 'c1', users: ['u1', 'u2'] };

      Chat.findOne.mockResolvedValue(existingChat);

      await removeFromGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.send).toHaveBeenCalledWith('user doesnt exists');
    });
  });

  describe('removeContact', () => {
    test('should execute without throwing', async () => {
      const req = {};
      const res = createMockRes();
      await expect(removeContact(req, res)).resolves.not.toThrow();
    });
  });
});