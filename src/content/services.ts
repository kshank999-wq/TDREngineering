/**
 * TDR service architecture (spec §5) and the requestable service list used by
 * the Request a Proposal form (spec §7).
 *
 * `code` values are stable and are seeded into the Supabase `services` table by
 * supabase/migrations/0001_init.sql. Do not rename a code once it has been used
 * on a live opportunity — add a new one and archive the old row instead.
 */

export type ServiceCategory = "land-surveying" | "civil-engineering" | "3d-scanning";

export type ConditionalQuestion = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  options?: string[];
  help?: string;
};

export type Service = {
  code: string;
  name: string;
  category: ServiceCategory;
  /** Short line used on cards and in the services index. */
  summary: string;
  /** Longer copy for the detail page. Reviewed by TDR before launch. */
  body: string[];
  highlights: string[];
  /** Whether a dedicated /services/[code] page is generated. */
  hasPage: boolean;
  /** Whether the service appears as a checkbox on the proposal form. */
  requestable: boolean;
  /** Label used on the proposal form when it differs from `name`. */
  requestLabel?: string;
  /** Follow-up questions shown only when this service is selected. */
  questions?: ConditionalQuestion[];
};

export const categories: Record<
  ServiceCategory,
  { name: string; slug: ServiceCategory; blurb: string }
> = {
  "land-surveying": {
    name: "Land Surveying",
    slug: "land-surveying",
    blurb:
      "Boundary, architectural, topographic, ALTA, construction and as-built surveying performed with current field technology.",
  },
  "civil-engineering": {
    name: "Civil Engineering",
    slug: "civil-engineering",
    blurb:
      "Grading, drainage, hydrology and site development engineering, from feasibility through construction support.",
  },
  "3d-scanning": {
    name: "3D Scanning & Reality Capture",
    slug: "3d-scanning",
    blurb:
      "LiDAR and reality capture that documents existing conditions in far greater detail than a conventional field survey.",
  },
};

export const services: Service[] = [
  // ---------------------------------------------------------------- Surveying
  {
    code: "architectural-topographic-survey",
    name: "Architectural / Topographic Survey",
    category: "land-surveying",
    summary:
      "Existing-conditions surveys built for architects and designers, with the detail needed to start design immediately.",
    body: [
      "An architectural or topographic survey documents what is actually on the site today: ground surface, structures, hardscape, utilities, trees, walls, easement lines and the surrounding context that constrains a design.",
      "TDR captures these surveys with 3D scanning where it is applicable, so the resulting base map carries substantially more measured detail than a conventional field-shot topo. Architects receive a base file that reflects real conditions instead of a sparse set of interpolated points.",
    ],
    highlights: [
      "CAD base file ready for design",
      "High-density existing-conditions capture",
      "Interior and exterior documentation available",
      "Coordinated with your architect's preferred format",
    ],
    hasPage: true,
    requestable: true,
    questions: [
      {
        name: "arch_scope",
        label: "What needs to be surveyed?",
        type: "select",
        options: ["Exterior / site only", "Interior only", "Interior and exterior", "Not sure yet"],
      },
      {
        name: "arch_stories",
        label: "Number of stories / levels",
        type: "text",
      },
      {
        name: "arch_existing_plans",
        label: "Do you have existing plans, an old survey, or drawings we can reference?",
        type: "select",
        options: ["Yes — I can upload them", "Yes — but I do not have them handy", "No"],
      },
      {
        name: "arch_deliverable",
        label: "Preferred deliverable format",
        type: "select",
        options: ["AutoCAD (.dwg)", "PDF", "Revit / BIM model", "Point cloud", "Not sure — please advise"],
      },
    ],
  },
  {
    code: "boundary-survey",
    name: "Boundary Survey",
    category: "land-surveying",
    summary:
      "Record research, monument recovery and field measurement to establish where your property lines actually are.",
    body: [
      "A boundary survey establishes the legal limits of a parcel using deed and record research, recovery of existing survey monuments, and precise field measurement.",
      "Boundary work is commonly required before a fence or wall is built, before an addition is designed close to a property line, when a dispute arises with a neighbor, or when a lender or agency requires it.",
    ],
    highlights: [
      "Record and deed research",
      "Monument recovery and analysis",
      "Corner staking where appropriate",
      "Record of Survey preparation when required",
    ],
    hasPage: true,
    requestable: true,
    questions: [
      {
        name: "boundary_reason",
        label: "What is prompting the boundary survey?",
        type: "select",
        options: [
          "New fence or wall",
          "Addition or new construction near a property line",
          "Neighbor / encroachment dispute",
          "Purchase or sale",
          "Lender or agency requirement",
          "Other",
        ],
      },
      {
        name: "boundary_parcels",
        label: "How many parcels are involved?",
        type: "text",
      },
      {
        name: "boundary_documents",
        label: "Do you have a deed, legal description, or prior survey?",
        type: "select",
        options: ["Yes — I can upload it", "Yes — but not handy", "No"],
      },
    ],
  },
  {
    code: "alta-survey",
    name: "ALTA / NSPS Land Title Survey",
    category: "land-surveying",
    summary:
      "Title-grade surveys prepared to the ALTA/NSPS standard for commercial transactions and lender requirements.",
    body: [
      "An ALTA/NSPS Land Title Survey is the standard commercial real-estate survey. It combines boundary determination with a review of the title commitment, plotting of recorded easements and exceptions, and the specific Table A items requested by the lender, buyer or title company.",
      "TDR coordinates directly with the title company so the survey addresses the exceptions actually listed in the commitment rather than a generic checklist.",
    ],
    highlights: [
      "Prepared to the current ALTA/NSPS standard",
      "Title exception plotting",
      "Optional Table A items",
      "Coordination with title, lender and counsel",
    ],
    hasPage: true,
    requestable: true,
    questions: [
      {
        name: "alta_title_report",
        label: "Do you have a title commitment / preliminary title report?",
        type: "select",
        options: ["Yes — I can upload it", "Ordered, not yet received", "No"],
      },
      {
        name: "alta_title_company",
        label: "Title company and order number (if known)",
        type: "text",
      },
      {
        name: "alta_table_a",
        label: "Required Table A items (if known)",
        type: "textarea",
        help: "If the lender or buyer supplied a list, paste it here or upload the requirement letter.",
      },
    ],
  },
  {
    code: "construction-staking",
    name: "Construction Staking",
    category: "land-surveying",
    summary:
      "Field layout that puts the approved plans on the ground for grading, utilities, foundations and improvements.",
    body: [
      "Construction staking translates the approved plan set into physical control on the site so the contractor can build to design intent.",
      "TDR schedules staking around the construction sequence and provides cut sheets and control documentation with each visit.",
    ],
    highlights: [
      "Rough and finish grade staking",
      "Building corners and offsets",
      "Utility and storm drain layout",
      "Curb, gutter and paving control",
    ],
    hasPage: true,
    requestable: true,
    questions: [
      {
        name: "staking_plans",
        label: "Do you have an approved plan set?",
        type: "select",
        options: ["Yes — approved", "Yes — in plan check", "Not yet"],
      },
      {
        name: "staking_items",
        label: "What needs to be staked?",
        type: "textarea",
        help: "For example: building corners, rough grade, sewer and water, curb and gutter.",
      },
      {
        name: "staking_start",
        label: "Anticipated construction start date",
        type: "text",
      },
    ],
  },
  {
    code: "as-built-survey",
    name: "As-Built Survey",
    category: "land-surveying",
    summary:
      "Verification of what was actually constructed, for agency close-out, certification and record documentation.",
    body: [
      "As-built surveys document constructed improvements and compare them against the approved design. They are commonly required for agency sign-off, pad certifications, utility record drawings and building department close-out.",
      "Where the record needs to capture more than a handful of measured points, TDR uses scanning so the as-built reflects the full constructed condition.",
    ],
    highlights: [
      "Pad and finish-floor certifications",
      "Utility as-builts",
      "Agency close-out documentation",
      "Design-versus-built comparison",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "subdivision-mapping",
    name: "Subdivision & Mapping",
    category: "land-surveying",
    summary:
      "Parcel maps, tract maps, lot line adjustments and the survey work that supports entitlement.",
    body: [
      "Subdivision work covers the mapping process that creates, adjusts or merges legal parcels — parcel maps, tract maps, lot line adjustments, certificates of compliance and the supporting boundary work.",
      "TDR prepares the map documents and carries them through agency review and recordation.",
    ],
    highlights: [
      "Parcel and tract maps",
      "Lot line adjustments and mergers",
      "Agency review and recordation support",
      "Legal descriptions and exhibits",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "specialized-surveys",
    name: "Specialized Surveys",
    category: "land-surveying",
    summary:
      "Elevation certificates, easement exhibits, encroachment studies and other targeted survey products.",
    body: [
      "Not every survey fits a standard category. TDR regularly prepares elevation certificates, easement and encroachment exhibits, height studies, view studies, volume and stockpile calculations, and other targeted deliverables.",
      "If you are not sure what type of survey your project requires, describe the situation on the proposal form and TDR will recommend the appropriate scope.",
    ],
    highlights: [
      "Elevation certificates",
      "Easement and encroachment exhibits",
      "Height and view studies",
      "Volume and stockpile measurement",
    ],
    hasPage: true,
    requestable: false,
  },

  // ------------------------------------------------------------ Civil engineering
  {
    code: "grading",
    name: "Grading Design",
    category: "civil-engineering",
    summary: "Grading and earthwork design that balances site constraints, drainage and cost.",
    body: [
      "Grading plans define how a site is shaped: pad elevations, slopes, retaining, driveway profiles, accessibility compliance and earthwork quantities.",
      "TDR designs grading against measured existing conditions rather than assumed contours, which reduces surprises during construction.",
    ],
    highlights: [
      "Precise and rough grading plans",
      "Earthwork quantity analysis",
      "Retaining and slope design coordination",
      "Accessibility compliance",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "drainage",
    name: "Drainage Design",
    category: "civil-engineering",
    summary: "Site drainage, storm drain and water-quality design that satisfies agency review.",
    body: [
      "Drainage design routes water safely off and through a site: surface flow, area drains, storm drain systems, detention and water-quality treatment.",
      "TDR prepares the drainage plans and supporting reports required by the reviewing agency.",
    ],
    highlights: [
      "Storm drain and area drain design",
      "Detention and retention systems",
      "Water-quality / BMP design",
      "Drainage reports for agency submittal",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "hydrology",
    name: "Hydrology & Hydraulics",
    category: "civil-engineering",
    summary: "Runoff analysis, hydraulic modeling and the reports that support drainage approvals.",
    body: [
      "Hydrology studies quantify how much water a site generates and where it goes, before and after development. Hydraulic analysis then confirms that the proposed system can carry it.",
      "TDR prepares the calculations and reports in the format the reviewing agency expects.",
    ],
    highlights: [
      "Pre- and post-development runoff analysis",
      "Hydraulic capacity calculations",
      "Agency-format hydrology reports",
      "Flood and floodplain coordination",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "site-development",
    name: "Site Development",
    category: "civil-engineering",
    summary: "Full civil site design from feasibility and entitlement through permit-ready plans.",
    body: [
      "Site development engineering ties together grading, drainage, utilities, access and agency requirements into a coordinated, permit-ready plan set.",
      "TDR works alongside the architect and the owner through entitlement, plan check and construction.",
    ],
    highlights: [
      "Feasibility and due-diligence studies",
      "Entitlement exhibits",
      "Permit-ready civil plan sets",
      "Utility coordination",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "hillside-development",
    name: "Hillside Development",
    category: "civil-engineering",
    summary: "Engineering for constrained hillside sites where topography drives the design.",
    body: [
      "Hillside projects carry constraints that flat sites do not: steep slopes, access and driveway grades, retaining, geotechnical coordination, drainage control and demanding agency standards.",
      "Accurate existing-conditions data matters more on hillside sites than anywhere else, which is where TDR's survey and scanning capability directly supports the engineering.",
    ],
    highlights: [
      "Steep-slope grading strategy",
      "Driveway and access grade design",
      "Retaining and geotechnical coordination",
      "Hillside ordinance compliance",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "infrastructure",
    name: "Infrastructure",
    category: "civil-engineering",
    summary: "Street, utility and public improvement design for private and public projects.",
    body: [
      "Infrastructure work covers street improvements, sewer and water mains, storm drain systems, and the public improvement plans that agencies require alongside private development.",
      "TDR carries these plans through agency review and provides construction support.",
    ],
    highlights: [
      "Street and paving improvements",
      "Sewer, water and storm drain mains",
      "Public improvement plans",
      "Agency permitting support",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "construction-support",
    name: "Construction Support",
    category: "civil-engineering",
    summary: "Engineering support during construction: RFIs, revisions, field changes and close-out.",
    body: [
      "Construction rarely goes exactly as drawn. TDR stays engaged through construction to answer RFIs, prepare revisions, resolve field conflicts and support agency close-out.",
      "Because TDR also performs the survey and as-built work, field questions can usually be resolved with measured data rather than assumption.",
    ],
    highlights: [
      "RFI response and plan revisions",
      "Field conflict resolution",
      "Agency inspection support",
      "Close-out documentation",
    ],
    hasPage: true,
    requestable: false,
  },

  // ------------------------------------------------------- 3D scanning / capture
  {
    code: "architectural-scanning",
    name: "Architectural Scanning",
    category: "3d-scanning",
    summary:
      "Millimeter-level capture of buildings and interiors for renovation, addition and adaptive-reuse design.",
    body: [
      "Architectural scanning captures the building as it exists — walls, floors, ceilings, structure, openings, mechanical and finishes — as a dense measured record rather than a set of hand-measured dimensions.",
      "The result is a design base that reflects the real building, including the out-of-square walls and sloping floors that hand measurement tends to average away.",
    ],
    highlights: [
      "Interior and exterior capture",
      "Floor plans, elevations and sections from scan data",
      "Reduced return trips for missed dimensions",
      "Feeds directly into CAD or Revit",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "lidar",
    name: "LiDAR",
    category: "3d-scanning",
    summary: "Laser-based measurement that records millions of precise points per scan setup.",
    body: [
      "LiDAR (Light Detection and Ranging) measures distance with a laser and records the result as a dense cloud of three-dimensional points. A single setup can capture millions of measured points in minutes.",
      "TDR uses LiDAR as a standard part of applicable survey workflows rather than as a premium upsell, which is why TDR deliverables typically carry more existing-conditions detail than a conventional survey at a comparable price.",
    ],
    highlights: [
      "Millions of measured points per setup",
      "Registered, coordinated point clouds",
      "Safe capture of hard-to-reach conditions",
      "Permanent measurable record of the site",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "scan-to-cad",
    name: "Scan-to-CAD",
    category: "3d-scanning",
    summary: "Point-cloud data converted into clean, usable 2D and 3D CAD deliverables.",
    body: [
      "Raw point clouds are dense but not directly draftable. Scan-to-CAD converts registered scan data into the drafted plans, elevations, sections and 3D CAD geometry that design teams actually work in.",
      "TDR delivers in the CAD version and layer standard your team uses.",
    ],
    highlights: [
      "2D plans, elevations and sections",
      "3D CAD geometry",
      "Delivered in your CAD version and standards",
      "Point cloud supplied alongside for reference",
    ],
    hasPage: true,
    requestable: true,
    requestLabel: "Scan-to-CAD",
    questions: [
      {
        name: "cad_format",
        label: "Required CAD format and version",
        type: "text",
        help: "For example: AutoCAD 2018 .dwg, Civil 3D, MicroStation.",
      },
      {
        name: "cad_dimension",
        label: "2D, 3D, or both?",
        type: "select",
        options: ["2D", "3D", "Both", "Not sure — please advise"],
      },
    ],
  },
  {
    code: "scan-to-bim",
    name: "Scan-to-BIM / Revit",
    category: "3d-scanning",
    summary: "Intelligent Revit models built from scan data at the level of development you require.",
    body: [
      "Scan-to-BIM converts reality-capture data into an intelligent Revit model: walls, floors, roofs, structure, openings and — where required — MEP elements, modeled as objects rather than drafted lines.",
      "TDR agrees the level of development (LOD) and modeling scope with your team before starting so the model matches how it will be used.",
    ],
    highlights: [
      "Native Revit deliverable",
      "Agreed LOD and modeling scope",
      "Architectural, structural and MEP options",
      "Registered point cloud linked to the model",
    ],
    hasPage: true,
    requestable: true,
    requestLabel: "Scan-to-BIM / Revit",
    questions: [
      {
        name: "bim_revit_version",
        label: "Revit version required",
        type: "text",
      },
      {
        name: "bim_lod",
        label: "Level of development (LOD) required",
        type: "select",
        options: ["LOD 100", "LOD 200", "LOD 300", "LOD 350", "LOD 400", "Not sure — please advise"],
      },
      {
        name: "bim_disciplines",
        label: "Which disciplines need to be modeled?",
        type: "textarea",
        help: "For example: architectural shell and core, structural, MEP.",
      },
    ],
  },
  {
    code: "revit-bim",
    name: "Revit / BIM Services",
    category: "3d-scanning",
    summary: "BIM coordination, model maintenance and existing-condition models for design teams.",
    body: [
      "Beyond initial scan-to-BIM conversion, TDR supports design teams with model coordination, updates as conditions change, and verification of constructed work against the model.",
      "This is particularly valuable on renovation and adaptive-reuse projects where the existing building is the largest source of design risk.",
    ],
    highlights: [
      "Existing-condition Revit models",
      "Model coordination and clash review support",
      "Model updates as conditions change",
      "Verification against constructed work",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "industrial-scanning",
    name: "Industrial Scanning",
    category: "3d-scanning",
    summary: "Plant, process and equipment capture where clearances and tie-ins have to be exact.",
    body: [
      "Industrial environments are dense, congested and expensive to get wrong. Scanning documents piping, structure, equipment and clearances so retrofits and tie-ins can be designed against measured reality.",
      "Capture is planned around plant access and safety requirements.",
    ],
    highlights: [
      "Piping, structure and equipment capture",
      "Clearance and tie-in verification",
      "Retrofit and expansion planning",
      "Minimal disruption to operations",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "structural-documentation",
    name: "Structural Documentation",
    category: "3d-scanning",
    summary: "Measured documentation of structural framing, deflection and existing conditions.",
    body: [
      "Structural engineers frequently need to know what is actually there and how much it has moved. Scanning provides measured documentation of framing, member locations, deflection, settlement and out-of-plumb conditions.",
      "Deliverables are prepared in the format the structural engineer of record requires.",
    ],
    highlights: [
      "Framing and member documentation",
      "Deflection and settlement measurement",
      "Out-of-plumb and out-of-level analysis",
      "Support for retrofit and strengthening design",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "floor-flatness",
    name: "Floor Flatness & Surface Analysis",
    category: "3d-scanning",
    summary: "Full-coverage floor flatness and levelness analysis instead of spot elevations.",
    body: [
      "Scanning measures an entire floor surface rather than a scatter of spot shots, which makes it possible to produce true flatness and levelness analysis, heat-mapped deviation plots and grinding or leveling quantities.",
      "This is commonly used for warehouse slabs, equipment installation and tenant-improvement flooring requirements.",
    ],
    highlights: [
      "Full-surface coverage, not spot elevations",
      "Heat-mapped deviation plots",
      "Flatness / levelness reporting",
      "Grinding and self-leveling quantity estimates",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "large-facility-capture",
    name: "Large Facility Capture",
    category: "3d-scanning",
    summary: "Registered capture of campuses, warehouses and multi-building facilities.",
    body: [
      "Large facilities require a planned capture strategy: control, registration, scheduling around operations, and data management that keeps a very large dataset usable.",
      "TDR plans large captures so the resulting data is registered to survey control and can be worked with by the design team.",
    ],
    highlights: [
      "Survey-controlled registration",
      "Campus and multi-building coordination",
      "Capture scheduled around operations",
      "Managed delivery of large datasets",
    ],
    hasPage: true,
    requestable: false,
  },
  {
    code: "existing-conditions",
    name: "Existing Conditions Documentation",
    category: "3d-scanning",
    summary: "A permanent, measurable record of a site or building before work begins.",
    body: [
      "Existing-conditions documentation creates a measured record that can be revisited later — for design, for claims and disputes, for historic preservation, or simply to answer a question without another site visit.",
      "Because the record is measurable, a dimension that was never explicitly requested can usually still be extracted after the fact.",
    ],
    highlights: [
      "Permanent measurable site record",
      "Pre-construction condition documentation",
      "Historic and heritage recording",
      "Answers later questions without a return trip",
    ],
    hasPage: true,
    requestable: false,
  },

  // ------------------------- Requestable umbrella options (no dedicated page) --
  {
    code: "civil-engineering",
    name: "Civil Engineering",
    category: "civil-engineering",
    summary: "General civil engineering scope.",
    body: [],
    highlights: [],
    hasPage: false,
    requestable: true,
    questions: [
      {
        name: "civil_scope",
        label: "What civil engineering scope do you need?",
        type: "textarea",
        help: "For example: grading and drainage plans, hydrology report, site development plan set.",
      },
      {
        name: "civil_agency",
        label: "Reviewing agency / jurisdiction",
        type: "text",
      },
      {
        name: "civil_deadline",
        label: "Submittal or plan-check deadline, if any",
        type: "text",
      },
    ],
  },
  {
    code: "3d-scanning",
    name: "3D Scanning",
    category: "3d-scanning",
    summary: "General 3D scanning / reality capture scope.",
    body: [],
    highlights: [],
    hasPage: false,
    requestable: true,
    questions: [
      {
        name: "scan_scope",
        label: "What needs to be scanned?",
        type: "select",
        options: ["Interior", "Exterior / site", "Interior and exterior", "Equipment or structure", "Not sure yet"],
      },
      {
        name: "scan_size",
        label: "Approximate size (square feet or acres)",
        type: "text",
      },
      {
        name: "scan_deliverable",
        label: "How will the scan data be used?",
        type: "textarea",
        help: "For example: architect needs a Revit model, contractor needs clearance verification.",
      },
    ],
  },
  {
    code: "other",
    name: "Other / Not sure",
    category: "land-surveying",
    summary: "Something else, or not sure which service applies.",
    body: [],
    highlights: [],
    hasPage: false,
    requestable: true,
    requestLabel: "Other / I'm not sure",
    questions: [
      {
        name: "other_description",
        label: "Tell us what you need",
        type: "textarea",
        help: "Describe the situation and TDR will recommend the appropriate scope.",
      },
    ],
  },
];

export const servicesByCategory = (category: ServiceCategory) =>
  services.filter((s) => s.category === category && s.hasPage);

export const pageServices = services.filter((s) => s.hasPage);

export const requestableServices = services.filter((s) => s.requestable);

export const serviceByCode = (code: string) => services.find((s) => s.code === code);

/**
 * Conditional-question `name` → human label.
 *
 * `opportunities.service_details` is keyed by the stable question name
 * (`arch_scope`) rather than the label, because labels get reworded and keys
 * must not. Anything showing those answers to a person resolves them through
 * here, so staff read "What needs to be surveyed?" instead of `arch_scope`.
 *
 * Falls back to the raw key, so an answer stored against a question that has
 * since been removed still displays rather than vanishing.
 */
const questionLabels: Record<string, string> = Object.fromEntries(
  services.flatMap((service) =>
    (service.questions ?? []).map((question) => [question.name, question.label]),
  ),
);

export const questionLabel = (name: string) => questionLabels[name] ?? name;

export const serviceCodes = new Set(services.map((s) => s.code));

export const propertyTypes = [
  "Single-family residential",
  "Multifamily",
  "Commercial",
  "Industrial",
  "Institutional",
  "Government",
  "Infrastructure",
  "Other",
] as const;

export const timeframes = [
  "As soon as possible",
  "Within 2 weeks",
  "Within 30 days",
  "1–3 months",
  "More than 3 months",
  "Budgeting / planning only",
] as const;

export const contactMethods = ["Email", "Phone", "Text message"] as const;
