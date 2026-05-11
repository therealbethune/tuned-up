"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { extractMentions } from "@/lib/mentions";
import { Avatar } from "@/components/Avatar";

type Candidate = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
};

export type MentionInputHandle = {
  focus: () => void;
};

type CommonProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
  /** Called when Enter is pressed and there's no active typeahead. */
  onSubmit?: () => void;
};

type Props =
  | (CommonProps & { as?: "input"; rows?: never })
  | (CommonProps & { as: "textarea"; rows?: number });

// A controlled <input> or <textarea> that surfaces an @-mention typeahead
// dropdown above it. Use anywhere you want users to be able to mention
// other users by name.
export const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  props,
  ref,
) {
  const {
    value,
    onChange,
    placeholder,
    maxLength,
    className = "",
    disabled,
    onSubmit,
  } = props;
  const as = props.as ?? "input";
  const rows = (props as { rows?: number }).rows ?? 3;

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const [mentionAt, setMentionAt] = useState<number | null>(null);
  const [mentionPartial, setMentionPartial] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const reqId = useRef(0);

  function detectMention(text: string, cursor: number) {
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");
    if (lastAt < 0) {
      setMentionAt(null);
      setMentionPartial("");
      return;
    }
    const between = before.slice(lastAt + 1);
    if (!/^[a-zA-Z0-9_]*$/.test(between)) {
      setMentionAt(null);
      setMentionPartial("");
      return;
    }
    if (lastAt > 0 && !/\s/.test(text[lastAt - 1])) {
      setMentionAt(null);
      setMentionPartial("");
      return;
    }
    setMentionAt(lastAt);
    setMentionPartial(between);
    setActiveIdx(0);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    detectMention(next, e.target.selectionStart ?? next.length);
  }

  useEffect(() => {
    if (mentionAt == null || mentionPartial.length < 1) {
      setCandidates([]);
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(mentionPartial)}`,
        );
        const data = await res.json();
        if (id !== reqId.current) return;
        setCandidates((data.results ?? []).slice(0, 5));
      } catch {
        if (id === reqId.current) setCandidates([]);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [mentionAt, mentionPartial]);

  function pick(c: Candidate) {
    if (mentionAt == null) return;
    const tokenLen = 1 + mentionPartial.length;
    const before = value.slice(0, mentionAt);
    const after = value.slice(mentionAt + tokenLen);
    const insert = `@${c.username} `;
    onChange(before + insert + after);
    setMentionAt(null);
    setMentionPartial("");
    setCandidates([]);
    const newCursor = before.length + insert.length;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    });
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (mentionAt != null && candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(candidates[activeIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMentionAt(null);
        setMentionPartial("");
        setCandidates([]);
        return;
      }
    }
    // Submit on Enter when there's no active typeahead (input only — textarea
    // should keep allowing newlines).
    if (e.key === "Enter" && !e.shiftKey && as === "input" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  // Track the blur-debounce timeout so we can cancel it on unmount and avoid
  // setState on a torn-down component.
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  function handleBlur() {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    // Let click-on-suggestion fire first.
    blurTimeoutRef.current = setTimeout(() => {
      setMentionAt(null);
      setCandidates([]);
      blurTimeoutRef.current = null;
    }, 120);
  }

  // Surface every @-mention currently in the value, plus whether each one
  // resolves to a real user. Gives the typer immediate feedback that the tag
  // is recognized — no need to wait until they post.
  const mentionsInValue = useMemo(() => extractMentions(value), [value]);
  const [resolved, setResolved] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    const unresolved = mentionsInValue.filter((u) => !resolved.has(u));
    if (unresolved.length === 0) return;
    let cancelled = false;
    Promise.all(
      unresolved.map(async (u) => {
        try {
          const r = await fetch(`/api/users/search?q=${encodeURIComponent(u)}`);
          const j = await r.json();
          const found = (j.results ?? []).some(
            (x: { username?: string }) => (x.username ?? "").toLowerCase() === u,
          );
          return [u, found] as const;
        } catch {
          return [u, false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResolved((prev) => {
        const next = new Map(prev);
        for (const [u, ok] of entries) next.set(u, ok);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // We intentionally key off the joined list so we re-resolve only when
    // the *set* of mentions changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionsInValue.join("|")]);

  const showTypeahead = mentionAt != null && candidates.length > 0;

  const sharedProps = {
    ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      inputRef.current = el;
    },
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
    placeholder,
    maxLength,
    disabled,
    className,
  };

  return (
    <div className="relative">
      {as === "textarea" ? (
        <textarea {...sharedProps} rows={rows} />
      ) : (
        <input {...sharedProps} />
      )}
      {showTypeahead && (
        <ul className="absolute left-0 right-0 bottom-full mb-1 z-30 max-h-56 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg text-sm">
          {candidates.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
                  i === activeIdx ? "bg-neutral-800" : "hover:bg-neutral-800/60"
                }`}
              >
                <Avatar
                  imageUrl={c.imageUrl}
                  name={c.displayName || c.username}
                  seed={c.id}
                  size={24}
                  ring={false}
                />
                <span className="font-medium truncate">
                  {c.displayName || c.username}
                </span>
                <span className="text-neutral-500 truncate">@{c.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mentionsInValue.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
          {mentionsInValue.map((u) => {
            const status = resolved.get(u);
            if (status === true) {
              return (
                <span
                  key={u}
                  className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300"
                  title={`Will tag @${u}`}
                >
                  ✓ @{u}
                </span>
              );
            }
            if (status === false) {
              return (
                <span
                  key={u}
                  className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/40 text-red-300"
                  title="No user with this handle"
                >
                  ✗ @{u}
                </span>
              );
            }
            return (
              <span
                key={u}
                className="px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400"
              >
                … @{u}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});
