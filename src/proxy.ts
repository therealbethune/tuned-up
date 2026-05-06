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
