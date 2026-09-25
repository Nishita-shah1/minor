"use client";

import { useState } from "react";
import { KeyVaultDialog } from "@/components/crypto/key-vault-dialog";
import type { useKeyVault } from "@/hooks/use-key-vault";
import { claimInvitation } from "@/lib/shares/invitation-crypto";
import { inviteStorageKey } from "./invitation-capture";

export function InvitationClaim({ shareId, vault }: { shareId: string; vault: ReturnType<typeof useKeyVault> }) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const open = async () => {
    if (vault.state.status !== "READY") return setVaultOpen(true);
    const stored = sessionStorage.getItem(inviteStorageKey(shareId));
    const supplied = code.match(/(?:#invite=)?([A-Za-z0-9_-]{43})$/)?.[1];
    const secret = stored || supplied;
    if (!secret) return setMessage("Open the original invitation link or paste its claim code below.");
    setBusy(true); setMessage("Preparing your protected copy locally…");
    try {
      const response = await fetch(`/api/shares/${shareId}/invitation`, { cache: "no-store" });
      const grant = await response.json();
      if (!response.ok) throw new Error(grant.error?.message ?? "Invitation grant unavailable.");
      const claim = await claimInvitation({ shareId, ciphertext: grant.ciphertext, iv: grant.iv,
        inviteSecret: secret, recipientPublicKeyJwk: vault.state.bundle.publicKeyJwk });
      const claimed = await fetch(`/api/shares/${shareId}/claim`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...claim, publicKeyFingerprint: vault.state.bundle.publicKeyFingerprint, keyVersion: vault.state.bundle.keyVersion }) });
      const result = await claimed.json();
      if (!claimed.ok) throw new Error(result.error?.message ?? "Could not claim this invitation.");
      sessionStorage.removeItem(inviteStorageKey(shareId));
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Secure access could not be prepared."); setBusy(false); }
  };

  return <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-5 text-center">
    <h1 className="font-head text-3xl">Set up secure access</h1>
    <p className="max-w-md">This creates an encryption key on this device so EchoLeaks can open files shared with you.</p>
    {vault.state.status === "READY" ? <button disabled={busy} onClick={() => void open()} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-6 py-3 font-head shadow-md disabled:opacity-50">{busy ? "Preparing…" : "Open protected document"}</button>
      : vault.state.status === "ERROR" ? <><p role="alert" className="text-destructive">{vault.state.message}</p><button onClick={() => void vault.refresh()} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-6 py-3 font-head shadow-md">Try again</button></>
      : <button disabled={vault.state.status === "CHECKING"} onClick={() => setVaultOpen(true)} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-6 py-3 font-head shadow-md disabled:opacity-50">{vault.state.status === "NEEDS_SETUP" ? "Create secure key" : "Unlock secure key"}</button>}
    <label className="w-full max-w-md text-sm">If the email link lost its code, paste the full invitation link or claim code
      <input value={code} onChange={event => setCode(event.target.value)} className="mt-2 w-full rounded-xl border-2 border-black bg-card p-3" autoComplete="off" />
    </label>
    {message && <p role="status" className="max-w-md rounded-xl border-2 border-black bg-card p-3">{message}</p>}
    <KeyVaultDialog open={vaultOpen} onOpenChange={setVaultOpen} state={vault.state} onSetup={vault.setup} onUnlock={vault.unlock} />
  </main>;
}
