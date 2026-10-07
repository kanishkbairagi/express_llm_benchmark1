import { jest } from '@jest/globals';
import request from "supertest";
import express from "express";
import router from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/users.js';
import bcrypt from "bcrypt";

// Mock User model
jest.mock("../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js", () => {
  const mockUserDoc = {
    _doc: {
      _id: "user123",
      username: "testuser",
      email: "test@example.com",
      password: "hashedpwd",
      updatedAt: "2023-01-01T00:00:00.000Z",
      otherField: "value",
    },
    updateOne: jest.fn(() => Promise.resolve()),
  };

  const mockFindById = jest.fn(() => ({
    populate: jest.fn(() => ({
      populate: jest.fn(() => Promise.resolve(mockUserDoc)),
    })),
  }));

  const mockFind = jest.fn(() => ({
    populate: jest.fn(() => ({
      populate: jest.fn(() => ({
        sort: jest.fn(() => Promise.resolve([mockUserDoc])),
      })),
    })),
  }));

  const mockFindByIdAndUpdate = jest.fn(() => Promise.resolve());
  const mockFindByIdAndDelete = jest.fn(() => Promise.resolve());

  return {
    __esModule: true,
    default: {
      findById: mockFindById,
      find: mockFind,
      findByIdAndUpdate: mockFindByIdAndUpdate,
      findByIdAndDelete: mockFindByIdAndDelete,
    },
  };
});

// Mock bcrypt
jest.mock("bcrypt", () => ({
  genSalt: jest.fn(() => Promise.resolve("salt")),
  hash: jest.fn(() => Promise.resolve("hashedNewPwd")),
}));

const app = express();
app.use(express.json());
app.use("/", router);

describe("User routes", () => {
  test("GET /getuser/:id returns sanitized user", async () => {
    const res = await request(app).get("/getuser/user123");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      _id: "user123",
      username: "testuser",
      email: "test@example.com",
      otherField: "value",
    });
    // password and updatedAt should be omitted
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("updatedAt");
  });

  test("GET /allmembers returns list of users", async () => {
    const res = await request(app).get("/allmembers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      _id: "user123",
      username: "testuser",
    });
  });

  test("PUT /updateuser/:id updates when authorized", async () => {
    const res = await request(app)
      .put("/updateuser/user123")
      .send({ userId: "user123", isAdmin: false, username: "newname" });
    expect(res.status).toBe(200);
    expect(res.body).toBe("Account has been updated");
  });

  test("PUT /updateuser/:id hashes password when provided", async () => {
    const res = await request(app)
      .put("/updateuser/user123")
      .send({ userId: "user123", password: "newpwd" });
    expect(res.status).toBe(200);
    expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
    expect(bcrypt.hash).toHaveBeenCalledWith("newpwd", "salt");
  });

  test("PUT /updateuser/:id returns 403 when unauthorized", async () => {
    const res = await request(app)
      .put("/updateuser/user123")
      .send({ userId: "otherUser", isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.body).toBe("You can update only your account!");
  });

  test("PUT /:id/move-to-activetransactions adds transaction when admin", async () => {
    const res = await request(app)
      .put("/txn123/move-to-activetransactions")
      .send({ isAdmin: true, userId: "user123" });
    expect(res.status).toBe(200);
    expect(res.body).toBe("Added to Active Transaction");
    const { default: User } = await import(
      "../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js"
    );
    const userInstance = User.default.findById.mock.results[0].value;
    expect(userInstance.updateOne).toHaveBeenCalledWith({
      $push: { activeTransactions: "txn123" },
    });
  });

  test("PUT /:id/move-to-activetransactions returns 403 when not admin", async () => {
    const res = await request(app)
      .put("/txn123/move-to-activetransactions")
      .send({ isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.body).toBe("Only Admin can add a transaction");
  });

  test("PUT /:id/move-to-prevtransactions moves transaction when admin", async () => {
    const res = await request(app)
      .put("/txn123/move-to-prevtransactions")
      .send({ isAdmin: true, userId: "user123" });
    expect(res.status).toBe(200);
    expect(res.body).toBe("Added to Prev transaction Transaction");
    const { default: User } = await import(
      "../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js"
    );
    const userInstance = User.default.findById.mock.results[0].value;
    expect(userInstance.updateOne).toHaveBeenCalledWith({
      $pull: { activeTransactions: "txn123" },
    });
    expect(userInstance.updateOne).toHaveBeenCalledWith({
      $push: { prevTransactions: "txn123" },
    });
  });

  test("PUT /:id/move-to-prevtransactions returns 403 when not admin", async () => {
    const res = await request(app)
      .put("/txn123/move-to-prevtransactions")
      .send({ isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.body).toBe("Only Admin can do this");
  });

  test("DELETE /deleteuser/:id deletes when authorized", async () => {
    const res = await request(app)
      .delete("/deleteuser/user123")
      .send({ userId: "user123" });
    expect(res.status).toBe(200);
    expect(res.body).toBe("Account has been deleted");
  });

  test("DELETE /deleteuser/:id returns 403 when unauthorized", async () => {
    const res = await request(app)
      .delete("/deleteuser/user123")
      .send({ userId: "otherUser" });
    expect(res.status).toBe(403);
    expect(res.body).toBe("You can delete only your account!");
  });
});