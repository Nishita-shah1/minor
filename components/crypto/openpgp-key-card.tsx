"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { SenderKeyPicker } from "@/components/crypto/sender-key-picker";
import { readImportedPublicKey } from "@/lib/openpgp/read-public-key";
import { Textarea } from "@/components/ui/textarea";

type PublishedKey = { armoredPublicKey: string; fingerprint: string };

function formatFingerprint(value: string) {
  return value.toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

export function OpenPgpKeyCard() {
  const [armoredKey, setArmoredKey] = useState("");
  const [saved, setSaved] = useState<PublishedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/openpgp-keys", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { key?: PublishedKey | null; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load your OpenPGP key.");
      if (!cancelled) setSaved(body.key ?? null);
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load your OpenPGP key.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await readImportedPublicKey(armoredKey);
      const response = await fetch("/api/openpgp-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ armoredPublicKey: armoredKey }),
      });
      const body = await response.json() as PublishedKey & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not save this public key.");
      setSaved({ armoredPublicKey: body.armoredPublicKey, fingerprint: body.fingerprint });
      setArmoredKey("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this public key.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/openpgp-keys", { method: "DELETE" });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not remove this public key.");
      setSaved(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this public key.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4 rounded-2xl border-2 border-black bg-card p-4 shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full border-2 border-black bg-primary text-primary-foreground shadow-sm">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <h2 className="font-head text-xl">OpenPGP public key</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Search a sender to use their saved public key, or paste one. EchoLeaks stores that public key only. Share emails are encrypted to it in the sender browser, and you decrypt them locally with your private key.</p>
      <SenderKeyPicker disabled={busy} onSelect={(sender) => { setArmoredKey(sender.armoredPublicKey); setError(""); }} />
      {loading && <p className="mt-3 flex items-center gap-2 text-sm" role="status"><LoaderCircle className="size-4 animate-spin" /> Loading saved key…</p>}
      {saved && <p className="mt-3 rounded-xl border-2 border-black bg-background p-3 text-sm"><span className="font-bold">Published fingerprint</span><br /><span className="break-all font-mono text-xs">{formatFingerprint(saved.fingerprint)}</span></p>}
      <label className="mt-3 grid gap-1.5 font-bold">
        {saved ? "Replace public key" : "Public key"}
        <Textarea value={armoredKey} onChange={(event) => setArmoredKey(event.target.value)} spellCheck={false} placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----" aria-label="OpenPGP public key" className="min-h-36 rounded-xl border-2 border-black font-mono text-xs" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !armoredKey.trim()} onClick={() => void save()} className="rounded-full border-2 border-black bg-primary px-5 py-2.5 font-head text-primary-foreground shadow-sm disabled:opacity-50">Save public key</button>
        {saved && <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-full border-2 border-black bg-background px-5 py-2.5 font-bold shadow-sm disabled:opacity-50">Remove</button>}
      </div>
      {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
    </section>
  );
}
