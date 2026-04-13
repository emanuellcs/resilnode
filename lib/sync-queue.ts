import { openDB, IDBPDatabase } from 'idb';

export interface SyncPayload {
  id?: number;
  type: 'ESCALATION_QUERY' | 'SENSOR_LOG';
  data: unknown;
  timestamp: number;
}

const DB_NAME = 'resilnode-sync';
const STORE_NAME = 'delta-queue';

export class SyncQueue {
  private db: Promise<IDBPDatabase>;

  constructor() {
    this.db = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      },
    });
  }

  async enqueuePayload(payload: Omit<SyncPayload, 'id'>) {
    const db = await this.db;
    await db.add(STORE_NAME, payload);
    // console.log('[SyncQueue] Payload enqueued');
  }

  async getQueueCount(): Promise<number> {
    const db = await this.db;
    return db.count(STORE_NAME);
  }

  async getAllPayloads(): Promise<SyncPayload[]> {
    const db = await this.db;
    return db.getAll(STORE_NAME);
  }

  async dequeuePayload(id: number) {
    const db = await this.db;
    await db.delete(STORE_NAME, id);
  }

  /**
   * Transmits all queued payloads over a functional RTCDataChannel.
   */
  async flushQueue(dataChannel: RTCDataChannel) {
    if (dataChannel.readyState !== 'open') return;

    const payloads = await this.getAllPayloads();
    for (const payload of payloads) {
      try {
        dataChannel.send(JSON.stringify(payload));
        if (payload.id !== undefined) {
          await this.dequeuePayload(payload.id);
        }
      } catch (error) {
        console.error('[SyncQueue] Failed to flush payload:', error);
        break; // Stop flushing if the channel fails
      }
    }
  }
}

export const syncQueue = new SyncQueue();
