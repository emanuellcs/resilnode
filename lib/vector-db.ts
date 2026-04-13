import { openDB, IDBPDatabase } from 'idb';

export interface DocumentRecord {
  id?: number;
  text: string;
  embedding: number[]; // Store as normal array in IndexedDB
}

const DB_NAME = 'resilnode-vector-store';
const STORE_NAME = 'documents';

/**
 * Calculates the cosine similarity between two vectors.
 * Returns a value between -1 and 1.
 */
export function cosineSimilarity(vecA: number[] | Float32Array, vecB: number[] | Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class VectorStore {
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = this.initialize();
  }

  private async initialize(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }

  async addDocument(text: string, embedding: number[] | Float32Array): Promise<number> {
    const db = await this.dbPromise;
    // Ensure it's a standard array for IndexedDB compatibility
    const embeddingArray = embedding instanceof Float32Array ? Array.from(embedding) : embedding;
    
    return db.add(STORE_NAME, {
      text,
      embedding: embeddingArray,
    });
  }

  async getDocumentCount(): Promise<number> {
    const db = await this.dbPromise;
    return db.count(STORE_NAME);
  }

  /**
   * Performs a brute-force cosine similarity search against all stored documents.
   * Optimized for edge deployment with limited document sets (e.g., specific blueprints).
   */
  async similaritySearch(queryEmbedding: number[] | Float32Array, topK: number = 3): Promise<DocumentRecord[]> {
    const db = await this.dbPromise;
    const allDocs: DocumentRecord[] = await db.getAll(STORE_NAME);

    if (allDocs.length === 0) return [];

    const scoredDocs = allDocs.map(doc => {
      const score = cosineSimilarity(queryEmbedding, doc.embedding);
      return { doc, score };
    });

    // Sort descending by score
    scoredDocs.sort((a, b) => b.score - a.score);

    return scoredDocs.slice(0, topK).map(item => item.doc);
  }

  async clearStore(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear(STORE_NAME);
  }
}

export const vectorStore = new VectorStore();
