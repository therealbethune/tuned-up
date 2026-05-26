import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/feed(.*)",
  "/search(.*)",
  "/people(.*)",
  "/discover(.*)",
  "/activity(.*)",
  "/me(.*)",
  "/api/ratings(.*)",
  "/api/follows(.*)",
  "/api/users(.*)",
  "/api/activity(.*)",
  "/api/comments(.*)",
  "/api/likes(.*)",
  "/api/onboarding(.*)",
  "/api/account(.*)",
  "/welcome(.*)",
  "/settings(.*)",
  "/admin(.*)",
  "/recommendations(.*)",
  "/api/recommendations(.*)",
  // Defense in depth: every handler below already checks auth() and
  // returns 401, but adding them here means a logged-out client gets
  // a clean redirect from Clerk middleware instead of an opaque 401
  // body. Cron / og / splash / init-db are intentionally NOT here —
  // they auth via shared tokens, not Clerk sessions.
  "/api/saved(.*)",
  "/api/preview-url(.*)",
  "/api/push(.*)",
  "/api/block(.*)",
  "/api/report(.*)",
  "/api/suggestions(.*)",
  "/api/applemusic(.*)",
  "/api/musickit(.*)",
  "/api/search(.*)",
  "/api/songs(.*)",
  "/api/spotify(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
