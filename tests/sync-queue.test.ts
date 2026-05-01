import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { SyncPayload, SyncQueue } from "../lib/sync-queue";

function testDbName() {
  return `resilnode-sync-test-${crypto.randomUUID()}`;
}

function payload(label: string): Omit<SyncPayload, "id"> {
  return {
    type: "ESCALATION_QUERY",
    data: { label },
    timestamp: Date.now(),
  };
}

describe("SyncQueue", () => {
  it("enqueues payloads and returns them in insertion order", async () => {
    const queue = new SyncQueue(testDbName());

    const firstId = await queue.enqueuePayload(payload("first"));
    const secondId = await queue.enqueuePayload(payload("second"));

    expect(await queue.getQueueCount()).toBe(2);
    expect(await queue.getAllPayloads()).toMatchObject([
      { id: firstId, data: { label: "first" } },
      { id: secondId, data: { label: "second" } },
    ]);
  });

  it("dequeues a payload by id", async () => {
    const queue = new SyncQueue(testDbName());
    const id = await queue.enqueuePayload(payload("stale"));

    await queue.dequeuePayload(id);

    expect(await queue.getQueueCount()).toBe(0);
  });

  it("flushes open data channels and removes sent payloads", async () => {
    const queue = new SyncQueue(testDbName());
    await queue.enqueuePayload(payload("alpha"));
    await queue.enqueuePayload(payload("beta"));
    const sent: string[] = [];

    const flushed = await queue.flushQueue({
      readyState: "open",
      send: ((data: string) => {
        sent.push(data);
      }) as RTCDataChannel["send"],
    });

    expect(flushed).toBe(2);
    expect(sent.map((item) => JSON.parse(item).data.label)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(await queue.getQueueCount()).toBe(0);
  });

  it("does not flush closed data channels", async () => {
    const queue = new SyncQueue(testDbName());
    await queue.enqueuePayload(payload("queued"));

    const flushed = await queue.flushQueue({
      readyState: "closed",
      send: (() => {
        throw new Error("send should not be called");
      }) as RTCDataChannel["send"],
    });

    expect(flushed).toBe(0);
    expect(await queue.getQueueCount()).toBe(1);
  });

  it("retains unsent payloads when a send fails", async () => {
    const queue = new SyncQueue(testDbName());
    await queue.enqueuePayload(payload("retain"));

    const flushed = await queue.flushQueue({
      readyState: "open",
      send: (() => {
        throw new Error("radio unavailable");
      }) as RTCDataChannel["send"],
    });

    expect(flushed).toBe(0);
    expect(await queue.getQueueCount()).toBe(1);
  });
});
