"use client";
import { useEffect } from "react";

// Lock body scroll while a modal/sheet is open. Without this, iOS lets
// the page underneath scroll when you drag inside the dialog — touch
// events bleed through any backdrop, especially when the dialog uses
// `max-h-[85vh] overflow-y-auto`. The fix is to pin `body { overflow:
// hidden }` for the duration the dialog is mounted/open.
//
// Why a hook? We had this logic inline in RateButton but every other
// sheet (LikersSheet, RecommendButton, ConfirmDialog, MentionInput
// dropdown on mobile) was missing it, so each behaved differently on
// iOS. One hook = one source of truth.
//
// Restores whatever `body.style.overflow` was BEFORE we touched it so
// nested locks compose: if a sheet inside a sheet both lock, the outer
// sheet's value is restored when the inner one closes.
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
