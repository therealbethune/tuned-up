"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Image from "next/image";

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

  function handleBlur() {
    // Let click-on-suggestion fire first.
    setTimeout(() => {
      setMentionAt(null);
      setCandidates([]);
    }, 120);
  }

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
        <ul className="absolute left-0 right-0 bottom-full mb-1 z-20 max-h-56 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg text-sm">
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
                {c.imageUrl ? (
                  <Image
                    src={c.imageUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="rounded-full h-6 w-6"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-neutral-700" />
                )}
                <span className="font-medium truncate">
                  {c.displayName || c.username}
                </span>
                <span className="text-neutral-500 truncate">@{c.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
