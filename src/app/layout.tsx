import type { Metadata } from "next";
import { ClerkProvider, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, activities } from "@/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tuned Up",
  description: "Rate songs 1–100 and follow your friends",
};

async function unreadActivityCount(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(activities)
      .where(and(eq(activities.userId, userId), isNull(activities.readAt)));
    return Number(row?.n ?? 0);
  } catch {
    // The table may not exist yet (e.g. before init-db is hit after a migration).
    return 0;
  }
}

async function SignedInNav({ userId }: { userId: string }) {
  const unread = await unreadActivityCount(userId);
  return (
    <>
      <Link href="/feed" className="hover:text-white text-neutral-300">Feed</Link>
      <Link href="/discover" className="hover:text-white text-neutral-300">Discover</Link>
      <Link href="/search" className="hover:text-white text-neutral-300">Search</Link>
      <Link href="/people" className="hover:text-white text-neutral-300">People</Link>
      <Link href="/activity" className="relative hover:text-white text-neutral-300">
        Activity
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-[10px] text-black font-bold tabular-nums flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <Link href="/me" className="hover:text-white text-neutral-300">Me</Link>
      <UserButton />
    </>
  );
}

function SignedOutNav() {
  return (
    <>
      <SignInButton>
        <button className="text-neutral-300 hover:text-white">Sign in</button>
      </SignInButton>
      <SignUpButton forceRedirectUrl="/welcome">
        <button className="rounded-full bg-white text-black px-3 py-1 font-medium">Sign up</button>
      </SignUpButton>
    </>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
          <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur sticky top-0 z-10">
            <nav className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
              <Link href="/" className="font-bold text-lg tracking-tight">🎵 Tuned Up</Link>
              <div className="flex items-center gap-4 text-sm">
                {userId ? <SignedInNav userId={userId} /> : <SignedOutNav />}
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
