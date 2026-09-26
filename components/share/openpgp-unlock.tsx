"use client";

import { KeyRound, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { decryptOpenPgpGrant, readOpenPgpKeyPair, type OpenPgpGrant } from "@/lib/openpgp/document-grant";

function formatFingerprint(value: string) {
  return value.toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

export function OpenPgpUnlock({
  shareId,
  fingerprint,
  armoredMessage,
  onUnlocked,
}: {
  shareId: string;
  fingerprint?: string;
  armoredMessage?: string;
  onUnlocked: (result: { armoredPublicKey: string; fingerprint: string; grant: OpenPgpGrant | null }) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [fileName, setFileName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unlock = async () => {
    setBusy(true);
    setError("");
    try {
      const pair = await readOpenPgpKeyPair(privateKey, passphrase);
      const grant = armoredMessage && fingerprint
        ? await decryptOpenPgpGrant({
          armoredPrivateKey: privateKey,
          passphrase,
          armoredMessage,
          shareId,
          expectedFingerprint: fingerprint,
        })
        : null;
      setPrivateKey("");
      setPassphrase("");
      setFileName("");
      await onUnlocked({ armoredPublicKey: pair.armoredPublicKey, fingerprint: pair.fingerprint, grant });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This private key does not match the public key for this share.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 rounded-2xl border-2 border-black bg-card p-5 shadow-md">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full border-2 border-black bg-primary text-primary-foreground shadow-sm">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <h2 className="font-head text-2xl">Add private key</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Type the OpenPGP private key. This browser reads the matching public key from it, then shows the document. The private key stays on this device.</p>
      {fingerprint && <p className="mt-2 break-all font-mono text-xs">{formatFingerprint(fingerprint)}</p>}
      <input ref={fileRef} type="file" accept=".asc,.pgp,.txt,.key" aria-label="Upload OpenPGP private key" className="sr-only" onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setPrivateKey(await file.text());
        setFileName(file.name);
        setError("");
      }} />
      <button type="button" onClick={() => fileRef.current?.click()} className="mt-4 flex items-center gap-2 rounded-full border-2 border-black bg-primary px-5 py-3 font-head text-primary-foreground shadow-md">
        <Upload className="size-4" /> {fileName ? "Replace private key" : "Upload private key"}
      </button>
      {fileName && <p className="mt-2 text-sm font-bold">{fileName} is loaded. It has not been sent anywhere.</p>}
      <label className="mt-4 grid gap-1.5 font-bold">
        Private key
        <Textarea value={privateKey} onChange={(event) => { setPrivateKey(event.target.value); setFileName(""); }} spellCheck={false} aria-label="OpenPGP private key" placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----" className="min-h-36 rounded-xl border-2 border-black font-mono text-xs" />
      </label>
      <label className="mt-3 grid gap-1.5 font-bold">
        Key passphrase
        <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" aria-label="OpenPGP key passphrase" placeholder="Only if the private key asks for one" className="h-11 rounded-xl border-2 border-black bg-background px-3" />
      </label>
      <button type="button" disabled={busy || !privateKey.trim()} onClick={() => void unlock()} className="mt-4 rounded-full border-2 border-black bg-primary px-6 py-3 font-head text-primary-foreground shadow-md disabled:opacity-50">
        {busy ? "Checking the key…" : "Add private key"}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
