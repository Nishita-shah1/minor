"use client";

import { useUser } from "@clerk/nextjs";
import { ArrowDown, ArrowUp, FileText, LoaderCircle, LockKeyhole, Plus, RotateCcw, ShieldCheck, Trash2, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { KeyVaultDialog } from "@/components/crypto/key-vault-dialog";
import { SharePanel } from "@/components/dashboard/share-panel";
import { useKeyVault } from "@/hooks/use-key-vault";
import { MAX_FILE_BYTES, MAX_GROUP_BYTES, MAX_GROUP_FILES } from "@/lib/crypto/constants";
import { encryptAndUpload } from "@/lib/crypto/worker-client";

type ItemPhase = "STAGED" | "PREPARING" | "ENCRYPTING" | "UPLOADING" | "READY" | "FAILED" | "DELETED";
type QueueItem = { id: string; file: File; phase: ItemPhase; documentId: string | null; message: string };
type GroupConfig = { groupId: string; ownerPublicKeyJwk: JsonWebKey; ownerKeyVersion: number; cryptoVersion: number };

const activePhases: ItemPhase[] = ["PREPARING", "ENCRYPTING", "UPLOADING"];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function UploadWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useUser();
  const vault = useKeyVault(user?.id);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [config, setConfig] = useState<GroupConfig | null>(null);
  const [groupReady, setGroupReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Add files, review the group, then protect them together.");
  const [vaultOpen, setVaultOpen] = useState(false);

  const updateItem = (id: string, patch: Partial<QueueItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const readyCount = items.filter((item) => item.phase === "READY").length;
  const failedCount = items.filter((item) => item.phase === "FAILED").length;

  const addFiles = (files: File[]) => {
    if (busy || config) return;
    const next = [...items];
    for (const file of files) {
      if (next.length >= MAX_GROUP_FILES) { setMessage("A group can contain at most 10 files."); break; }
      if (file.size > MAX_FILE_BYTES) { setMessage(`${file.name} is larger than 25 MiB.`); continue; }
      if (next.reduce((sum, item) => sum + item.file.size, 0) + file.size > MAX_GROUP_BYTES) { setMessage("A group can contain at most 100 MiB."); break; }
      next.push({ id: crypto.randomUUID(), file, phase: "STAGED", documentId: null, message: "Ready" });
    }
    setItems(next);
  };

  const processItem = async (item: QueueItem, documentId: string, group: GroupConfig, retry = false) => {
    if (retry) {
      const retryResponse = await fetch(`/api/documents/${documentId}/retry`, { method: "POST" });
      const retryState = await retryResponse.json();
      if (!retryResponse.ok) throw new Error(retryState.error?.message ?? "Could not retry this file.");
      if (retryState.alreadyReady) { updateItem(item.id, { documentId, phase: "READY", message: "Protected" }); return; }
    }
    updateItem(item.id, { documentId, phase: "PREPARING", message: "Preparing" });
    const urlResponse = await fetch(`/api/documents/${documentId}/upload-url`, { method: "POST" });
    const url = await urlResponse.json();
    if (!urlResponse.ok) throw new Error(url.error?.message ?? "Could not prepare encrypted storage.");
    updateItem(item.id, { phase: "ENCRYPTING", message: "Encrypting locally" });
    const encrypted = await encryptAndUpload({
      file: item.file, documentId, uploadUrl: url.uploadUrl,
      ownerPublicKeyJwk: group.ownerPublicKeyJwk, ownerKeyVersion: group.ownerKeyVersion,
    }, (phase) => { if (phase === "UPLOADING") updateItem(item.id, { phase: "UPLOADING", message: "Uploading ciphertext" }); });
    const completeResponse = await fetch(`/api/documents/${documentId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...encrypted, cryptoVersion: group.cryptoVersion }) });
    const completed = await completeResponse.json();
    if (!completeResponse.ok) throw new Error(completed.error?.message ?? "Could not finalize this file.");
    updateItem(item.id, { phase: "READY", message: "Protected" });
  };

  const protect = async () => {
    if (!items.length || busy) return;
    if (!window.isSecureContext) return setMessage("Browser encryption requires HTTPS or localhost.");
    if (vault.state.status !== "READY") { setVaultOpen(true); return; }
    setBusy(true); setMessage("Creating private upload slots…");
    try {
      const response = await fetch("/api/upload-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileCount: items.length }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not create the upload group.");
      const group: GroupConfig = { groupId: body.groupId, ownerPublicKeyJwk: body.ownerPublicKeyJwk, ownerKeyVersion: body.ownerKeyVersion, cryptoVersion: body.cryptoVersion };
      setConfig(group);
      let failures = 0;
      for (const [index, item] of items.entries()) {
        const documentId = body.documents[index].documentId as string;
        try { await processItem(item, documentId, group); }
        catch (error) {
          failures += 1;
          updateItem(item.id, { documentId, phase: "FAILED", message: error instanceof Error ? error.message : "Protection failed" });
          await fetch(`/api/documents/${documentId}/fail`, { method: "POST" }).catch(() => undefined);
        }
      }
      if (failures) setMessage(`${items.length - failures} / ${items.length} protected. Retry or remove failed files.`);
      else { setGroupReady(true); setMessage(`${items.length} / ${items.length} protected. Only ciphertext was uploaded.`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Protection failed."); }
    finally { setBusy(false); }
  };

  const retry = async (item: QueueItem) => {
    if (!config || !item.documentId || busy) return;
    setBusy(true);
    try {
      await processItem(item, item.documentId, config, true);
      const remainingFailures = items.filter((candidate) => candidate.id !== item.id && candidate.phase === "FAILED").length;
      if (!remainingFailures) { setGroupReady(true); setMessage("All files are protected."); }
    } catch (error) {
      updateItem(item.id, { phase: "FAILED", message: error instanceof Error ? error.message : "Retry failed" });
      await fetch(`/api/documents/${item.documentId}/fail`, { method: "POST" }).catch(() => undefined);
    } finally { setBusy(false); }
  };

  const continueWithoutFailed = async () => {
    if (!config || !readyCount || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/upload-groups/${config.groupId}/continue`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not finalize the successful files.");
      setItems((current) => current.map((item) => item.phase === "FAILED" ? { ...item, phase: "DELETED", message: "Removed" } : item));
      setGroupReady(true); setMessage(`${body.fileCount} files protected. Failed files were removed.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not continue."); }
    finally { setBusy(false); }
  };

  const deleteDocument = async (item: QueueItem) => {
    if (!item.documentId || !confirm(`Remove ${item.file.name} from this protected group?`)) return;
    const response = await fetch(`/api/documents/${item.documentId}`, { method: "DELETE" });
    if (response.ok) { updateItem(item.id, { phase: "DELETED", message: "Removed by owner" }); if (readyCount === 1) setGroupReady(false); }
    else setMessage("The encrypted file could not be deleted. Try again.");
  };

  const deleteGroup = async () => {
    if (!config || !confirm("Delete every encrypted file and revoke every link in this group?")) return;
    const response = await fetch(`/api/upload-groups/${config.groupId}`, { method: "DELETE" });
    if (response.ok) { setItems((current) => current.map((item) => ({ ...item, phase: "DELETED", message: "Removed by owner" }))); setGroupReady(false); setMessage("Encrypted files and cryptographic access material were removed. Minimal audit metadata may remain."); }
    else setMessage("Deletion is incomplete and access remains blocked. Try again.");
  };

  const move = (index: number, direction: -1 | 1) => setItems((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });

  return (
    <section className="min-h-svh px-5 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <header><p className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">Protect files</p><h1 className="mt-1 font-head text-4xl sm:text-5xl">Upload</h1></header>
        <div className="mt-4 rounded-2xl border-2 border-black bg-primary p-4 shadow-md"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-card"><ShieldCheck className="size-5" /></span><div><h2 className="font-head text-xl">Protect a file group</h2><p className="text-sm">Every file is encrypted locally with its own key.</p></div></div></div>
        <h2 className="mt-6 font-head text-2xl">1. Add and review files</h2>
        <div className="mt-3 rounded-2xl border-[3px] border-dashed border-black bg-card p-4">
          <input ref={inputRef} type="file" multiple className="sr-only" disabled={busy || !!config} onChange={(event) => { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
          {!items.length ? <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-36 w-full flex-col items-center justify-center rounded-2xl"><UploadCloud className="size-10" /><span className="mt-2 font-head text-xl">Choose up to 10 files</span><span className="text-sm text-muted-foreground">25 MiB each · 100 MiB total</span></button> : <div className="space-y-2">{items.map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-xl border-2 border-black bg-background p-3"><FileText className="size-5 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.file.name}</p><p className="text-xs text-muted-foreground">{formatFileSize(item.file.size)} · {item.message}</p></div>{!config && <><button type="button" aria-label="Move up" onClick={() => move(index, -1)} className="rounded-full border-2 border-black p-2"><ArrowUp className="size-4" /></button><button type="button" aria-label="Move down" onClick={() => move(index, 1)} className="rounded-full border-2 border-black p-2"><ArrowDown className="size-4" /></button><button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} className="rounded-full border-2 border-black p-2"><X className="size-4" /></button></>}{item.phase === "FAILED" && <button type="button" disabled={busy} onClick={() => void retry(item)} className="flex items-center gap-1 rounded-full border-2 border-black bg-primary px-3 py-2 font-bold"><RotateCcw className="size-4" /> Retry</button>}{groupReady && item.phase === "READY" && <button type="button" onClick={() => void deleteDocument(item)} className="rounded-full border-2 border-black bg-destructive p-2" aria-label={`Delete ${item.file.name}`}><Trash2 className="size-4" /></button>}{activePhases.includes(item.phase) && <LoaderCircle className="size-5 animate-spin" />}</div>)}</div>}
          {!config && items.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-2 rounded-full border-2 border-black bg-background px-4 py-2 font-bold"><Plus className="size-4" /> Add another file</button><span className="text-xs font-bold text-muted-foreground">{formatFileSize(items.reduce((sum, item) => sum + item.file.size, 0))} / 100 MiB</span></div>}
        </div>
        {!config && <button type="button" disabled={!items.length || busy} onClick={() => void protect()} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-[3px] border-black bg-primary font-head text-lg shadow-md disabled:opacity-45"><LockKeyhole className="size-5" /> Protect {items.length || ""} {items.length === 1 ? "file" : "files"}</button>}
        {config && <p className="mt-3 font-bold">{readyCount} / {items.filter((item) => item.phase !== "DELETED").length} protected</p>}
        {failedCount > 0 && readyCount > 0 && <button type="button" disabled={busy} onClick={() => void continueWithoutFailed()} className="mt-3 rounded-full border-2 border-black bg-primary px-5 py-2.5 font-bold shadow-sm">Remove failed files and continue</button>}
        <p className="mt-3 min-h-6 text-sm text-muted-foreground" aria-live="polite">{message}</p>
        {config && groupReady && vault.state.status === "READY" && <><SharePanel groupId={config.groupId} privateKey={vault.state.privateKey} /><button type="button" onClick={() => void deleteGroup()} className="mt-4 rounded-full border-2 border-black bg-destructive px-5 py-2.5 font-bold shadow-sm"><Trash2 className="mr-2 inline size-4" /> Delete protected group</button></>}
        <KeyVaultDialog open={vaultOpen} onOpenChange={setVaultOpen} state={vault.state} onSetup={vault.setup} onUnlock={vault.unlock} />
      </div>
    </section>
  );
}
