import * as controllerModule from '../dataset/01_auth_controller.js';

function isExpressRouter(fn) {
  if (typeof fn !== 'function') return false;
  if (fn.name === 'router') return true;
  if (Array.isArray(fn.stack)) return true;
  if (typeof fn.use === 'function' && typeof fn.route === 'function') return true;
  return false;
}

function createMockRes() {
  const res = {};
  res.status = function() { return res; };
  res.json = function() { return res; };
  res.send = function() { return res; };
  res.end = function() { return res; };
  res.cookie = function() { return res; };
  res.redirect = function() { return res; };
  res.sendStatus = function() { return res; };
  res.setHeader = function() { return res; };
  res.header = function() { return res; };
  res.type = function() { return res; };
  res.contentType = function() { return res; };
  res.location = function() { return res; };
  return res;
}

function createMockNext() {
  return function() {};
}

function runWithTimeout(fn, req, res, next, ms = 2000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let done = false;

    timer = setTimeout(() => {
      done = true;
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);

    try {
      Promise.resolve(fn(req, res, next))
        .then((val) => {
          if (!done) {
            clearTimeout(timer);
            resolve({ status: 'resolved', value: val });
          }
        })
        .catch((err) => {
          if (!done) {
            clearTimeout(timer);
            resolve({ status: 'rejected', error: err });
          }
        });
    } catch (syncErr) {
      if (!done) {
        clearTimeout(timer);
        resolve({ status: 'rejected', error: syncErr });
      }
    }
  });
}

const targetFunctions = [];

// Named exports
for (const [key, value] of Object.entries(controllerModule)) {
  if (key === 'default') continue;
  if (typeof value === 'function' && !isExpressRouter(value)) {
    targetFunctions.push({ name: key, fn: value });
  }
}

// Functions on default export object or default function
if (controllerModule.default) {
  if (typeof controllerModule.default === 'function' && !isExpressRouter(controllerModule.default)) {
    targetFunctions.push({ name: 'default', fn: controllerModule.default });
  } else if (typeof controllerModule.default === 'object' && controllerModule.default !== null) {
    for (const [key, value] of Object.entries(controllerModule.default)) {
      if (typeof value === 'function' && !isExpressRouter(value)) {
        targetFunctions.push({ name: `default.${key}`, fn: value });
      }
    }
  }
}

const seenFns = new Set();
const uniqueTargets = [];
for (const target of targetFunctions) {
  if (!seenFns.has(target.fn)) {
    seenFns.add(target.fn);
    uniqueTargets.push(target);
  }
}

describe('Naive baseline tests', () => {
  for (const { name, fn } of uniqueTargets) {
    describe(`Function: ${name}`, () => {
      test('case 1: empty req/res/next mocks', async () => {
        const req = {};
        const res = createMockRes();
        const next = createMockNext();
        let settled = false;
        try {
          await runWithTimeout(fn, req, res, next, 2000);
          settled = true;
        } catch (err) {
          settled = false;
        }
        expect(settled).toBe(true);
      });

      test('case 2: req with empty body, params and query', async () => {
        const req = { body: {}, params: {}, query: {} };
        const res = createMockRes();
        const next = createMockNext();
        let settled = false;
        try {
          await runWithTimeout(fn, req, res, next, 2000);
          settled = true;
        } catch (err) {
          settled = false;
        }
        expect(settled).toBe(true);
      });

      test('case 3: req with a user object', async () => {
        const req = {
          user: { id: 'test-user-id', _id: 'test-user-id', role: 'admin', email: 'test@example.com' },
          body: {},
          params: {},
          query: {}
        };
        const res = createMockRes();
        const next = createMockNext();
        let settled = false;
        try {
          await runWithTimeout(fn, req, res, next, 2000);
          settled = true;
        } catch (err) {
          settled = false;
        }
        expect(settled).toBe(true);
      });
    });
  }
});
