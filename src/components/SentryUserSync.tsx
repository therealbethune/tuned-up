"use client";
import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import * as Sentry from "@sentry/nextjs";

// Tags every Sentry event with the signed-in user's id so we can answer
// "which user hit error X" without spelunking server logs. Mounted once
// in the root layout; pulls from Clerk's useUser so it reacts to
// sign-in / sign-out without prop-drilling.
//
// We never send email or username — PII stays out of Sentry on purpose
// (sentry.client.config.ts has sendDefaultPii: false). The id alone is
// enough to cross-reference with the users table when we need to.
export function SentryUserSync() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user?.id) {
      Sentry.setUser({ id: user.id });
    } else {
      Sentry.setUser(null);
    }
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}
