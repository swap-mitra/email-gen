import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /api/inngest is called directly by Inngest (dev server or cloud) with no
// Clerk session — it authenticates via its own signing key, not user auth.
// Without this exclusion, auth.protect() 404s every call, so Inngest can
// never register with or invoke this app's functions.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/inngest(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
