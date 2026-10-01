"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { AlertTriangle, FileText, KeyRound, LoaderCircle, LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BrowserFingerprintEngine } from "@/lib/fingerprint/worker-client";
import { unwrapCopyMaterial } from "@/lib/fingerprint/copy-secret";
import { parseIssuedProfile } from "@/lib/fingerprint/profile";
import { SecureViewer } from "@/components/share/secure-viewer";
import { InvitationClaim } from "@/components/share/invitation-claim";
import { OpenPgpUnlock } from "@/components/share/openpgp-unlock";
import { decryptGrantDownload, decryptGrantMetadata, type OpenPgpGrant } from "@/lib/openpgp/document-grant";
import { useKeyVault } from "@/hooks/use-key-vault";
import type { FileMetadata, ShareAccessResponse } from "@/lib/crypto/types";
import { decryptDownload, decryptMetadata } from "@/lib/crypto/worker-client";

type ManifestFile = { documentId: string; status: "READY" | "DELETED"; metadata: FileMetadata | null };
type Decrypted = { fingerprintId?: Uint8Array; fingerprintSecret?: Uint8Array; documentId: string; metadata: FileMetadata; file: ArrayBuffer };

export function SecureShareClient({ shareId }: { shareId: string }) {
  const { user } = useUser();
  const vault = useKeyVault(user?.id);
  const [access, setAccess] = useState<ShareAccessResponse | null>(null);
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [pendingInvitation, setPendingInvitation] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decrypted, setDecrypted] = useState<Decrypted | null>(null);
  const [grant, setGrant] = useState<OpenPgpGrant | null>(null);
  const [keyReady, setKeyReady] = useState(false);
  const [accessAttempt, setAccessAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shares/${shareId}/access`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (cancelled) return;
      if (body.error?.code === "SHARE_DELETED") return setDeleted(true);
      if (body.error?.code === "FORBIDDEN") return setForbidden(true);
      if (body.error?.code === "PENDING_INVITATION") return setPendingInvitation(true);
      if (!response.ok) throw new Error(body.error?.message ?? "Could not open this protected share.");
      setAccess(body);
    }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Share access failed."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shareId, accessAttempt]);

  const retryAccess = () => {
    setLoading(true);
    setError("");
    setAccessAttempt((attempt) => attempt + 1);
  };

  const unlockManifest = async () => {
    if (!access || (!grant && vault.state.status !== "READY")) return;
    setLoading(true); setError("");
    try {
      if (grant) setFiles(await decryptGrantMetadata(grant, access.documents));
      else if (vault.state.status === "READY") setFiles(await decryptMetadata(vault.state.privateKey, access.documents));
    }
    catch { setError("File names could not be decrypted with this device key."); }
    finally { setLoading(false); }
  };

  const openFile = async (file: ManifestFile, activeGrant: OpenPgpGrant | null = grant) => {
    if (!file.metadata || (!activeGrant && vault.state.status !== "READY")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/shares/${shareId}/documents/${file.documentId}/access`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "This file is unavailable.");
      if (activeGrant) {
        const downloaded = await fetch(body.downloadUrl, { cache: "no-store" });
        if (!downloaded.ok) throw new Error("Encrypted download failed.");
        const opened = await decryptGrantDownload(activeGrant, file.documentId, body.fileIv, await downloaded.arrayBuffer());
        const profile = body.fingerprint ? parseIssuedProfile(body.fingerprint.profileId) : null;
        if (body.fingerprint && !profile) throw new Error("This fingerprint profile is unavailable.");
        if (!opened.fingerprintId && body.fingerprint && vault.state.status === "READY") {
          const engine = new BrowserFingerprintEngine();
          try { await engine.initialize("encode"); } finally { await engine.dispose(); }
          const material = await unwrapCopyMaterial(file.documentId, body.fingerprint.recipientWrappedKey, vault.state.privateKey);
          opened.fingerprintId = material.identifier;
          if (profile?.denseProfile) opened.fingerprintSecret = material.secret;
          else material.secret.fill(0);
        }
        if (body.fingerprint && !opened.fingerprintId) throw new Error("The private key did not contain this copy's fingerprint.");
        if (profile?.denseProfile && !opened.fingerprintSecret) throw new Error("This copy's dense fingerprint could not be unwrapped.");
        if (profile?.denseProfile && opened.fingerprintSecret) {
          setDecrypted({ documentId: file.documentId, fingerprintId: opened.fingerprintId, fingerprintSecret: opened.fingerprintSecret, metadata: file.metadata, file: opened.file });
        } else {
          opened.fingerprintSecret?.fill(0);
          setDecrypted({ documentId: file.documentId, fingerprintId: opened.fingerprintId, metadata: file.metadata, file: opened.file });
        }
        void recordEvent("DECRYPT_SUCCEEDED");
        return;
      }
      if (vault.state.status !== "READY") return;
      let fingerprintId: Uint8Array | undefined;
      let fingerprintSecret: Uint8Array | undefined;
      if (body.fingerprint) {
        const profile = parseIssuedProfile(body.fingerprint.profileId);
        if (!profile) throw new Error("This fingerprint profile is unavailable.");
        const engine = new BrowserFingerprintEngine();
        try { await engine.initialize("encode"); } finally { await engine.dispose(); }
        const material = await unwrapCopyMaterial(file.documentId, body.fingerprint.recipientWrappedKey, vault.state.privateKey);
        fingerprintId = material.identifier;
        if (profile.denseProfile) fingerprintSecret = material.secret;
        else material.secret.fill(0);
        if (profile.denseProfile && !fingerprintSecret) throw new Error("This copy's dense fingerprint could not be unwrapped.");
      }
      const result = await decryptDownload(vault.state.privateKey, file.metadata, body);
      setDecrypted({ documentId: file.documentId, fingerprintId, fingerprintSecret, ...result });
      void recordEvent("DECRYPT_SUCCEEDED");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decryption failed. The file may be unavailable, damaged, or modified.");
      void recordEvent("DECRYPT_FAILED");
    } finally { setLoading(false); }
  };

  const recordEvent = (eventType: string) => fetch(`/api/shares/${shareId}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType }) });

  const acceptPrivateKey = async (result: { grant: OpenPgpGrant | null }) => {
    if (!access) return;
    setError("");
    if (result.grant) {
      setLoading(true);
      try {
        const manifest = await decryptGrantMetadata(result.grant, access.documents);
        setGrant(result.grant);
        setFiles(manifest);
        setKeyReady(true);
        const ready = manifest.filter((file) => file.status === "READY" && file.metadata);
        if (ready.length === 1) await openFile(ready[0], result.grant);
      } catch {
        setKeyReady(false);
        setGrant(null);
        setError("This private key matched, but the file could not be opened.");
      } finally { setLoading(false); }
      return;
    }
    setKeyReady(true);
    if (vault.state.status !== "READY") {
      setError("This share is not sealed to that OpenPGP key, so the document stays hidden.");
      return;
    }
    setLoading(true);
    try {
      const manifest = await decryptMetadata(vault.state.privateKey, access.documents);
      setFiles(manifest);
      const ready = manifest.filter((file) => file.status === "READY" && file.metadata);
      if (ready.length === 1) await openFile(ready[0]);
    } catch {
      setError("File names could not be decrypted with this device key.");
    } finally { setLoading(false); }
  };

  if (forbidden) return <ShareShell><AlertTriangle className="size-12 text-destructive" /><h1 className="font-head text-3xl">Wrong account</h1><p className="max-w-md text-center text-muted-foreground">This Clerk account is not authorized. No encrypted manifest, key, or storage URL was released.</p><SignOutButton redirectUrl={`/share/${shareId}`}><button className="flex items-center gap-2 rounded-full border-2 border-black bg-primary text-primary-foreground px-6 py-3 font-head shadow-md"><LogOut className="size-4" /> Switch account</button></SignOutButton></ShareShell>;
  if (pendingInvitation) return <InvitationClaim shareId={shareId} vault={vault} />;
  if (deleted) return <ShareShell><Trash2 className="size-12" /><h1 className="font-head text-3xl">Share deleted</h1><p className="max-w-md text-center text-muted-foreground">This protected share was deleted by its owner. Its encrypted files and cryptographic access material are no longer available.</p></ShareShell>;
  if (error && !access) return <ShareShell><AlertTriangle className="size-12 text-destructive" /><h1 className="font-head text-2xl">Share unavailable</h1><p className="max-w-md text-center text-destructive">{error}</p><button type="button" onClick={retryAccess} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-6 py-3 font-head shadow-md">Try again</button></ShareShell>;

  return <main className="min-h-svh bg-background px-4 py-8 sm:px-6"><div className="mx-auto max-w-5xl">
    <div className="rounded-2xl border-[3px] border-black bg-primary text-primary-foreground p-5 shadow-lg"><p className="text-xs font-bold tracking-[0.2em] uppercase">Authorized local access</p><h1 className="mt-1 font-head text-3xl sm:text-4xl">Protected file group</h1><p className="mt-2 text-sm">File names and contents are decrypted only inside this browser.</p></div>
    {error && <p role="alert" className="mt-4 rounded-xl border-2 border-black bg-card p-4 text-destructive">{error}</p>}
    {loading ? <div className="mt-5 flex min-h-56 items-center justify-center rounded-2xl border-2 border-black bg-card"><LoaderCircle className="size-8 animate-spin" /></div> : !keyReady ? <OpenPgpUnlock shareId={shareId} fingerprint={access?.openpgp?.fingerprint} armoredMessage={access?.openpgp?.armoredMessage} onUnlocked={(result) => void acceptPrivateKey(result)} /> : decrypted && access ? <><button type="button" onClick={() => { decrypted.fingerprintSecret?.fill(0); setDecrypted(null); }} className="mt-5 rounded-full border-2 border-black bg-card px-4 py-2 font-bold">Back to files</button><SecureViewer key={decrypted.documentId} documentId={decrypted.documentId} fingerprintId={decrypted.fingerprintId} fingerprintSecret={decrypted.fingerprintSecret} shareId={shareId} permission={access.permission} metadata={decrypted.metadata} bytes={decrypted.file} /></> : files.length ? <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-md"><h2 className="font-head text-2xl">Files</h2><div className="mt-3 space-y-2">{files.map((file) => file.status === "DELETED" ? <div key={file.documentId} className="rounded-xl border-2 border-black bg-muted p-4 font-bold text-muted-foreground">A file was removed by the owner.</div> : <button key={file.documentId} type="button" onClick={() => void openFile(file)} className="flex w-full items-center gap-3 rounded-xl border-2 border-black bg-background p-4 text-left shadow-sm"><FileText className="size-5" /><span className="min-w-0"><span className="block truncate font-head">{file.metadata?.name}</span><span className="text-xs text-muted-foreground">{file.metadata ? `${(file.metadata.size / 1024).toFixed(1)} KB` : "Protected file"}</span></span></button>)}</div></section> : <div className="mt-5 flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-black bg-card p-6 text-center shadow-md"><KeyRound className="size-10" /><h2 className="font-head text-2xl">Private key accepted</h2><p className="max-w-lg text-sm text-muted-foreground">The document opens from the OpenPGP private key. If it is still hidden, this share was not sealed to that key.</p>{vault.state.status === "READY" && <button type="button" onClick={() => void unlockManifest()} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-6 py-3 font-head shadow-md">Decrypt file list locally</button>}</div>}
  </div></main>;
}

function ShareShell({ children }: { children: React.ReactNode }) { return <main className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-5">{children}</main>; }
