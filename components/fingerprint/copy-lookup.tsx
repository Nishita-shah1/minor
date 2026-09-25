"use client";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { KeyVaultDialog } from "@/components/crypto/key-vault-dialog";
import { useKeyVault } from "@/hooks/use-key-vault";
import { unwrapCopyIdentifier, EXPERIMENTAL_PROFILE } from "@/lib/fingerprint/copy-secret";
export type LocalCandidate = { id: string; identifier: Uint8Array; recipientEmail: string; recipientName?: string | null };
export function CopyLookup({ onChange }: { onChange: (candidates: LocalCandidate[]) => void }) {
  const { user } = useUser();
  const vault = useKeyVault(user?.id);
  const [documents, setDocuments] = useState<Array<{id: string; label: string}>>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("Select the original shared document.");
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/upload-groups", {cache:"no-store"}).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load owned documents.");
      if (!cancelled) setDocuments(body.groups.filter((group: {status: string}) => group.status === "READY").flatMap((group: {id:string;createdAt:string;documents:Array<{id:string;status:string}>}) => group.documents.filter(document => document.status === "READY").map((document,index) => ({id:document.id,label:`${new Date(group.createdAt).toLocaleDateString()} · file ${index+1} · ${document.id.slice(0,8)}`}))));
    }).catch(error => {if (!cancelled) setMessage(error.message);});
    return () => {cancelled=true;};
  }, []);
  async function load() {
    if (vault.state.status !== "READY") {setOpen(true);return;}
    setBusy(true); onChange([]);
    try {
      const response = await fetch(`/api/documents/${selected}/fingerprints`, {cache:"no-store"});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Copy records unavailable.");
      const candidates: LocalCandidate[] = [];
      for (const candidate of body.candidates) {
        if (candidate.profileId !== EXPERIMENTAL_PROFILE) throw new Error("An issued profile is unavailable; lookup cannot safely continue.");
        candidates.push({id:candidate.id,recipientName:candidate.recipientName,recipientEmail:candidate.recipientEmail,identifier:await unwrapCopyIdentifier(selected,candidate.ownerWrappedKey,vault.state.privateKey)});
      }
      onChange(candidates); setMessage(candidates.length ? `${candidates.length} historical copies loaded locally. Analyze your screenshot.` : "No fingerprint records exist for this document. Older unmarked shares cannot be traced.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "Copy records could not be decrypted.");}
    finally {setBusy(false);}
  }
  return <div className="space-y-3 rounded-xl border-2 border-black bg-card p-4">
    <label className="block font-bold">Original shared document<select aria-label="Original shared document" disabled={busy} value={selected} onChange={event=>{setSelected(event.target.value);onChange([]);}} className="mt-2 block w-full rounded-xl border-2 border-black bg-background p-3"><option value="">Choose a document</option>{documents.map(document=><option key={document.id} value={document.id}>{document.label}</option>)}</select></label>
    <button disabled={!selected || busy} onClick={()=>void load()} className="rounded-full border-2 border-black bg-primary px-4 py-2 font-bold disabled:opacity-40">{busy ? "Decrypting copy records…" : vault.state.status === "READY" ? "Load recipient copies" : "Unlock owner keys"}</button>
    <p role="status" className="text-sm">{message}</p>
    <KeyVaultDialog open={open} onOpenChange={setOpen} state={vault.state} onSetup={vault.setup} onUnlock={vault.unlock} />
  </div>;
}
