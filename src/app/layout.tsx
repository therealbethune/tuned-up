import type { Metadata } from "next";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Song Rater",
  description: "Rate songs 1–100 and follow your friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
          <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur sticky top-0 z-10">
            <nav className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
              <Link href="/" className="font-bold text-lg tracking-tight">🎵 SongRater</Link>
              <div className="flex items-center gap-4 text-sm">
                <Show when="signed-in">
                  <Link href="/feed" className="hover:text-white text-neutral-300">Feed</Link>
                  <Link href="/search" className="hover:text-white text-neutral-300">Search</Link>
                  <Link href="/me" className="hover:text-white text-neutral-300">Me</Link>
                  <UserButton />
                </Show>
                <Show when="signed-out">
                  <SignInButton><button className="text-neutral-300 hover:text-white">Sign in</button></SignInButton>
                  <SignUpButton><button className="rounded-full bg-white text-black px-3 py-1 font-medium">Sign up</button></SignUpButton>
                </Show>
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
