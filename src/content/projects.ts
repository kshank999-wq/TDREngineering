/**
 * Featured project examples (spec §4 step 6, §21 Phase 1C).
 *
 * TODO(tdr): the entries below are structural placeholders describing the
 * *kind* of work TDR does. Replace them with real project pages and approved
 * imagery migrated from the legacy site during Phase 1A, and confirm every
 * client name is cleared for public use before publication (spec §4: all
 * public marketing claims must be approved by TDR).
 *
 * Anything not yet approved should simply be omitted — an empty list renders a
 * clean "migration in progress" state rather than a broken grid.
 */

export type Project = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  services: string[];
  /** Approved public client name, or null when the client is not disclosed. */
  client: string | null;
  location: string | null;
};

export const projects: Project[] = [
  {
    slug: "example-adaptive-reuse",
    title: "Adaptive reuse of a mid-century commercial building",
    category: "Architectural scanning",
    summary:
      "Full interior and exterior scan of an existing structure, delivered as a Revit model the design team used as the basis for a change-of-use renovation.",
    services: ["architectural-scanning", "scan-to-bim", "architectural-topographic-survey"],
    client: null,
    location: null,
  },
  {
    slug: "example-hillside-residence",
    title: "Hillside residential site development",
    category: "Survey + civil engineering",
    summary:
      "Topographic survey of a steep constrained lot followed by grading and drainage design carried through agency plan check.",
    services: ["architectural-topographic-survey", "grading", "drainage", "hillside-development"],
    client: null,
    location: null,
  },
  {
    slug: "example-industrial-facility",
    title: "Industrial facility existing-conditions capture",
    category: "Industrial scanning",
    summary:
      "Registered capture of an operating facility documenting structure, equipment and clearances for a retrofit, scheduled around plant operations.",
    services: ["industrial-scanning", "existing-conditions", "structural-documentation"],
    client: null,
    location: null,
  },
];
