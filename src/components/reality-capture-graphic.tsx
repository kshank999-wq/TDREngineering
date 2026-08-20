/**
 * Placeholder motion graphic for the homepage hero (spec §4).
 *
 * TDR's promotional footage — LiDAR scanners in operation, point clouds
 * forming into buildings, crews and field technology, CAD/BIM deliverables —
 * is not available yet. Rather than ship a broken <video> or a grey box, the
 * hero renders this: a lightweight animated SVG of a scan resolving into a
 * building. It is a few kilobytes, needs no JavaScript, and honours
 * prefers-reduced-motion via the global stylesheet.
 *
 * Replace it by setting `heroMedia` in src/content/site.ts.
 */

/** Deterministic pseudo-random in [0,1). Must not be Math.random: the value
 *  has to match between server render and client hydration. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Point = { x: number; y: number; r: number; o: number };

/** Points scattered along the facade and roof planes of a simple building. */
function buildingPoints(): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 520; i += 1) {
    const a = rand(i);
    const b = rand(i + 1000);

    let x: number;
    let y: number;

    if (a < 0.34) {
      // Left facade
      x = 180 + b * 210;
      y = 250 + rand(i + 2000) * 200;
    } else if (a < 0.62) {
      // Right / taller mass
      x = 430 + b * 250;
      y = 190 + rand(i + 3000) * 260;
    } else if (a < 0.8) {
      // Roof planes
      x = 180 + b * 500;
      y = 190 + rand(i + 4000) * 60;
    } else {
      // Ground plane scatter
      x = 80 + b * 760;
      y = 440 + rand(i + 5000) * 90;
    }

    points.push({
      x,
      y,
      r: 0.9 + rand(i + 6000) * 1.3,
      o: 0.28 + rand(i + 7000) * 0.62,
    });
  }
  return points;
}

const POINTS = buildingPoints();

export function RealityCaptureGraphic({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 900 560"
      className={className}
      role="img"
      aria-label="A laser scanner sweeping a building and resolving it into a dense three-dimensional point cloud."
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="tdr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1622" />
          <stop offset="60%" stopColor="#12202f" />
          <stop offset="100%" stopColor="#070d14" />
        </linearGradient>
        <linearGradient id="tdr-sweep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00b4d8" stopOpacity="0" />
          <stop offset="50%" stopColor="#22cbef" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#00b4d8" stopOpacity="0" />
        </linearGradient>
        <clipPath id="tdr-frame">
          <rect x="0" y="0" width="900" height="560" />
        </clipPath>
      </defs>

      <rect width="900" height="560" fill="url(#tdr-sky)" />

      <g clipPath="url(#tdr-frame)">
        {/* Ground grid — survey control plane */}
        <g stroke="#1c76ad" strokeOpacity="0.22" strokeWidth="1">
          {Array.from({ length: 14 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={430 + i * 11} x2="900" y2={430 + i * 11} />
          ))}
          {Array.from({ length: 22 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={450 + (i - 11) * 40}
              y1="430"
              x2={450 + (i - 11) * 190}
              y2="560"
            />
          ))}
        </g>

        {/* Wireframe massing behind the cloud */}
        <g stroke="#2a4055" strokeWidth="1.25" fill="none">
          <path d="M180 450V250l100-52 110 52v200" />
          <path d="M280 198v200M390 250H180" />
          <path d="M430 450V190l120-58 130 58v260" />
          <path d="M550 132v318M680 190H430" />
        </g>

        {/* The point cloud itself */}
        <g fill="#6fe0f7">
          {POINTS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.r} opacity={p.o} />
          ))}
        </g>

        {/* Scanner on a tripod */}
        <g stroke="#94a8bb" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M770 520l22-58M812 520l-20-58M792 462v-10" />
          <rect x="778" y="428" width="28" height="26" rx="4" fill="#12202f" stroke="#c3d0dc" />
          <circle cx="792" cy="441" r="5" fill="#22cbef" stroke="none" />
        </g>

        {/* Radial sweep emanating from the scanner */}
        <g stroke="#22cbef" strokeOpacity="0.28" strokeWidth="1">
          <path d="M792 441L180 300M792 441L180 400M792 441L200 470M792 441L400 220" />
        </g>

        {/* Vertical sweep bar */}
        <rect className="scan-sweep" x="0" y="0" width="900" height="80" fill="url(#tdr-sweep)" />
      </g>
    </svg>
  );
}
