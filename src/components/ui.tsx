import Link from "next/link";
import type { ReactNode } from "react";

export function Section({
  children,
  className = "",
  tone = "light",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "light" | "muted" | "dark";
  id?: string;
}) {
  const tones = {
    light: "bg-white text-ink-900",
    muted: "bg-ink-50 text-ink-900",
    dark: "bg-ink-950 text-white",
  } as const;

  return (
    <section id={id} className={`${tones[tone]} py-20 md:py-28 ${className}`}>
      <div className="container-tdr">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={`max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}
    >
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2
        className={`mt-3 text-3xl font-bold leading-tight md:text-4xl ${
          tone === "dark" ? "text-white" : "text-ink-900"
        }`}
      >
        {title}
      </h2>
      {intro ? (
        <p
          className={`mt-4 text-lg leading-relaxed ${
            tone === "dark" ? "text-ink-300" : "text-ink-600"
          }`}
        >
          {intro}
        </p>
      ) : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="border-b border-ink-800 bg-ink-950">
      <div className="container-tdr py-16 md:py-24">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-[1.1] text-white md:text-5xl">
          {title}
        </h1>
        {intro ? (
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
            {intro}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "accent";
  className?: string;
}) {
  const variants = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-500 focus-visible:outline-brand-500",
    accent:
      "bg-accent-500 text-ink-950 hover:bg-accent-400 focus-visible:outline-accent-400",
    secondary:
      "border border-ink-200 bg-white text-ink-900 hover:border-ink-300 hover:bg-ink-50",
    ghost:
      "border border-white/25 text-white hover:border-white/50 hover:bg-white/10",
  } as const;

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition-colors ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Card({
  href,
  title,
  children,
  footer,
}: {
  href?: string;
  title: string;
  children: ReactNode;
  footer?: string;
}) {
  const inner = (
    <>
      <h3 className="text-lg font-semibold text-ink-900 group-hover:text-brand-600">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-600">{children}</p>
      {footer ? (
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
          {footer}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 8h9M8.5 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : null}
    </>
  );

  const classes =
    "group flex h-full flex-col rounded-xl border border-ink-100 bg-white p-6 shadow-panel transition-shadow hover:shadow-lift";

  return href ? (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  ) : (
    <div className={classes}>{inner}</div>
  );
}

export function CheckList({ items, tone = "light" }: { items: readonly string[]; tone?: "light" | "dark" }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-accent-500"
          >
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
            <path
              d="M6 10.2l2.6 2.6L14 7.4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={tone === "dark" ? "text-ink-200" : "text-ink-700"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Closing call to action used at the bottom of every content page. */
export function ProposalCta({
  title = "Ready for a proposal?",
  intro = "Tell us about the property and what you need. No account required — most requests are answered the same or next business day.",
}: {
  title?: string;
  intro?: string;
}) {
  return (
    <section className="bg-brand-600">
      <div className="container-tdr flex flex-col items-start gap-8 py-16 md:flex-row md:items-center md:justify-between md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight text-white md:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/80">{intro}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <ButtonLink href="/request-a-proposal" variant="accent">
            Request a Proposal
          </ButtonLink>
          <ButtonLink href="/contact" variant="ghost">
            Contact TDR
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
