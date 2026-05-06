import { Show, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Rate every song. Follow your taste.</h1>
      <p className="text-lg text-neutral-400">
        Score tracks 1–100, build a profile of your taste, and see what your friends are listening to.
      </p>
      <div className="flex gap-3">
        <Show when="signed-out">
          <SignUpButton forceRedirectUrl="/welcome">
            <button className="rounded-full bg-white text-black px-5 py-2 font-medium">Get started</button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link href="/feed" className="rounded-full bg-white text-black px-5 py-2 font-medium">Open feed</Link>
          <Link href="/search" className="rounded-full border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900">Find a song</Link>
        </Show>
      </div>
    </div>
  );
}
