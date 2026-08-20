import Link from "next/link";
import { heroMedia, heroMessages } from "@/content/site";
import { RealityCaptureGraphic } from "@/components/reality-capture-graphic";

/**
 * Homepage hero (spec §4).
 *
 * A 10–20 second silent promotional sequence at the top of the homepage with a
 * static fallback image and rotating overlay messages. The video is muted,
 * looped, plays inline and carries `preload="metadata"` so it never becomes the
 * bottleneck on the largest contentful paint — the poster paints immediately
 * and the footage arrives behind it.
 */
export function Hero() {
  const hasVideo = Boolean(heroMedia.videoMp4 || heroMedia.videoWebm);

  return (
    <section className="relative isolate overflow-hidden bg-ink-950">
      <div className="absolute inset-0 -z-10">
        {hasVideo ? (
          <video
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={heroMedia.poster || undefined}
            aria-label={heroMedia.description}
          >
            {heroMedia.videoWebm ? (
              <source src={heroMedia.videoWebm} type="video/webm" />
            ) : null}
            {heroMedia.videoMp4 ? (
              <source src={heroMedia.videoMp4} type="video/mp4" />
            ) : null}
          </video>
        ) : (
          <RealityCaptureGraphic className="h-full w-full" />
        )}
        {/* Legibility scrim over the motion. */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/40"
          aria-hidden="true"
        />
      </div>

      <div className="container-tdr py-24 md:py-36 lg:py-44">
        <div className="max-w-3xl">
          {/* Rotating overlay messages. Each is stacked in the same box with a
              staggered animation delay, so no JavaScript is required. */}
          <div className="relative h-6" aria-hidden="true">
            {heroMessages.map((message, index) => (
              <span
                key={message}
                className="hero-message absolute inset-0 text-xs font-semibold uppercase tracking-[0.18em] text-accent-400 opacity-0"
                style={{ animationDelay: `${index * 3}s` }}
              >
                {message}
              </span>
            ))}
          </div>
          {/* Static equivalent for assistive technology and no-CSS contexts. */}
          <p className="sr-only">{heroMessages.join(" · ")}</p>

          <h1 className="mt-6 text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            Survey and civil engineering built on{" "}
            <span className="text-accent-400">measured reality</span>, not
            assumption.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-200 md:text-xl">
            TDR Engineering combines land surveying, civil engineering and 3D
            laser scanning so your project starts from a complete, measured
            record of existing conditions — with fast turnaround and pricing
            that competes with conventional survey work.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/request-a-proposal"
              className="inline-flex items-center justify-center rounded-md bg-accent-500 px-6 py-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-400"
            >
              Request a Proposal
            </Link>
            <Link
              href="#survey-comparison"
              className="inline-flex items-center justify-center rounded-md border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/10"
            >
              Does your survey look like this?
            </Link>
          </div>

          <dl className="mt-14 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
            <HeroStat term="3D scanning" detail="Included in applicable survey workflows" />
            <HeroStat term="Fast turnaround" detail="Scheduled to your submittal dates" />
            <HeroStat term="CAD, Revit & BIM" detail="Delivered in your team's format" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="border-l-2 border-accent-500/60 pl-4">
      <dt className="text-sm font-semibold text-white">{term}</dt>
      <dd className="mt-1 text-xs leading-relaxed text-ink-300">{detail}</dd>
    </div>
  );
}
