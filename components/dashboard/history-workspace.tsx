"use client";

import { useUser } from "@clerk/nextjs";
import { FileText, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { KeyVaultDialog } from "@/components/crypto/key-vault-dialog";
import { useKeyVault } from "@/hooks/use-key-vault";
import type { FileMetadata } from "@/lib/crypto/types";
import { decryptMetadata } from "@/lib/crypto/worker-client";

type Group = { id: string; status: string; expectedFileCount: number; createdAt: string; documents: Array<{ id: string; status: string }> };
type NamedFile = { documentId: string; status: "READY" | "DELETED"; metadata: FileMetadata | null };

export function HistoryWorkspace() {
  const { user } = useUser();
  const vault = useKeyVault(user?.id);
  const [groups, setGroups] = useState<Group[]>([]);
  const [names, setNames] = useState<Record<string, NamedFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [vaultOpen, setVaultOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/upload-groups", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load uploads.");
      if (!cancelled) setGroups(body.groups);
    }).catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load uploads."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const unlockNames = async () => {
    if (vault.state.status !== "READY") { setVaultOpen(true); return; }
    const privateKey = vault.state.privateKey;
    setLoading(true);
    try {
      const entries = await Promise.all(groups.filter((group) => group.status !== "DELETED").map(async (group) => {
        const response = await fetch(`/api/upload-groups/${group.id}/owner-access`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load encrypted metadata.");
        const descriptors = body.files.filter((file: { status: string }) => file.status === "READY" || file.status === "DELETED").map((file: { documentId: string; status: string; wrappedFileKey: string | null; encryptedMetadata: string | null; metadataIv: string | null }) => ({ ...file, status: file.status === "READY" ? "READY" as const : "DELETED" as const }));
        return [group.id, await decryptMetadata(privateKey, descriptors)] as const;
      }));
      setNames(Object.fromEntries(entries));
    } catch { setMessage("Unlocking filenames failed. Check your recovery passphrase or device key."); }
    finally { setLoading(false); }
  };

  const deleteFile = async (groupId: string, documentId: string, name: string) => {
    if (!confirm(`Permanently remove encrypted bytes and key material for ${name}?`)) return;
    const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    if (response.ok) {
      setNames((current) => current[groupId] ? ({ ...current, [groupId]: current[groupId].map((file) => file.documentId === documentId ? { ...file, status: "DELETED", metadata: null } : file) }) : current);
      setGroups((current) => current.map((group) => {
        if (group.id !== groupId) return group;
        const documents = group.documents.map((document) => document.id === documentId ? { ...document, status: "DELETED" } : document);
        return { ...group, documents, status: documents.every((document) => document.status === "DELETED") ? "DELETED" : group.status };
      }));
      setMessage("Encrypted file removed. Minimal audit metadata may remain.");
    }
    else setMessage("Deletion is incomplete and access remains blocked. Retry.");
  };

  const deleteGroup = async (groupId: string) => {
    if (!confirm("Delete this complete group, revoke its links, and remove all encrypted bytes?")) return;
    const response = await fetch(`/api/upload-groups/${groupId}`, { method: "DELETE" });
    if (response.ok) { setGroups((current) => current.map((group) => group.id === groupId ? { ...group, status: "DELETED" } : group)); setMessage("Protected group deleted. Minimal audit metadata may remain."); }
    else setMessage("Deletion is incomplete and access remains blocked. Retry.");
  };

  return <section className="min-h-svh px-5 py-6 sm:px-7 lg:px-10"><div className="mx-auto max-w-6xl"><header><p className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">Owner workspace</p><h1 className="mt-1 font-head text-4xl sm:text-5xl">History</h1></header>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void unlockNames()} disabled={loading || !groups.length} className="flex items-center gap-2 rounded-full border-2 border-black bg-primary px-5 py-2.5 font-bold shadow-sm disabled:opacity-50"><KeyRound className="size-4" /> Unlock filenames</button>{loading && <LoaderCircle className="size-5 animate-spin" />}</div>
    <div className="mt-5 space-y-4">{groups.map((group) => <article key={group.id} className="rounded-2xl border-[3px] border-black bg-card p-4 shadow-md"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-head text-xl">Protected group</h2><p className="text-sm text-muted-foreground">{new Date(group.createdAt).toLocaleString()} · {group.status}</p></div>{group.status !== "DELETED" && <button type="button" onClick={() => void deleteGroup(group.id)} className="flex items-center gap-2 rounded-full border-2 border-black bg-destructive px-4 py-2 font-bold"><Trash2 className="size-4" /> Delete group</button>}</div><div className="mt-3 space-y-2">{(names[group.id] ?? group.documents.map((document) => ({ documentId: document.id, status: document.status === "DELETED" ? "DELETED" as const : "READY" as const, metadata: null }))).map((file) => <div key={file.documentId} className="flex items-center gap-3 rounded-xl border-2 border-black bg-background p-3"><FileText className="size-5" /><span className="min-w-0 flex-1 truncate font-bold">{file.status === "DELETED" ? "File removed by owner" : file.metadata?.name ?? "Encrypted filename"}</span>{file.status !== "DELETED" && <button type="button" onClick={() => void deleteFile(group.id, file.documentId, file.metadata?.name ?? "this file")} className="rounded-full border-2 border-black bg-destructive p-2" aria-label="Delete file"><Trash2 className="size-4" /></button>}</div>)}</div></article>)}{!loading && !groups.length && <div className="rounded-2xl border-2 border-black bg-card p-8 text-center shadow-md">No protected uploads yet.</div>}</div>
    <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">{message}</p></div><KeyVaultDialog open={vaultOpen} onOpenChange={setVaultOpen} state={vault.state} onSetup={vault.setup} onUnlock={vault.unlock} /></section>;
}
