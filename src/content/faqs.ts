/**
 * Questions / Knowledge Center (spec §6).
 *
 * The content is deliberately structured — id, question, category, keywords,
 * and answer paragraphs — so a future approved-knowledge AI assistant can
 * answer from it without re-parsing marketing prose. The assistant itself is
 * out of scope for Phase 1 (spec §17).
 *
 * All answers must be reviewed and approved by TDR before publication
 * (spec §4: "All public marketing claims must be approved by TDR").
 */

export type Faq = {
  id: string;
  question: string;
  category: FaqCategory;
  keywords: string[];
  answer: string[];
  related?: string[];
};

export type FaqCategory =
  | "Getting Started"
  | "Survey Types"
  | "Technology"
  | "Deliverables"
  | "Working With TDR";

export const faqCategories: FaqCategory[] = [
  "Getting Started",
  "Survey Types",
  "Technology",
  "Deliverables",
  "Working With TDR",
];

export const faqs: Faq[] = [
  {
    id: "what-info-to-request-a-survey",
    question: "What information do I need to request a survey?",
    category: "Getting Started",
    keywords: ["request", "start", "quote", "proposal", "information", "apn", "address"],
    answer: [
      "To prepare an accurate proposal, TDR needs the project address, the assessor's parcel number (APN) if you have it, the property type, a short description of what you are trying to accomplish, and your timeframe.",
      "Anything you already have helps: an existing survey, a title report, architectural drawings, a site plan, or photographs. You can upload these directly on the Request a Proposal form.",
      "If you do not know which type of survey you need, describe the situation and TDR will recommend the appropriate scope.",
    ],
    related: ["how-do-i-find-my-apn", "what-is-included-in-a-survey"],
  },
  {
    id: "what-is-a-topographic-or-architectural-survey",
    question: "What is a topographic or architectural survey?",
    category: "Survey Types",
    keywords: ["topographic", "topo", "architectural", "existing conditions", "base map"],
    answer: [
      "A topographic survey maps the physical features of a site: ground elevations, structures, hardscape, walls, trees, visible utilities, driveways and the surrounding conditions that affect design.",
      "An architectural survey is a topographic survey prepared specifically for a design team, usually with more detail on the building itself — floor elevations, wall locations, openings, roof lines, and often interior conditions.",
      "Both produce a CAD base file the architect designs on top of. The more accurate that base file is, the fewer surprises appear during design and construction.",
    ],
    related: ["what-is-included-in-a-survey", "do-you-provide-cad-files"],
  },
  {
    id: "why-does-tdr-use-3d-scanning",
    question: "Why does TDR use 3D scanning?",
    category: "Technology",
    keywords: ["3d scanning", "lidar", "reality capture", "detail", "why"],
    answer: [
      "A conventional survey records a limited number of individually measured points. Anything between those points is interpolated — effectively an educated assumption about what is there.",
      "3D scanning measures millions of points, so existing conditions are captured as they actually are. That means fewer missed field conditions, better documentation for everyone on the project, and the ability to answer a dimension question later without another site visit.",
      "TDR treats scanning as part of the applicable survey workflow rather than a premium add-on, which is why TDR deliverables generally carry more measured detail than a conventional survey at a comparable price.",
    ],
    related: ["what-is-lidar", "can-you-provide-revit-bim"],
  },
  {
    id: "what-is-lidar",
    question: "What is LiDAR?",
    category: "Technology",
    keywords: ["lidar", "laser", "point cloud", "scanner"],
    answer: [
      "LiDAR stands for Light Detection and Ranging. A laser scanner sends out laser pulses and measures how long each one takes to return, which gives a precise distance to whatever the pulse hit.",
      "Repeating that measurement millions of times produces a point cloud: a dense, three-dimensional set of measured points that represents the real shape of a site or building.",
      "Those points are then registered together into a single coordinated dataset and used to produce CAD drawings, Revit models, or measured analysis.",
    ],
    related: ["why-does-tdr-use-3d-scanning", "do-you-provide-cad-files"],
  },
  {
    id: "what-is-included-in-a-survey",
    question: "What is included in a survey?",
    category: "Survey Types",
    keywords: ["included", "scope", "deliverable", "what do i get"],
    answer: [
      "Scope depends on the survey type and on what the project requires, so it is defined explicitly in every TDR proposal rather than assumed.",
      "A typical architectural or topographic survey includes record research, field measurement of the site and its improvements, spot and contour elevations, visible utilities, and a drafted CAD base file with a PDF.",
      "A boundary survey adds deed and record research, monument recovery, boundary resolution and, where appropriate, corner staking.",
      "If a specific item matters to your project — a neighbor's wall, a tree, an interior dimension, a roof feature — say so on the proposal request so it is written into the scope.",
    ],
    related: ["what-information-does-tdr-need-from-my-architect", "what-deliverables-will-my-architect-receive"],
  },
  {
    id: "how-long-does-a-survey-take",
    question: "How long does a survey take?",
    category: "Working With TDR",
    keywords: ["how long", "turnaround", "schedule", "timeline", "fast"],
    answer: [
      "Timeframe depends on the size and complexity of the site, access, record research requirements and current scheduling. Every TDR proposal states the expected schedule.",
      "Fast turnaround is one of the reasons clients use TDR. Scanning also compresses field time, because a scanner captures in minutes what would take substantially longer to measure point by point.",
      "If you have a hard deadline — a plan-check submittal, an escrow date, a design deadline — note it on the proposal request so scheduling can be confirmed up front.",
    ],
  },
  {
    id: "do-you-provide-cad-files",
    question: "Do you provide CAD files?",
    category: "Deliverables",
    keywords: ["cad", "dwg", "autocad", "civil 3d", "file format"],
    answer: [
      "Yes. TDR delivers native CAD files, normally AutoCAD .dwg, in the version and layer standard your design team uses.",
      "Tell TDR the CAD version and any office standards you need followed and the deliverable will be prepared accordingly. Where scanning was used, the registered point cloud can be provided alongside the drafted CAD.",
    ],
    related: ["can-you-provide-revit-bim", "what-deliverables-will-my-architect-receive"],
  },
  {
    id: "can-you-provide-revit-bim",
    question: "Can you provide Revit / BIM?",
    category: "Deliverables",
    keywords: ["revit", "bim", "model", "lod", "scan to bim"],
    answer: [
      "Yes. TDR produces native Revit models from scan data, built to an agreed level of development (LOD) and modeling scope.",
      "Because the model is derived from measured scan data rather than hand measurements, it reflects the building as it actually is — including walls that are not square and floors that are not level.",
      "Confirm the Revit version, the required LOD and which disciplines need to be modeled when you request the proposal, so the scope matches how the model will be used.",
    ],
    related: ["do-you-provide-cad-files", "why-does-tdr-use-3d-scanning"],
  },
  {
    id: "what-is-an-alta-survey",
    question: "What is an ALTA survey?",
    category: "Survey Types",
    keywords: ["alta", "nsps", "title", "commercial", "lender"],
    answer: [
      "An ALTA/NSPS Land Title Survey is the standard survey used in commercial real-estate transactions. It is prepared to a national standard jointly adopted by the American Land Title Association and the National Society of Professional Surveyors.",
      "It combines a boundary survey with a review of the title commitment: recorded easements and exceptions are plotted, improvements and encroachments are shown, and specific optional items from the standard's Table A are included when requested.",
      "Lenders, buyers and title companies typically specify which Table A items they require. Providing the title commitment and that requirement list with your proposal request produces a far more accurate proposal.",
    ],
    related: ["do-i-need-a-boundary-survey"],
  },
  {
    id: "do-i-need-a-boundary-survey",
    question: "Do I need a boundary survey?",
    category: "Survey Types",
    keywords: ["boundary", "property line", "fence", "setback", "neighbor"],
    answer: [
      "A boundary survey is normally needed when the exact property line matters: building a fence or wall, designing an addition close to a line, resolving a dispute with a neighbor, or meeting a lender or agency requirement.",
      "It is often not required when you only need to document existing site conditions for design and the property line is not a constraint. In that case an architectural or topographic survey may be enough.",
      "If you are not certain, describe the project on the proposal request. TDR will tell you which survey the project actually needs rather than defaulting to the largest scope.",
    ],
    related: ["what-is-an-alta-survey", "what-is-a-topographic-or-architectural-survey"],
  },
  {
    id: "how-do-i-find-my-apn",
    question: "How do I find my APN?",
    category: "Getting Started",
    keywords: ["apn", "parcel number", "assessor", "tax bill"],
    answer: [
      "The APN — Assessor's Parcel Number — is the number the county uses to identify your property. It appears on your property tax bill, on your grant deed, and in your title report.",
      "It can also be looked up on the county assessor's public parcel search using the property address.",
      "The APN is helpful but not required. If you cannot find it, provide the property address and TDR will locate the parcel.",
    ],
    related: ["what-info-to-request-a-survey"],
  },
  {
    id: "what-information-does-tdr-need-from-my-architect",
    question: "What information does TDR need from my architect?",
    category: "Working With TDR",
    keywords: ["architect", "coordination", "cad standards", "scope"],
    answer: [
      "The most useful items are the intended CAD or Revit format and version, the level of detail the design requires, whether interior conditions are needed, and any office standards the base file must follow.",
      "If the architect has a specific list of what must appear on the survey — for example roof detail, interior floor elevations, adjacent structures, or a particular datum — TDR will write those items into the scope.",
      "Existing drawings, a prior survey, or a site plan from the architect also help TDR scope the work accurately.",
    ],
    related: ["what-deliverables-will-my-architect-receive"],
  },
  {
    id: "what-deliverables-will-my-architect-receive",
    question: "What deliverables will my architect receive?",
    category: "Deliverables",
    keywords: ["deliverables", "architect", "dwg", "pdf", "point cloud", "revit"],
    answer: [
      "For a typical architectural or topographic survey, the architect receives a drafted CAD base file (.dwg) and a signed PDF of the survey.",
      "Where scanning was used, the registered point cloud can be provided as well, so the design team can pull additional dimensions later without another site visit.",
      "Revit / BIM models, scan-to-CAD deliverables and specialized exhibits are available and are quoted as part of the proposal scope.",
    ],
    related: ["do-you-provide-cad-files", "can-you-provide-revit-bim"],
  },
];

export const faqById = (id: string) => faqs.find((f) => f.id === id);
