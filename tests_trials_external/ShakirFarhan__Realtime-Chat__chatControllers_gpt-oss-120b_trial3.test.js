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
  },
}));

jest.mock('../dataset/external/ShakirFarhan__Realtime-Chat/server/models/userModel.js', () => ({
  __esModule: true,
  default: {
    populate: jest.fn(),
  },
}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('accessChats', () => {
  test('should respond with error when userId is missing', async () => {
    const req = { body: {}, rootUserId: 'root123' };
    const res = mockRes();

    await accessChats(req, res);

    expect(res.send).toHaveBeenCalledWith({ message: "Provide User's Id" });
  });

  test('should return existing one‑to‑one chat', async () => {
    const existingChat = [{ _id: 'chat1', users: [], latestMessage: {} }];
    // Mock find → populate → populate chain
    Chat.find.mockReturnValue({
      populate: jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(existingChat),
      })),
    });
    // Mock user.populate used later
    user.populate.mockResolvedValue(existingChat);

    const req = { body: { userId: 'userA' }, rootUserId: 'userB' };
    const res = mockRes();

    await accessChats(req, res);

    expect(Chat.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isGroup: false,
        $and: expect.any(Array),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(existingChat[0]);
  });

  test('should create a new chat when none exists', async () => {
    // find returns empty array
    Chat.find.mockReturnValue({
      populate: jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue([]),
      })),
    });
    user.populate.mockResolvedValue([]); // not used when empty

    const createdChat = { _id: 'newChat', users: [] };
    Chat.create.mockResolvedValue(createdChat);
    // after creation, find by id returns populated chat array
    Chat.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([createdChat]),
    });

    const req = { body: { userId: 'userX' }, rootUserId: 'rootX' };
    const res = mockRes();

    await accessChats(req, res);

    expect(Chat.create).toHaveBeenCalledWith({
      chatName: 'sender',
      users: ['userX', 'rootX'],
      isGroup: false,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([createdChat]);
  });
});

describe('fetchAllChats', () => {
  test('should return populated chats', async () => {
    const chats = [{ _id: 'c1' }, { _id: 'c2' }];
    Chat.find.mockReturnValue({
      populate: jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockImplementation(() => ({
            sort: jest.fn().mockResolvedValue(chats),
          })),
        })),
      })),
    });
    const populated = [{ _id: 'c1', latestMessage: {} }];
    user.populate.mockResolvedValue(populated);

    const req = { rootUserId: 'root' };
    const res = mockRes();

    await fetchAllChats(req, res);

    expect(Chat.find).toHaveBeenCalledWith({
      users: { $elemMatch: { $eq: 'root' } },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(populated);
  });
});

describe('creatGroup', () => {
  test('should return 400 when required fields are missing', async () => {
    const req = { body: {} };
    const res = mockRes();

    await creatGroup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Please fill the fields' });
  });

  test('should return 400 when less than two users are provided', async () => {
    const req = {
      body: { chatName: 'Group', users: JSON.stringify(['u1']) },
      rootUser: 'rootUser',
    };
    const res = mockRes();

    await creatGroup(req, res);

    expect(res.send).toHaveBeenCalledWith('Group should contain more than 2 users');
  });

  test('should create group and return populated chat', async () => {
    const req = {
      body: {
        chatName: 'MyGroup',
        users: JSON.stringify(['u1', 'u2']),
      },
      rootUser: 'rootUser',
      rootUserId: 'rootId',
    };
    const created = { _id: 'grp1' };
    Chat.create.mockResolvedValue(created);
    Chat.findOne.mockResolvedValue({
      _id: 'grp1',
      chatName: 'MyGroup',
      users: ['u1', 'u2', 'rootUser'],
    });
    const res = mockRes();

    await creatGroup(req, res);

    expect(Chat.create).toHaveBeenCalledWith({
      chatName: 'MyGroup',
      users: ['u1', 'u2', 'rootUser'],
      isGroup: true,
      groupAdmin: 'rootId',
    });
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ _id: 'grp1' }));
  });
});

describe('renameGroup', () => {
  test('should return 400 when missing parameters', async () => {
    const req = { body: {} };
    const res = mockRes();

    await renameGroup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Provide Chat id and Chat name');
  });

  test('should update chat name and return updated chat', async () => {
    const updatedChat = { _id: 'c1', chatName: 'NewName' };
    Chat.findByIdAndUpdate.mockResolvedValue(updatedChat);
    const req = { body: { chatId: 'c1', chatName: 'NewName' } };
    const res = mockRes();

    await renameGroup(req, res);

    expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
      $set: { chatName: 'NewName' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(updatedChat);
  });
});

describe('addToGroup', () => {
  test('should add user when not already in group', async () => {
    const existingChat = { users: ['u1'] };
    Chat.findOne.mockResolvedValue(existingChat);
    const updatedChat = { users: ['u1', 'u2'] };
    Chat.findByIdAndUpdate.mockResolvedValue(updatedChat);

    const req = { body: { userId: 'u2', chatId: 'c1' } };
    const res = mockRes();

    await addToGroup(req, res);

    expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
      $push: { users: 'u2' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(updatedChat);
  });

  test('should respond 409 when user already exists', async () => {
    const existingChat = { users: ['u2'] };
    Chat.findOne.mockResolvedValue(existingChat);

    const req = { body: { userId: 'u2', chatId: 'c1' } };
    const res = mockRes();

    await addToGroup(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith('user already exists');
  });
});

describe('removeFromGroup', () => {
  test('should remove user and respond 200', async () => {
    const existingChat = { users: ['u1', 'u2'] };
    Chat.findOne.mockResolvedValue(existingChat);
    const afterRemoval = { users: ['u1'] };
    // Mock chain: findByIdAndUpdate().populate().populate()
    Chat.findByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(afterRemoval),
      })),
    });

    const req = { body: { userId: 'u2', chatId: 'c1' } };
    const res = mockRes();

    await removeFromGroup(req, res);

    expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
      $pull: { users: 'u2' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(afterRemoval);
  });

  test('should respond 409 when user not in group', async () => {
    const existingChat = { users: ['u1'] };
    Chat.findOne.mockResolvedValue(existingChat);

    const req = { body: { userId: 'u2', chatId: 'c1' } };
    const res = mockRes();

    await removeFromGroup(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith('user doesnt exists');
  });
});