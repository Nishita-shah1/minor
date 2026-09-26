"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { knownSenders, type SenderPublicKey } from "@/lib/openpgp/known-senders";

function formatFingerprint(value: string) {
  return value.toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

export function SenderKeyPicker({
  onSelect,
  disabled = false,
  focusSignal = 0,
  targetLabel,
}: {
  onSelect: (sender: SenderPublicKey) => void;
  disabled?: boolean;
  focusSignal?: number;
  targetLabel?: string | null;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [senders, setSenders] = useState<SenderPublicKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/openpgp-keys/directory", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { senders?: SenderPublicKey[]; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load sender public keys.");
      if (!cancelled) setSenders(body.senders ?? []);
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setSenders(knownSenders);
        setError(caught instanceof Error ? caught.message : "Could not load sender public keys.");
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!focusSignal) return;
    inputRef.current?.focus();
    setOpen(true);
  }, [focusSignal]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!needle) return senders;
    return senders.filter((sender) => {
      const haystack = `${sender.name} ${sender.email ?? ""} ${sender.aliases ?? ""} ${sender.fingerprint}`.toLowerCase().replace(/\s+/g, "");
      return haystack.includes(needle);
    });
  }, [query, senders]);

  const choose = (sender: SenderPublicKey) => {
    setQuery(sender.name);
    setOpen(false);
    onSelect(sender);
  };

  return (
    <div ref={rootRef} className="relative mt-3 grid gap-1.5">
      <label className="font-bold" htmlFor={`${listId}-search`}>
        {targetLabel ? `Public key for ${targetLabel}` : "Search senders"}
      </label>
      <input
        ref={inputRef}
        id={`${listId}-search`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={query}
        placeholder={loading ? "Loading sender public keys…" : "Search by name"}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && filtered[active]) {
            event.preventDefault();
            choose(filtered[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-11 rounded-xl border-2 border-black bg-background px-3 disabled:opacity-50"
      />
      {open && (
        <ul id={listId} role="listbox" className="z-20 max-h-64 w-full overflow-auto rounded-xl border-2 border-black bg-card p-1 shadow-md">
          {filtered.map((sender, index) => (
            <li key={`${sender.fingerprint}:${sender.email ?? sender.name}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(sender)}
                className={`w-full rounded-lg px-3 py-2 text-left ${index === active ? "bg-primary text-primary-foreground" : ""}`}
              >
                <span className="block font-bold">{sender.name}</span>
                {sender.email && <span className="block text-xs">{sender.email}</span>}
                <span className="block break-all font-mono text-xs">{formatFingerprint(sender.fingerprint)}</span>
              </button>
            </li>
          ))}
          {!filtered.length && <li className="px-3 py-2 text-sm">{error || "No senders match that search."}</li>}
        </ul>
      )}
      {error && !open && <p className="text-sm" role="alert">{error}</p>}
    </div>
  );
}
