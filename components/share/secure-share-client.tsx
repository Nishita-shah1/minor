"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { AlertTriangle, FileText, KeyRound, LoaderCircle, LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { KeyVaultDialog } from "@/components/crypto/key-vault-dialog";
import { SecureViewer } from "@/components/share/secure-viewer";
import { useKeyVault } from "@/hooks/use-key-vault";
import type { FileMetadata, ShareAccessResponse } from "@/lib/crypto/types";
import { decryptDownload, decryptMetadata } from "@/lib/crypto/worker-client";

type ManifestFile = { documentId: string; status: "READY" | "DELETED"; metadata: FileMetadata | null };
type Decrypted = { documentId: string; metadata: FileMetadata; file: ArrayBuffer };

export function SecureShareClient({ shareId }: { shareId: string }) {
  const { user } = useUser();
  const vault = useKeyVault(user?.id);
  const [access, setAccess] = useState<ShareAccessResponse | null>(null);
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decrypted, setDecrypted] = useState<Decrypted | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shares/${shareId}/access`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (cancelled) return;
      if (body.error?.code === "SHARE_DELETED") return setDeleted(true);
      if (body.error?.code === "FORBIDDEN") return setForbidden(true);
      if (!response.ok) throw new Error(body.error?.message ?? "Could not open this protected share.");
      setAccess(body);
    }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Share access failed."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shareId]);

  const unlockManifest = async () => {
    if (!access || vault.state.status !== "READY") return;
    setLoading(true); setError("");
    try { setFiles(await decryptMetadata(vault.state.privateKey, access.documents)); }
    catch { setError("File names could not be decrypted with this device key."); }
    finally { setLoading(false); }
  };

  const openFile = async (file: ManifestFile) => {
    if (!file.metadata || vault.state.status !== "READY") return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/shares/${shareId}/documents/${file.documentId}/access`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "This file is unavailable.");
      const result = await decryptDownload(vault.state.privateKey, file.metadata, body);
      setDecrypted({ documentId: file.documentId, ...result });
      void recordEvent("DECRYPT_SUCCEEDED");
    } catch {
      setError("Decryption failed. The file may be unavailable, damaged, or modified.");
      void recordEvent("DECRYPT_FAILED");
    } finally { setLoading(false); }
  };

  const recordEvent = (eventType: string) => fetch(`/api/shares/${shareId}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType }) });

  if (forbidden) return <ShareShell><AlertTriangle className="size-12 text-destructive" /><h1 className="font-head text-3xl">Wrong account</h1><p className="max-w-md text-center text-muted-foreground">This Clerk account is not authorized. No encrypted manifest, key, or storage URL was released.</p><SignOutButton redirectUrl={`/share/${shareId}`}><button className="flex items-center gap-2 rounded-full border-2 border-black bg-primary px-6 py-3 font-head shadow-md"><LogOut className="size-4" /> Switch account</button></SignOutButton></ShareShell>;
  if (deleted) return <ShareShell><Trash2 className="size-12" /><h1 className="font-head text-3xl">Share deleted</h1><p className="max-w-md text-center text-muted-foreground">This protected share was deleted by its owner. Its encrypted files and cryptographic access material are no longer available.</p></ShareShell>;
  if (error && !access) return <ShareShell><AlertTriangle className="size-12 text-destructive" /><h1 className="font-head text-2xl">Share unavailable</h1><p className="max-w-md text-center text-destructive">{error}</p></ShareShell>;

  return <main className="min-h-svh bg-background px-4 py-8 sm:px-6"><div className="mx-auto max-w-5xl">
    <div className="rounded-2xl border-[3px] border-black bg-primary p-5 shadow-lg"><p className="text-xs font-bold tracking-[0.2em] uppercase">Authorized local access</p><h1 className="mt-1 font-head text-3xl sm:text-4xl">Protected file group</h1><p className="mt-2 text-sm">File names and contents are decrypted only inside this browser.</p></div>
    {loading ? <div className="mt-5 flex min-h-56 items-center justify-center rounded-2xl border-2 border-black bg-card"><LoaderCircle className="size-8 animate-spin" /></div> : decrypted && access ? <><button type="button" onClick={() => setDecrypted(null)} className="mt-5 rounded-full border-2 border-black bg-card px-4 py-2 font-bold">Back to files</button><SecureViewer shareId={shareId} permission={access.permission} metadata={decrypted.metadata} bytes={decrypted.file} /></> : files.length ? <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-md"><h2 className="font-head text-2xl">Files</h2><div className="mt-3 space-y-2">{files.map((file) => file.status === "DELETED" ? <div key={file.documentId} className="rounded-xl border-2 border-black bg-muted p-4 font-bold text-muted-foreground">A file was removed by the owner.</div> : <button key={file.documentId} type="button" onClick={() => void openFile(file)} className="flex w-full items-center gap-3 rounded-xl border-2 border-black bg-background p-4 text-left shadow-sm"><FileText className="size-5" /><span className="min-w-0"><span className="block truncate font-head">{file.metadata?.name}</span><span className="text-xs text-muted-foreground">{file.metadata ? `${(file.metadata.size / 1024).toFixed(1)} KB` : "Protected file"}</span></span></button>)}</div></section> : <div className="mt-5 flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-black bg-card p-6 text-center shadow-md"><KeyRound className="size-10" /><h2 className="font-head text-2xl">Unlock file names</h2><p className="max-w-lg text-sm text-muted-foreground">Only tiny encrypted metadata is decrypted now. File contents load when selected.</p>{vault.state.status === "READY" ? <button type="button" onClick={() => void unlockManifest()} className="rounded-full border-2 border-black bg-primary px-6 py-3 font-head shadow-md">Decrypt file list locally</button> : <button type="button" disabled={vault.state.status === "CHECKING"} onClick={() => setVaultOpen(true)} className="rounded-full border-2 border-black bg-primary px-6 py-3 font-head shadow-md disabled:opacity-50">{vault.state.status === "NEEDS_SETUP" ? "Create encryption key" : "Unlock EchoLeaks vault"}</button>}{error && <p className="font-bold text-destructive">{error}</p>}</div>}
  </div><KeyVaultDialog open={vaultOpen} onOpenChange={setVaultOpen} state={vault.state} onSetup={vault.setup} onUnlock={vault.unlock} /></main>;
}

function ShareShell({ children }: { children: React.ReactNode }) { return <main className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-5">{children}</main>; }
