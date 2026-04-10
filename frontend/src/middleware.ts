import { NextRequest, NextResponse } from "next/server";

/**
 * Route protection middleware.
 *
 * Dashboard and admin routes require the user to be authenticated.
 * Authentication is signalled by the `sf_logged_in` cookie which is set by
 * `setTokens()` in api.ts and cleared by `clearTokens()` / `doRefreshToken()`
 * on session expiry.
 *
 * NOTE: The cookie carries no sensitive data — it is purely a presence flag so
 * that middleware (which runs on the edge and cannot access localStorage) knows
 * whether to allow or redirect the request.
 */

const PROTECTED_PREFIXES = [
  "/calendar",
  "/compose",
  "/accounts",
  "/analytics",
  "/ai",
  "/media",
  "/billing",
  "/clients",
  "/settings",
  "/templates",
  "/repurpose",
  "/developer",
  "/onboarding",
  "/dashboard",
  "/admin",
];

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip purely public paths — no check needed.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected) {
    const isLoggedIn = request.cookies.has("sf_logged_in");
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", request.url);
      // Preserve the intended destination so the login page can redirect back.
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match all paths except:
   *  - /api/*           (Next.js API routes / backend rewrites)
   *  - /_next/static/*  (static assets)
   *  - /_next/image/*   (image optimisation)
   *  - /favicon.ico, *.png, *.jpg, *.svg, *.webp
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
