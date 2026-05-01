import { openDB, IDBPDatabase } from "idb";

export interface SyncPayload {
  id?: number;
  type: "ESCALATION_QUERY" | "SENSOR_LOG";
  data: unknown;
  timestamp: number;
}

const DB_NAME = "resilnode-sync";
const STORE_NAME = "delta-queue";

export class SyncQueue {
  private db: Promise<IDBPDatabase> | null = null;

  constructor(dbName: string = DB_NAME) {
    if (typeof indexedDB !== "undefined") {
      this.db = openDB(dbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, {
              keyPath: "id",
              autoIncrement: true,
            });
          }
        },
      });
    }
  }

  async enqueuePayload(payload: Omit<SyncPayload, "id">): Promise<number> {
    if (!this.db) throw new Error("SyncQueue not initialized on client.");
    const db = await this.db;
    return db.add(STORE_NAME, payload) as Promise<number>;
  }

  async getQueueCount(): Promise<number> {
    if (!this.db) return 0;
    const db = await this.db;
    return db.count(STORE_NAME);
  }

  async getAllPayloads(): Promise<SyncPayload[]> {
    if (!this.db) return [];
    const db = await this.db;
    return db.getAll(STORE_NAME);
  }

  async dequeuePayload(id: number): Promise<void> {
    if (!this.db) return;
    const db = await this.db;
    await db.delete(STORE_NAME, id);
  }

  async clear(): Promise<void> {
    if (!this.db) return;
    const db = await this.db;
    await db.clear(STORE_NAME);
  }

  async flushQueue(dataChannel: Pick<RTCDataChannel, "readyState" | "send">) {
    if (dataChannel.readyState !== "open") return 0;

    const payloads = await this.getAllPayloads();
    let flushed = 0;

    for (const payload of payloads) {
      try {
        dataChannel.send(JSON.stringify(payload));
        if (payload.id !== undefined) {
          await this.dequeuePayload(payload.id);
          flushed++;
        }
      } catch (error) {
        console.error("[SyncQueue] Failed to flush payload:", error);
        break;
      }
    }

    return flushed;
  }
}

export const syncQueue = new SyncQueue();
