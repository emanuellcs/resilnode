/**
 * Simple text chunking utility for RAG indexing.
 * Splits text into segments with overlapping boundaries.
 */
export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50,
): string[] {
  if (chunkSize <= 0) {
    throw new RangeError("chunkSize must be greater than zero.");
  }
  if (overlap < 0 || overlap >= chunkSize) {
    throw new RangeError(
      "overlap must be non-negative and smaller than chunkSize.",
    );
  }

  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * Built-in sample datasets for local RAG smoke testing.
 */
export const CRISIS_DATASETS = [
  {
    title: "Memorial Hospital Structural Blueprint (South Wing)",
    content: `
      Structural Analysis: South Wing, Memorial Hospital.
      Foundation: Reinforced concrete pillars, Type-4 seismic damping.
      Load-bearing capacity: 2000 tons per pillar.
      Emergency exits: Stairwell B (West wall), Stairwell C (East wall).
      Hazard zones: Oxygen storage tanks located in sub-basement level 2.
      Roof structure: Steel truss assembly, lightweight aluminum cladding.
      Extraction protocol: Use hydraulic spreaders on pillars 14-22 if collapsed. 
      Avoid North wall due to proximity to gas lines.
    `.repeat(5), // Simulate a large document
  },
  {
    title: "Emergency Medical Protocol - Triage Tier 1",
    content: `
      Disaster Triage Protocol (DTP-1):
      Red Tag: Immediate life-threatening injury. Breathing > 30 bpm, pulse weak.
      Yellow Tag: Delayed treatment. Serious but stable.
      Green Tag: Minor injury. 'Walking wounded'.
      Black Tag: Deceased or non-salvageable.
      Medication: Morphine 2mg IV for pain if stable. 
      Severe crush injury: Fluid resuscitation 1L/hr to prevent kidney failure.
    `.repeat(5),
  },
];
