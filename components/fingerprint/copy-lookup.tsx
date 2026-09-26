"use client";
import { useWorkspaceActive } from "@/components/dashboard/workspace-activity";
import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { useKeyVault } from "@/hooks/use-key-vault";
import { unwrapCopyMaterial } from "@/lib/fingerprint/copy-secret";
import { parseIssuedProfile } from "@/lib/fingerprint/profile";

export type LocalCandidate = { id: string; documentId: string; shareId: string; identifier: Uint8Array; secret: Uint8Array | null; recipientEmail: string; recipientName?: string | null };
type EncryptedCandidate = Omit<LocalCandidate, "identifier" | "secret"> & { ownerWrappedKey: string; profileId: string };
export function CopyLookup({ onChange, busy = false }: { busy?: boolean; onChange: (candidates: LocalCandidate[], ready: boolean) => void }) {
  const { user } = useUser();
  const active = useWorkspaceActive();
  const wasActive = useRef(active);
  const vault = useKeyVault(user?.id);
  const [message, setMessage] = useState("Preparing recipient lookup…");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (active && !wasActive.current && !busy) {
      void Promise.resolve().then(() => { if (!cancelled) { wasActive.current = true; setRetry(value => value + 1); } });
    }
    if (!active) wasActive.current = false;
    return () => { cancelled = true; };
  }, [active, busy]);
  useEffect(() => {
    const controller = new AbortController();
    const candidates: LocalCandidate[] = [];
    onChange([], false);
    async function load() {
      setFailed(false);
      if (vault.state.status !== "READY") {
        setMessage(vault.state.status === "ERROR" ? vault.state.message : vault.state.status === "CHECKING" || vault.state.status === "NEEDS_SETUP" ? "Preparing recipient lookup…" : "This browser does not have the device key for recipient lookup.");
        return;
      }
      setMessage("Loading recipient copies…");
      try {
        let cursor: string | null = null;
        do {
          const response: Response = await fetch(`/api/fingerprints${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal: controller.signal });
          const body: { candidates: EncryptedCandidate[]; nextCursor: string | null; error?: { message?: string } } = await response.json();
          if (!response.ok) throw new Error(body.error?.message ?? "Recipient records unavailable.");
          for (const candidate of body.candidates) {
            if (controller.signal.aborted) return;
            const profile = parseIssuedProfile(candidate.profileId);
            if (!profile) throw new Error("An issued profile is unavailable. Recipient lookup could not be completed.");
            const material = await unwrapCopyMaterial(candidate.documentId, candidate.ownerWrappedKey, vault.state.privateKey);
            if (controller.signal.aborted) { material.identifier.fill(0); material.secret.fill(0); return; }
            if (!profile.denseProfile) material.secret.fill(0);
            candidates.push({ id: candidate.id, documentId: candidate.documentId, shareId: candidate.shareId,
              recipientName: candidate.recipientName, recipientEmail: candidate.recipientEmail, identifier: material.identifier, secret: profile.denseProfile ? material.secret : null });
          }
          cursor = body.nextCursor;
        } while (cursor);
        if (controller.signal.aborted) return;
        onChange(candidates, true);
        setMessage(candidates.length ? "" : "No fingerprinted shares found. Test images can be decoded, but cannot identify a recipient.");
      } catch (error) {
        if (controller.signal.aborted) return;
        candidates.forEach(candidate => { candidate.identifier.fill(0); candidate.secret?.fill(0); });
        setFailed(true);
        setMessage(error instanceof Error ? error.message : "Recipient lookup failed. Try again.");
      }
    }
    void load();
    return () => { controller.abort(); candidates.forEach(candidate => { candidate.identifier.fill(0); candidate.secret?.fill(0); }); };
  }, [user?.id, vault.state, retry, onChange]);
  return <>
    {message && <div className="space-y-3 rounded-xl border-2 border-black bg-card p-4">
    <p role="status" className="text-sm">{message}</p>
    {(failed || vault.state.status === "ERROR") && <button onClick={() => { if (vault.state.status === "ERROR") void vault.refresh(); else setRetry(value => value + 1); }} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-4 py-2 font-bold">Retry recipient lookup</button>}
    </div>}
  </>;
}
