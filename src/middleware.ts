import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session and blocks unauthenticated access to the
 * two signed-in areas: the internal view at /admin (spec §10, §15) and the
 * client portal at /portal.
 *
 * This only checks that somebody is signed in. WHICH of the two areas they may
 * enter is decided by `getStaffUser()` and `getClientUser()` in the layouts,
 * and what they can actually read is decided by the database. Middleware runs
 * on the edge, where a role lookup would cost a round trip on every request —
 * so it is the cheap first gate, never the only one.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase configured there is no admin area to protect, and the
  // public marketing site must still serve.
  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set({ name, value, ...options }),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPortal = pathname.startsWith("/portal");
  const loginPath = isPortal ? "/portal/login" : "/admin/login";
  const homePath = isPortal ? "/portal" : "/admin/proposals";
  const isLogin = pathname === loginPath;

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = homePath;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
