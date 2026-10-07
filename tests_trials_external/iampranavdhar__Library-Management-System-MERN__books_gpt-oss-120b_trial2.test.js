import { jest } from '@jest/globals';
import request from "supertest";
import express from "express";
import router from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/books.js';

jest.mock("../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js", () => {
  const saveMock = jest.fn();
  const BookMock = jest.fn().mockImplementation(() => ({
    save: saveMock,
  }));
  BookMock.find = jest.fn();
  BookMock.findById = jest.fn();
  BookMock.findByIdAndUpdate = jest.fn();
  BookMock.findOne = jest.fn();
  BookMock.updateMany = jest.fn();
  return { default: BookMock };
});

jest.mock("../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookCategory.js", () => {
  const BookCategoryMock = jest.fn();
  BookCategoryMock.findOne = jest.fn();
  BookCategoryMock.updateMany = jest.fn();
  return { default: BookCategoryMock };
});

import Book from "../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js";
import BookCategory from "../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookCategory.js";

const app = express();
app.use(express.json());
app.use("/", router);

beforeEach(() => {
  jest.clearAllMocks();
});

/* ---------- GET /allbooks ---------- */
test("GET /allbooks returns books with status 200", async () => {
  const mockBooks = [{ _id: "1", title: "Mock Book" }];
  const sortMock = jest.fn().mockResolvedValue(mockBooks);
  const populateMock = jest.fn(() => ({ sort: sortMock }));
  Book.find.mockReturnValue({ populate: populateMock });

  const res = await request(app).get("/allbooks");
  expect(res.status).toBe(200);
  expect(res.body).toEqual(mockBooks);
  expect(Book.find).toHaveBeenCalledWith({});
  expect(populateMock).toHaveBeenCalledWith("transactions");
  expect(sortMock).toHaveBeenCalledWith({ _id: -1 });
});

/* ---------- GET /getbook/:id ---------- */
test("GET /getbook/:id returns a single book with status 200", async () => {
  const mockBook = { _id: "abc123", title: "Single Book" };
  const populateMock = jest.fn().mockResolvedValue(mockBook);
  Book.findById.mockReturnValue({ populate: populateMock });

  const res = await request(app).get("/getbook/abc123");
  expect(res.status).toBe(200);
  expect(res.body).toEqual(mockBook);
  expect(Book.findById).toHaveBeenCalledWith("abc123");
  expect(populateMock).toHaveBeenCalledWith("transactions");
});

/* ---------- GET / (by category) ---------- */
test("GET / with category query returns books of that category", async () => {
  const mockCategoryResult = { _id: "cat1", categoryName: "Fiction", books: [] };
  const populateMock = jest.fn().mockResolvedValue(mockCategoryResult);
  BookCategory.findOne.mockReturnValue({ populate: populateMock });

  const res = await request(app).get("/?category=Fiction");
  expect(res.status).toBe(200);
  expect(res.body).toEqual(mockCategoryResult);
  expect(BookCategory.findOne).toHaveBeenCalledWith({ categoryName: "Fiction" });
  expect(populateMock).toHaveBeenCalledWith("books");
});

/* ---------- POST /addbook (admin) ---------- */
test("POST /addbook with admin creates a book and returns it", async () => {
  const newBookData = {
    isAdmin: true,
    bookName: "New Book",
    alternateTitle: "Alt Title",
    author: "Author",
    bookCountAvailable: 5,
    language: "English",
    publisher: "Pub",
    bookSatus: "available",
    categories: ["catId1", "catId2"],
  };
  const savedBook = { _id: "newId", ...newBookData };
  // mock the constructor instance's save()
  Book.mockImplementation(() => ({
    save: jest.fn().mockResolvedValue(savedBook),
  }));
  // mock updateMany
  BookCategory.updateMany.mockResolvedValue({});

  const res = await request(app).post("/addbook").send(newBookData);
  expect(res.status).toBe(200);
  expect(res.body).toEqual(savedBook);
  expect(Book).toHaveBeenCalledWith({
    bookName: newBookData.bookName,
    alternateTitle: newBookData.alternateTitle,
    author: newBookData.author,
    bookCountAvailable: newBookData.bookCountAvailable,
    language: newBookData.language,
    publisher: newBookData.publisher,
    bookStatus: newBookData.bookSatus,
    categories: newBookData.categories,
  });
  expect(BookCategory.updateMany).toHaveBeenCalledWith(
    { _id: savedBook.categories },
    { $push: { books: savedBook._id } }
  );
});

/* ---------- POST /addbook (non‑admin) ---------- */
test("POST /addbook without admin rights returns 403", async () => {
  const res = await request(app).post("/addbook").send({ isAdmin: false });
  expect(res.status).toBe(403);
  expect(res.body).toBe("You dont have permission to delete a book!");
});

/* ---------- PUT /updatebook/:id (admin) ---------- */
test("PUT /updatebook/:id with admin updates a book", async () => {
  Book.findByIdAndUpdate.mockResolvedValue({});
  const updatePayload = { isAdmin: true, title: "Updated Title" };

  const res = await request(app)
    .put("/updatebook/12345")
    .send(updatePayload);

  expect(res.status).toBe(200);
  expect(res.body).toBe("Book details updated successfully");
  expect(Book.findByIdAndUpdate).toHaveBeenCalledWith("12345", {
    $set: updatePayload,
  });
});

/* ---------- PUT /updatebook/:id (non‑admin) ---------- */
test("PUT /updatebook/:id without admin returns 403", async () => {
  const res = await request(app)
    .put("/updatebook/12345")
    .send({ isAdmin: false });

  expect(res.status).toBe(403);
  expect(res.body).toBe("You dont have permission to delete a book!");
});

/* ---------- DELETE /removebook/:id (admin) ---------- */
test("DELETE /removebook/:id with admin removes a book", async () => {
  const mockBook = {
    _id: "delId",
    categories: ["catA"],
    remove: jest.fn().mockResolvedValue(),
  };
  Book.findOne.mockResolvedValue(mockBook);
  BookCategory.updateMany.mockResolvedValue({});

  const res = await request(app)
    .delete("/removebook/delId")
    .send({ isAdmin: true });

  expect(res.status).toBe(200);
  expect(res.body).toBe("Book has been deleted");
  expect(Book.findOne).toHaveBeenCalledWith({ _id: "delId" });
  expect(mockBook.remove).toHaveBeenCalled();
  expect(BookCategory.updateMany).toHaveBeenCalledWith(
    { _id: mockBook.categories },
    { $pull: { books: mockBook._id } }
  );
});

/* ---------- DELETE /removebook/:id (non‑admin) ---------- */
test("DELETE /removebook/:id without admin returns 403", async () => {
  const res = await request(app)
    .delete("/removebook/anyId")
    .send({ isAdmin: false });

  expect(res.status).toBe(403);
  expect(res.body).toBe("You dont have permission to delete a book!");
});

/* ---------- Error handling for /allbooks ---------- */
test("GET /allbooks propagates model error as 504", async () => {
  Book.find.mockImplementation(() => ({
    populate: () => ({
      sort: () => Promise.reject(new Error("DB fail")),
    }),
  }));
  const res = await request(app).get("/allbooks");
  expect(res.status).toBe(504);
  expect(res.body).toEqual({ message: "DB fail" });
});