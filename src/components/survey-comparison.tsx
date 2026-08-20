"use client";

import { useId, useState } from "react";
import Link from "next/link";

/**
 * "Does Your Survey Look Like This?" — the primary marketing concept (spec §4).
 *
 * A side-by-side comparison of the level of information in a conventional
 * survey versus a TDR scan-derived survey, driven by a draggable divider. The
 * divider is a range input rather than a mouse-only handle, so it is operable
 * by keyboard and touch and announced correctly by screen readers.
 *
 * TODO(tdr): replace the two schematic panels with real, approved deliverable
 * imagery — one conventional survey sheet and one TDR scan-derived sheet from
 * the same or comparable site. Set `conventionalImage` / `tdrImage` below and
 * the SVG panels drop out. All public marketing claims and the imagery used
 * here must be approved by TDR before publication (spec §4).
 */

const conventionalImage = ""; // e.g. "/media/survey-conventional.jpg"
const tdrImage = ""; // e.g. "/media/survey-tdr.jpg"

export function SurveyComparison() {
  const [position, setPosition] = useState(50);
  const sliderId = useId();

  return (
    <section id="survey-comparison" className="bg-ink-950 py-20 md:py-28">
      <div className="container-tdr">
        <div className="max-w-3xl">
          <p className="eyebrow">The TDR difference</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight text-white md:text-5xl">
            Does your survey look like this?
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-300">
            A conventional survey records a limited number of individually
            measured points, and everything between them is interpolated. A TDR
            survey captures existing conditions with 3D scanning, so what you
            design against is measured rather than assumed. Drag the divider to
            compare.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900 shadow-lift">
          <div className="relative aspect-16/10 w-full select-none md:aspect-2/1">
            {/* Right-hand panel: TDR */}
            <div className="absolute inset-0">
              {tdrImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tdrImage}
                  alt="A TDR scan-derived survey showing dense measured detail of the site and building."
                  className="h-full w-full object-cover"
                />
              ) : (
                <ScanDerivedPanel />
              )}
            </div>

            {/* Left-hand panel: conventional, clipped to the divider */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            >
              {conventionalImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={conventionalImage}
                  alt="A conventional survey showing sparse spot elevations and simplified linework."
                  className="h-full w-full object-cover"
                />
              ) : (
                <ConventionalPanel />
              )}
            </div>

            {/* Divider line */}
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent-400"
              style={{ left: `${position}%` }}
              aria-hidden="true"
            >
              <span className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent-400 text-ink-950 shadow-lift">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M8 5L4 10l4 5M12 5l4 5-4 5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>

            <span className="pointer-events-none absolute top-4 left-4 rounded bg-ink-950/85 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-200">
              Conventional survey
            </span>
            <span className="pointer-events-none absolute top-4 right-4 rounded bg-accent-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-950">
              TDR scan-derived survey
            </span>

            <label htmlFor={sliderId} className="sr-only">
              Comparison position: drag or use the arrow keys to reveal more of
              the conventional survey or the TDR scan-derived survey
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              value={position}
              onChange={(event) => setPosition(Number(event.target.value))}
              className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
              aria-valuetext={`${position}% conventional survey shown`}
            />
          </div>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          <Advantage
            title="Greater field detail"
            body="High-density capture records the site as it is, including the conditions nobody thought to ask for."
          />
          <Advantage
            title="Reduced field risk"
            body="Fewer missed conditions, fewer return trips, and fewer surprises discovered after design is underway."
          />
          <Advantage
            title="Better documentation"
            body="Architects, engineers, contractors and owners all work from the same measured record of the site."
          />
        </div>

        <div className="mt-12 flex flex-col gap-4 rounded-xl border border-ink-800 bg-ink-900 p-8 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-ink-200">
            TDR integrates 3D scanning into applicable survey workflows rather
            than treating it as a premium add-on — which is why TDR deliverables
            generally carry more measured detail at pricing that competes with
            conventional survey services.
          </p>
          <Link
            href="/3d-scanning"
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/10"
          >
            How TDR scans
          </Link>
        </div>
      </div>
    </section>
  );
}

function Advantage({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-ink-800 pt-6">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Schematic panels. Deterministic geometry only — no Math.random, so the
   server and client renders match exactly.
   ------------------------------------------------------------------------- */

function seeded(seed: number): number {
  const x = Math.sin(seed * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
}

const BUILDING_PATH =
  "M150 330V180l90-46 96 46v150M336 240h120v90M456 240l70-38 78 38v128";

function ConventionalPanel() {
  // A sparse grid of individually measured spot elevations.
  const spots = Array.from({ length: 26 }, (_, i) => ({
    x: 90 + (i % 7) * 100 + seeded(i) * 22,
    y: 120 + Math.floor(i / 7) * 88 + seeded(i + 50) * 20,
    value: (312 + seeded(i + 90) * 8).toFixed(1),
  }));

  return (
    <svg viewBox="0 0 800 420" className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Conventional survey: sparse individually measured spot elevations with simplified linework.">
      <rect width="800" height="420" fill="#f4f7fa" />
      <g stroke="#c3d0dc" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1="0" y1={i * 50} x2="800" y2={i * 50} />
        ))}
        {Array.from({ length: 17 }, (_, i) => (
          <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="420" />
        ))}
      </g>

      {/* Simplified building footprint — outline only */}
      <path d={BUILDING_PATH} fill="none" stroke="#2a4055" strokeWidth="2" />
      <path d="M150 330h454" stroke="#2a4055" strokeWidth="2" />

      {/* Spot elevations */}
      <g>
        {spots.map((spot, i) => (
          <g key={i}>
            <path
              d={`M${spot.x - 4} ${spot.y}h8M${spot.x} ${spot.y - 4}v8`}
              stroke="#6b8299"
              strokeWidth="1.25"
            />
            <text x={spot.x + 7} y={spot.y + 3} fontSize="8" fill="#6b8299">
              {spot.value}
            </text>
          </g>
        ))}
      </g>

      <text x="32" y="392" fontSize="12" fill="#6b8299" fontWeight="600">
        26 measured points · everything between them interpolated
      </text>
    </svg>
  );
}

function ScanDerivedPanel() {
  // Dense point cloud over the same footprint.
  const points = Array.from({ length: 1400 }, (_, i) => {
    const a = seeded(i);
    const b = seeded(i + 700);
    if (a < 0.28) {
      return { x: 150 + b * 190, y: 180 + seeded(i + 1400) * 150, o: 0.55 + seeded(i + 2100) * 0.4 };
    }
    if (a < 0.5) {
      return { x: 336 + b * 130, y: 240 + seeded(i + 2800) * 90, o: 0.55 + seeded(i + 3500) * 0.4 };
    }
    if (a < 0.72) {
      return { x: 456 + b * 150, y: 200 + seeded(i + 4200) * 168, o: 0.55 + seeded(i + 4900) * 0.4 };
    }
    return { x: 40 + b * 730, y: 320 + seeded(i + 5600) * 70, o: 0.28 + seeded(i + 6300) * 0.4 };
  });

  return (
    <svg viewBox="0 0 800 420" className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="TDR scan-derived survey: a dense point cloud covering the whole site and building, with fully drafted linework.">
      <rect width="800" height="420" fill="#0b1622" />
      <g stroke="#1b2d40" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1="0" y1={i * 50} x2="800" y2={i * 50} />
        ))}
        {Array.from({ length: 17 }, (_, i) => (
          <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="420" />
        ))}
      </g>

      <g fill="#6fe0f7">
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={0.85} opacity={p.o} />
        ))}
      </g>

      {/* Full drafted linework on top of the cloud */}
      <path d={BUILDING_PATH} fill="none" stroke="#ffffff" strokeWidth="2" />
      <path d="M150 330h454" stroke="#ffffff" strokeWidth="2" />
      <g stroke="#22cbef" strokeWidth="1.1" opacity="0.85" fill="none">
        <path d="M182 330v-96h44v96M262 330v-72h40v72M366 330v-56h34v56M486 368v-84h40v84M552 368v-64h34v64" />
        <path d="M150 180l90-46 96 46M456 240l70-38 78 38" />
        <path d="M40 348h720M40 362h720" opacity="0.35" />
      </g>

      <text x="32" y="392" fontSize="12" fill="#6fe0f7" fontWeight="600">
        1.4 million measured points · nothing interpolated
      </text>
    </svg>
  );
}
