"use client";
import { Component, type ReactNode } from "react";

// Tiny per-row error boundary. Wrap each feed/list item so a single bad
// row renders a thin "couldn't load" placeholder instead of nuking the
// whole page. Server-side throws are caught upstream by Next's error.tsx,
// so this only protects against client-side renders that go sideways
// (image src crash, mention parser regex blowing up, etc).
type State = { hasError: boolean };

export class SafeCardBoundary extends Component<{ children: ReactNode }, State> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (typeof console !== "undefined") {
      console.warn("[card-boundary]", error.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <li className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 text-xs text-neutral-500">
          This card couldn&apos;t load. Refresh to try again.
        </li>
      );
    }
    return this.props.children;
  }
}
