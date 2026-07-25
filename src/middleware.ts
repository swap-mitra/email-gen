import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Better-Auth's cookie helper transitively imports jose's JWT/compression
// code, which uses Node APIs (CompressionStream/DecompressionStream) the
// Edge Runtime doesn't support — run middleware on the Node.js runtime
// instead to avoid a repeat of the exact class of runtime crash that broke
// the Clerk-based deploy on Vercel.
export const runtime = "nodejs";

// /api/inngest is called directly by Inngest (dev server or cloud) with no
// session — it authenticates via its own signing key, not user auth. /api/auth
// is Better-Auth's own callback/session/org-mutation endpoint — gating it here
// would redirect-loop the OAuth callback and every session fetch.
const PUBLIC_PREFIXES = ["/sign-in", "/api/auth", "/api/inngest"];

function isPublicRoute(pathname: string) {
  // "/" is the marketing landing page — matched exactly, since a "/" prefix
  // would make every route public.
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  if (isPublicRoute(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Cookie-presence check only — cheap, no DB round trip. Real
  // authorization happens at the route/page level via
  // getActiveWorkspaceContext(), same division of responsibility as before.
  if (!getSessionCookie(request)) {
    const signIn = new URL("/sign-in", request.url);
    // Carry the requested page through the OAuth round trip so deep links
    // (invitation URLs especially) survive being bounced to sign-in.
    signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
