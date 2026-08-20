import Link from "next/link";
import { navigation } from "@/content/site";

/**
 * 404. Because legacy URLs are being remapped (spec §14), this page keeps a
 * visitor who lands on an unmapped old URL moving instead of dead-ending —
 * and any 404 seen in analytics after launch is a redirect worth adding to
 * src/content/redirects.ts.
 */
export default function NotFound() {
  return (
    <div className="bg-ink-950">
      <div className="container-tdr py-24 md:py-36">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight text-white md:text-5xl">
          That page has moved or no longer exists.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-300">
          TDR recently launched a new website. If you followed a link from an
          older page or a search result, the content you are looking for is
          probably one of these:
        </p>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {navigation
            .filter((item) => item.href !== "/")
            .map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg border border-ink-800 bg-ink-900 px-5 py-4 text-sm font-semibold text-white transition-colors hover:border-accent-500/50 hover:bg-ink-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
        </ul>

        <p className="mt-10 text-ink-300">
          Still cannot find it?{" "}
          <Link href="/contact" className="font-semibold text-accent-400 hover:text-accent-300">
            Contact TDR
          </Link>{" "}
          and we will point you to it.
        </p>
      </div>
    </div>
  );
}
