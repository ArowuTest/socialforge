import { NextRequest, NextResponse } from "next/server";

/**
 * Route protection middleware.
 *
 * Regular dashboard routes are guarded by the `sf_logged_in` cookie.
 * Admin routes are guarded by a separate `sf_admin_logged_in` cookie so that
 * admin and user sessions never interfere with each other.
 *
 * NOTE: These cookies carry no sensitive data — they are purely presence flags
 * so that middleware (which runs on the edge and cannot read localStorage) knows
 * whether to allow or redirect the request.
 */

const USER_PROTECTED_PREFIXES = [
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
];

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/admin/login",  // Admin login is always public
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip purely public paths — no check needed.
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Admin routes: require sf_admin_logged_in cookie
  if (pathname.startsWith("/admin")) {
    const isAdminLoggedIn = request.cookies.has("sf_admin_logged_in");
    if (!isAdminLoggedIn) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Regular dashboard routes: require sf_logged_in cookie
  const isUserProtected = USER_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isUserProtected) {
    const isLoggedIn = request.cookies.has("sf_logged_in");
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", request.url);
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
