import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createMetadataWriteQueue } from "../../server/metadata-write-queue.mjs";

class TestRequest extends EventEmitter {
  constructor(method = "PATCH") {
    super();
    this.method = method;
    this.aborted = false;
    this.destroyed = false;
  }
}

class TestResponse extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
  }
}

function flushQueue() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("metadata writes execute in arrival order and release once", async () => {
  const queue = createMetadataWriteQueue();
  const events = [];
  const firstResponse = new TestResponse();
  const secondResponse = new TestResponse();

  queue(new TestRequest("PATCH"), firstResponse, () => events.push("first"));
  queue(new TestRequest("DELETE"), secondResponse, () => events.push("second"));
  await flushQueue();
  assert.deepEqual(events, ["first"]);

  firstResponse.emit("finish");
  firstResponse.emit("close");
  await flushQueue();
  assert.deepEqual(events, ["first", "second"]);
  secondResponse.emit("finish");
});

test("metadata queue skips a disconnected waiter without blocking later writes", async () => {
  const queue = createMetadataWriteQueue();
  const events = [];
  const firstResponse = new TestResponse();
  const waitingRequest = new TestRequest("POST");
  const waitingResponse = new TestResponse();
  const thirdResponse = new TestResponse();

  queue(new TestRequest("PATCH"), firstResponse, () => events.push("first"));
  queue(waitingRequest, waitingResponse, () => events.push("disconnected"));
  queue(new TestRequest("PUT"), thirdResponse, () => events.push("third"));
  await flushQueue();
  waitingRequest.aborted = true;
  waitingRequest.emit("aborted");
  firstResponse.emit("finish");
  await flushQueue();
  await flushQueue();
  assert.deepEqual(events, ["first", "third"]);
  thirdResponse.emit("finish");
});

test("metadata queue does not serialize read-only requests", () => {
  const queue = createMetadataWriteQueue();
  let calls = 0;
  queue(new TestRequest("GET"), new TestResponse(), () => { calls += 1; });
  queue(new TestRequest("HEAD"), new TestResponse(), () => { calls += 1; });
  assert.equal(calls, 2);
});

test("metadata queue does not treat a consumed request stream as a disconnected client", async () => {
  const queue = createMetadataWriteQueue();
  const request = new TestRequest("POST");
  request.destroyed = true;
  const response = new TestResponse();
  let calls = 0;

  queue(request, response, () => { calls += 1; });
  await flushQueue();

  assert.equal(calls, 1);
  response.emit("finish");
});

test("metadata queue releases the slot when downstream throws synchronously", async () => {
  const queue = createMetadataWriteQueue();
  const errors = [];
  const events = [];
  queue(new TestRequest("PATCH"), new TestResponse(), (error) => {
    if (error) {
      errors.push(error.message);
      return;
    }
    throw new Error("downstream failed");
  });
  queue(new TestRequest("POST"), new TestResponse(), () => events.push("next"));
  await flushQueue();
  await flushQueue();
  assert.deepEqual(errors, ["downstream failed"]);
  assert.deepEqual(events, ["next"]);
});
