import { jest } from '@jest/globals';
import {
  accessChats,
  fetchAllChats,
  creatGroup,
  renameGroup,
  addToGroup,
  removeFromGroup,
} from '../dataset/external/ShakirFarhan__Realtime-Chat/server/controllers/chatControllers.js';
import Chat from '../dataset/external/ShakirFarhan__Realtime-Chat/server/models/chatModel.js';
import user from '../dataset/external/ShakirFarhan__Realtime-Chat/server/models/userModel.js';

jest.mock('../dataset/external/ShakirFarhan__Realtime-Chat/server/models/chatModel.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('../dataset/external/ShakirFarhan__Realtime-Chat/server/models/userModel.js', () => ({
  __esModule: true,
  default: {
    populate: jest.fn(),
  },
}));

// helper to create a thenable mock (awaitable)
const mockQuery = (result) => ({
  populate: jest.fn().mockReturnThis(),
  then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
});

describe('accessChats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should respond with error when userId missing', async () => {
    const req = { body: {}, rootUserId: 'root' };
    const res = { send: jest.fn() };
    await accessChats(req, res);
    expect(res.send).toHaveBeenCalledWith({ message: "Provide User's Id" });
  });

  test('should return existing one‑to‑one chat', async () => {
    const chatDoc = { _id: 'c1', users: [], latestMessage: {} };
    Chat.find.mockReturnValue(mockQuery([chatDoc]));
    user.populate.mockResolvedValue([chatDoc]);

    const req = { body: { userId: 'u1' }, rootUserId: 'root' };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await accessChats(req, res);

    expect(Chat.find).toHaveBeenCalledWith({
      isGroup: false,
      $and: [
        { users: { $elemMatch: { $eq: 'u1' } } },
        { users: { $elemMatch: { $eq: 'root' } } },
      ],
    });
    expect(user.populate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(chatDoc);
  });

  test('should create a new chat when none exists', async () => {
    // find returns empty array
    Chat.find.mockReturnValue(mockQuery([]));
    // create returns newly created chat doc
    const newChat = { _id: 'newId' };
    Chat.create.mockResolvedValue(newChat);
    // subsequent find to populate users
    const populatedChat = [{ _id: 'newId', users: [] }];
    Chat.find.mockReturnValueOnce(mockQuery(populatedChat));

    const req = { body: { userId: 'u2' }, rootUserId: 'root' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await accessChats(req, res);

    expect(Chat.create).toHaveBeenCalledWith({
      chatName: 'sender',
      users: ['u2', 'root'],
      isGroup: false,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(populatedChat);
  });
});

describe('fetchAllChats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return populated chats on success', async () => {
    const chats = [{ _id: 'c1' }, { _id: 'c2' }];
    Chat.find.mockReturnValue(mockQuery(chats));
    user.populate.mockResolvedValue(chats);

    const req = { rootUserId: 'root' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await fetchAllChats(req, res);

    expect(Chat.find).toHaveBeenCalledWith({
      users: { $elemMatch: { $eq: 'root' } },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(chats);
  });

  test('should handle errors and send 500', async () => {
    const error = new Error('db error');
    Chat.find.mockImplementation(() => {
      throw error;
    });

    const req = { rootUserId: 'root' };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await fetchAllChats(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(error);
  });
});

describe('creatGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should validate missing fields', async () => {
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await creatGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Please fill the fields' });
  });

  test('should create group when data valid', async () => {
    const usersArray = ['u1', 'u2'];
    const createdChat = { _id: 'g1' };
    const populatedChat = [{ _id: 'g1', users: [], groupAdmin: {} }];

    Chat.create.mockResolvedValue(createdChat);
    Chat.findOne.mockReturnValue(mockQuery(populatedChat));

    const req = {
      body: {
        chatName: 'My Group',
        users: JSON.stringify(usersArray),
      },
      rootUserId: 'adminId',
      rootUser: 'adminId',
    };
    const res = { send: jest.fn() };

    await creatGroup(req, res);

    expect(Chat.create).toHaveBeenCalledWith({
      chatName: 'My Group',
      users: [...usersArray, 'adminId'],
      isGroup: true,
      groupAdmin: 'adminId',
    });
    expect(res.send).toHaveBeenCalledWith(populatedChat[0]);
  });
});

describe('renameGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should validate missing params', async () => {
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await renameGroup(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Provide Chat id and Chat name');
  });

  test('should rename existing chat', async () => {
    const chatDoc = { _id: 'c1', chatName: 'old' };
    Chat.findByIdAndUpdate.mockReturnValue(mockQuery(chatDoc));

    const req = { body: { chatId: 'c1', chatName: 'new' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await renameGroup(req, res);

    expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
      $set: { chatName: 'new' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(chatDoc);
  });
});

describe('addToGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should add user when not present', async () => {
    const chatAfter = { _id: 'g1', users: ['u1', 'newUser'] };
    Chat.findOne.mockResolvedValue({ users: ['u1'] });
    Chat.findByIdAndUpdate.mockReturnValue(mockQuery(chatAfter));

    const req = { body: { userId: 'newUser', chatId: 'g1' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await addToGroup(req, res);

    expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('g1', {
      $push: { users: 'newUser' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(chatAfter);
  });

  test('should return 409 when user already in group', async () => {
    Chat.findOne.mockResolvedValue({ users: ['u1', 'u2'] });

    const req = { body: { userId: 'u1', chatId: 'g1' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await addToGroup(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith('user already exists');
  });
});

describe('removeFromGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should remove user when present', async () => {
    const updatedChat = { _id: 'g1', users: ['u2'] };
    Chat.findOne.mockResolvedValue({ users: ['u1', 'u2'] });
    // mock the chain of update with populate then .then(...)
    const updateQuery = {
      populate: jest.fn().mockReturnThis(),
      then: (onFulfilled) => Promise.resolve(updatedChat).then(onFulfilled),
    };
    Chat.findByIdAndUpdate.mockReturnValue(updateQuery);

    const req = { body: { userId: 'u1', chatId: 'g1' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await removeFromGroup(req, res);

    expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('g1', {
      $pull: { users: 'u1' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(updatedChat);
  });

  test('should return 409 when user not in group', async () => {
    Chat.findOne.mockResolvedValue({ users: ['u2'] });

    const req = { body: { userId: 'u1', chatId: 'g1' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await removeFromGroup(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith('user doesnt exists');
  });
});