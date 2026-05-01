import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "../lib/vector-db";

describe("cosineSimilarity", () => {
  it("returns 1 for identical non-zero vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 when either vector has zero magnitude", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
  });

  it("throws when vectors have different dimensions", () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow(RangeError);
  });
});
