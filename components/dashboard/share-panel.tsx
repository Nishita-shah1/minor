"use client";

import { useWorkspaceActive } from "./workspace-activity";
import { LoaderCircle, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreatedShare, ShareLinksDialog } from "@/components/dashboard/share-links-dialog";
import { CameraEventHistory } from "@/components/dashboard/camera-event-history";
import { Input } from "@/components/ui/input";
import { MAX_RECIPIENTS } from "@/lib/crypto/constants";
import type { PreparedRecipient } from "@/lib/crypto/types";
import { rewrapForRecipients } from "@/lib/crypto/worker-client";
import { SenderKeyPicker } from "@/components/crypto/sender-key-picker";
import { buildOpenPgpGrant, encryptOpenPgpGrant } from "@/lib/openpgp/document-grant";
import { readImportedPublicKey } from "@/lib/openpgp/read-public-key";
import type { SenderPublicKey } from "@/lib/openpgp/known-senders";
import { prepareInvitation, recoverInvitationSecret } from "@/lib/shares/invitation-crypto";
import { parseEmailText, parseRecipientFile } from "@/lib/recipients/parse";
import { validateShareSchedule } from "@/lib/shares/schedule";

type OwnerAccess = { fingerprintOwnerPublicKey?: JsonWebKey; existingFingerprints?: Array<{documentId: string; ownerWrappedKey: string; shareId?: string}>; files: Array<{ documentId: string; status: string; wrappedFileKey: string | null }> };
type RecipientKey = { armoredPublicKey: string; fingerprint: string; senderName?: string };

export function SharePanel({ groupId, privateKey }: { groupId: string; privateKey?: CryptoKey }) {
  const active = useWorkspaceActive();
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [savedSchedule, setSavedSchedule] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);
  const keyTarget = useRef<string | null>(null);
  const [recipientKeys, setRecipientKeys] = useState<Record<string, RecipientKey>>({});
  const [entry, setEntry] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [cameraSettings, setCameraSettings] = useState<Record<string, boolean>>({});
  const [permission, setPermission] = useState<"VIEW_ONLY" | "VIEW_AND_DOWNLOAD">("VIEW_ONLY");
  const [useOpening, setUseOpening] = useState(false);
  const [useExpiry, setUseExpiry] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [shares, setShares] = useState<CreatedShare[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openPgpEmails, setOpenPgpEmails] = useState<string[]>([]);
  const [openPgpKnown, setOpenPgpKnown] = useState(false);
  const [savedKey, setSavedKey] = useState<RecipientKey | null>(null);
  const [senderTarget, setSenderTarget] = useState<string | null>(null);
  const [senderFocus, setSenderFocus] = useState(0);

  const applyLinks = (body: { shares: CreatedShare[]; batchId: string | null; permission?: "VIEW_ONLY" | "VIEW_AND_DOWNLOAD"; availableFrom?: string | null; expiresAt?: string | null }) => {
    setShares(body.shares); setBatchId(body.batchId);
    if (body.permission) setPermission(body.permission);
    setSavedSchedule([body.availableFrom ? `Opens ${new Date(body.availableFrom).toLocaleString()}` : "", body.expiresAt ? `Expires ${new Date(body.expiresAt).toLocaleString()}` : ""].filter(Boolean).join(" · "));
  };
  useEffect(() => {
    if (!privateKey) return;
    const missing = shares.filter(share => share.status === "AWAITING_RECIPIENT_KEY" && share.ownerWrappedInviteSecret && !share.shareUrl);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(missing.map(async share => ({ id: share.shareId,
      url: `${share.shareBaseUrl}#invite=${await recoverInvitationSecret(share.ownerWrappedInviteSecret!, privateKey)}` })))
      .then(links => { if (!cancelled) setShares(current => current.map(share => ({...share, shareUrl: links.find(link => link.id === share.shareId)?.url ?? share.shareUrl}))); })
      .catch(() => { if (!cancelled) setMessage("Could not restore an invitation link with this owner key."); });
    return () => { cancelled = true; };
  }, [privateKey, shares]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/openpgp-keys", { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const body = await response.json() as { key?: RecipientKey | null };
      if (!cancelled && body.key?.armoredPublicKey && body.key.fingerprint) setSavedKey(body.key);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/upload-groups/${groupId}/shares`, { cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load existing links.");
      if (!cancelled) applyLinks(body);
    }).catch(error => { if (!cancelled) setMessage(error.message); })
      .finally(() => { if (!cancelled) setLoadingLinks(false); });
    return () => { cancelled = true; };
  }, [groupId, active]);
  const reopenLinks = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/upload-groups/${groupId}/shares`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load links.");
      applyLinks(body); setDialogOpen(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load links."); }
    finally { setBusy(false); }
  };

  const schedule = useMemo(() => {
    const parts = [];
    if (useOpening && availableFrom) parts.push(`Opens ${new Date(availableFrom).toLocaleString(undefined, { timeZoneName: "short" })}`);
    if (useExpiry && expiresAt) parts.push(`Expires ${new Date(expiresAt).toLocaleString(undefined, { timeZoneName: "short" })}`);
    return parts.join(" · ");
  }, [availableFrom, expiresAt, useExpiry, useOpening]);

  const addEmails = (incoming: string[]) => {
    const existing = new Set(shares.map(share => share.recipientEmail));
    setEmails(current => [...new Set([...current, ...incoming])].filter(email => !existing.has(email)).slice(0, Math.max(0, MAX_RECIPIENTS - shares.length)));
  };

  const prepare = async (recipients: string[]): Promise<PreparedRecipient[]> => {
    const response = await fetch(`/api/upload-groups/${groupId}/shares/prepare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientEmails: recipients }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Could not prepare recipients.");
    return body.recipients;
  };

  const deliver = async (list: CreatedShare[], resend = false) => {
    const output = list.map(share => ({ ...share }));
    let failed = 0, attempted = 0, inProgress = 0;
    let cursor = 0;
    const sendNext = async () => {
      while (cursor < output.length) {
        const share = output[cursor++];
        if (!share.shareUrl || (share.emailStatus === "ACCEPTED" && !resend)) continue;
        if (share.emailStatus === "SENDING" && !resend) { inProgress++; continue; }
        attempted++;
        try {
          const attemptId = resend && share.emailStatus !== "SENDING" ? crypto.randomUUID() : share.emailAttemptId ?? crypto.randomUUID();
          share.emailAttemptId = attemptId;
          const response = await fetch(`/api/shares/${share.shareId}/email`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId, ...(share.status === "AWAITING_RECIPIENT_KEY" ? { invitationUrl: share.shareUrl } : {}), resend }) });
          const body = await response.json();
          if (!response.ok && body.error?.code !== "EMAIL_BUSY") throw new Error(body.error?.message ?? "Email request failed.");
          if (response.ok) share.emailStatus = "ACCEPTED";
          else { share.emailStatus = "SENDING"; inProgress++; }
        } catch { failed++; share.emailStatus = "FAILED"; }
        setShares(current => current.map(item => item.shareId === share.shareId ? { ...item, emailStatus: share.emailStatus, emailAttemptId: share.emailAttemptId } : item));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, output.length) }, sendNext));
    setMessage(failed ? `Could not confirm Brevo acceptance for ${failed} invitation${failed === 1 ? "" : "s"}. Retry only those recipients.` :
      inProgress ? `${inProgress} email attempt${inProgress === 1 ? " is" : "s are"} still processing. Retry shortly if needed.` :
      attempted ? "Brevo accepted the invitations. Delivery is not yet confirmed." : "No invitations needed sending.");
  };

  const sealShare = async (shareId: string, key: RecipientKey, documents: Array<{ documentId: string; ownerWrappedKey: string }>, fingerprints: Array<{ documentId: string; ownerWrappedKey: string }>) => {
    if (!privateKey) throw new Error("Unlock your keys before using a public key.");
    const grant = await buildOpenPgpGrant({ shareId, privateKey, documents, fingerprints });
    const armoredMessage = await encryptOpenPgpGrant(key.armoredPublicKey, grant);
    const saved = await fetch(`/api/shares/${shareId}/openpgp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ armoredPublicKey: key.armoredPublicKey, armoredMessage }) });
    if (!saved.ok) throw new Error((await saved.json()).error?.message ?? "Could not save the encrypted public-key grant.");
  };

  const create = async (accountKey: RecipientKey | null = null) => {
    if (!privateKey) return setMessage("Unlock your keys to add recipients. Existing links can still be copied or emailed.");
    const start = useOpening ? new Date(availableFrom) : null;
    const end = useExpiry ? new Date(expiresAt) : null;
    if ((useOpening && !availableFrom) || (useExpiry && !expiresAt)) return setMessage("Choose a time for each enabled access rule.");
    const scheduleError = validateShareSchedule({ availableFrom: start, expiresAt: end });
    if (!batchId && scheduleError) return setMessage(scheduleError);
    setBusy(true); setMessage("Preparing secure access and invitations…");
    try {
      const prepared = emails.length ? await prepare(emails) : [];
      const ownerResponse = await fetch(`/api/upload-groups/${groupId}/owner-access`, { cache: "no-store" });
      const owner = await ownerResponse.json() as OwnerAccess & { error?: { message?: string } };
      if (!ownerResponse.ok) throw new Error(owner.error?.message ?? "Owner keys unavailable.");
      const documents = owner.files.filter((file) => file.status === "READY" && file.wrappedFileKey).map((file) => ({ documentId: file.documentId, ownerWrappedKey: file.wrappedFileKey! }));
      if (!owner.fingerprintOwnerPublicKey) throw new Error("Owner encryption key is unavailable.");
      const wrapped = await rewrapForRecipients({ privateKey, documents, recipients: prepared, fingerprintOwnerPublicKey: owner.fingerprintOwnerPublicKey, existingFingerprints: owner.existingFingerprints }, (count) => setMessage(`Preparing secure links… ${count} / ${prepared.filter((recipient) => recipient.status === "READY").length} recipients`));
      const recipients = [...wrapped, ...prepared.filter((recipient) => recipient.status === "NOT_ENROLLED").map((recipient) => ({ status: "NOT_ENROLLED" as const, email: recipient.email }))]
        .map(recipient => ({ ...recipient, cameraRequired: cameraSettings[recipient.email] ?? false }));
      const response = await fetch(`/api/upload-groups/${groupId}/shares`, { method: recipients.length ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(recipients.length ? {body: JSON.stringify({
        recipients, permission: "VIEW_ONLY",
        availableFrom: start?.toISOString() ?? null,
        expiresAt: end?.toISOString() ?? null,
      })} : {}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not create links.");
      const created = body.shares as CreatedShare[];
      const existingIds = new Set(shares.map(share => share.shareId));
      const issuedIds = new Set<string>();
      const used = [...(owner.existingFingerprints ?? [])];
      const fingerprintsByEmail = new Map(wrapped.map((recipient) => [recipient.email, recipient.envelopes.flatMap((envelope) => envelope.fingerprint ? [{ documentId: envelope.documentId, ownerWrappedKey: envelope.fingerprint.ownerWrappedKey }] : [])]));
      for (const share of created.filter(item => item.status === "AWAITING_RECIPIENT_KEY")) {
        if (share.ownerWrappedInviteSecret) {
          share.shareUrl = `${share.shareBaseUrl}#invite=${await recoverInvitationSecret(share.ownerWrappedInviteSecret, privateKey)}`;
          continue;
        }
        const invitation = await prepareInvitation({ shareId: share.shareId, documents,
          existingFingerprints: used, ownerPrivateKey: privateKey, ownerPublicKeyJwk: owner.fingerprintOwnerPublicKey });
        const issued = await fetch(`/api/shares/${share.shareId}/invitation`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ciphertext: invitation.ciphertext, iv: invitation.iv, proof: invitation.proof,
            ownerWrappedSecret: invitation.ownerWrappedSecret, fingerprints: invitation.fingerprints }) });
        if (!issued.ok) throw new Error((await issued.json()).error?.message ?? "Could not save an invitation grant.");
        used.push(...invitation.fingerprints.map(({documentId, ownerWrappedKey}) => ({documentId, ownerWrappedKey})));
        fingerprintsByEmail.set(share.recipientEmail, invitation.fingerprints.map(({ documentId, ownerWrappedKey }) => ({ documentId, ownerWrappedKey })));
        share.ownerWrappedInviteSecret = invitation.ownerWrappedSecret;
        share.shareUrl = `${share.shareBaseUrl}#invite=${invitation.inviteSecret}`;
        share.emailStatus = "NOT_REQUESTED";
        share.emailAttemptId = null;
        issuedIds.add(share.shareId);
      }
      applyLinks({ ...body, shares: created }); setEmails([]); setCameraSettings({}); setDialogOpen(true);
      for (const share of created) {
        const key = recipientKeys[share.recipientEmail] ?? accountKey;
        if (!key) continue;
        await sealShare(share.shareId, key, documents, fingerprintsByEmail.get(share.recipientEmail) ?? []);
      }
      const protectedEmails = created.map(share => share.recipientEmail).filter(email => recipientKeys[email] || accountKey);
      setOpenPgpEmails(protectedEmails.map(email => email.toLowerCase()));
      setOpenPgpKnown(protectedEmails.length > 0);
      await deliver(created.filter(share => !existingIds.has(share.shareId) || issuedIds.has(share.shareId) ||
        (!emails.length && share.status === "AWAITING_RECIPIENT_KEY" && share.emailStatus !== "ACCEPTED")));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Share creation failed."); }
    finally { setBusy(false); }
  };

  const sendEmail = async (list = shares, resend = false) => { setBusy(true); try { await deliver(list, resend); } finally { setBusy(false); } };

  const lockExistingWithSavedKey = async () => {
    if (!savedKey) return setMessage("Save an OpenPGP public key on Profile first.");
    if (!privateKey) return setMessage("Unlock your keys before using the saved public key.");
    setBusy(true);
    try {
      const ownerResponse = await fetch(`/api/upload-groups/${groupId}/owner-access`, { cache: "no-store" });
      const owner = await ownerResponse.json() as OwnerAccess & { error?: { message?: string } };
      if (!ownerResponse.ok) throw new Error(owner.error?.message ?? "Owner keys unavailable.");
      const docs = owner.files.filter((item) => item.status === "READY" && item.wrappedFileKey).map((item) => ({ documentId: item.documentId, ownerWrappedKey: item.wrappedFileKey! }));
      for (const share of shares) {
        const fingerprints = (owner.existingFingerprints ?? []).filter((item) => item.shareId === share.shareId).map(({ documentId, ownerWrappedKey }) => ({ documentId, ownerWrappedKey }));
        await sealShare(share.shareId, savedKey, docs, fingerprints);
      }
      setOpenPgpEmails(shares.map((share) => share.recipientEmail.toLowerCase()));
      setOpenPgpKnown(true);
      setMessage("Saved public key applied. Open the link and upload the matching private key. The file stays locked until the keys match.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not use the saved public key."); }
    finally { setBusy(false); }
  };

  const useSavedPublicKey = async (email: string) => {
    if (!savedKey) return setMessage("Save an OpenPGP public key on Profile first.");
    if (!privateKey) return setMessage("Unlock your keys before using the saved public key.");
    const share = shares.find((item) => item.recipientEmail === email);
    if (!share) return;
    setBusy(true);
    try {
      const ownerResponse = await fetch(`/api/upload-groups/${groupId}/owner-access`, { cache: "no-store" });
      const owner = await ownerResponse.json() as OwnerAccess & { error?: { message?: string } };
      if (!ownerResponse.ok) throw new Error(owner.error?.message ?? "Owner keys unavailable.");
      const docs = owner.files.filter((item) => item.status === "READY" && item.wrappedFileKey).map((item) => ({ documentId: item.documentId, ownerWrappedKey: item.wrappedFileKey! }));
      const fingerprints = (owner.existingFingerprints ?? []).filter((item) => item.shareId === share.shareId).map(({ documentId, ownerWrappedKey }) => ({ documentId, ownerWrappedKey }));
      await sealShare(share.shareId, savedKey, docs, fingerprints);
      setOpenPgpEmails((current) => [...new Set([...current, email.toLowerCase()])]);
      setOpenPgpKnown(true);
      setMessage("Saved public key applied. The share page opens the file only after the matching private key is uploaded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not use the saved public key."); }
    finally { setBusy(false); }
  };

  const focusSenderSearch = (email: string) => {
    keyTarget.current = email;
    setSenderTarget(email);
    setSenderFocus((value) => value + 1);
  };
  const applyRecipientKey = async (email: string, parsed: RecipientKey) => {
    setRecipientKeys((current) => ({ ...current, [email]: parsed }));
    const share = shares.find((item) => item.recipientEmail === email);
    const label = parsed.senderName ? `${parsed.senderName}'s public key` : "Public key";
    if (!share) { setMessage(`${label} added for ${email}. It will be used when you send.`); return; }
    const ownerResponse = await fetch(`/api/upload-groups/${groupId}/owner-access`, { cache: "no-store" });
    const owner = await ownerResponse.json() as OwnerAccess & { error?: { message?: string } };
    if (!ownerResponse.ok) throw new Error(owner.error?.message ?? "Owner keys unavailable.");
    const docs = owner.files.filter((item) => item.status === "READY" && item.wrappedFileKey).map((item) => ({ documentId: item.documentId, ownerWrappedKey: item.wrappedFileKey! }));
    const fingerprints = (owner.existingFingerprints ?? []).filter((item) => item.shareId === share.shareId).map(({ documentId, ownerWrappedKey }) => ({ documentId, ownerWrappedKey }));
    await sealShare(share.shareId, parsed, docs, fingerprints);
    setOpenPgpEmails((current) => [...new Set([...current, email.toLowerCase()])]);
    setOpenPgpKnown(true);
    setMessage(`${label} saved. After they sign in with that email, the share page asks for their private key.`);
  };
  const onSenderKey = async (sender: SenderPublicKey) => {
    const email = keyTarget.current;
    if (!email) return setMessage(`Selected ${sender.name}. Choose Add public key on a recipient first.`);
    if (!privateKey) return setMessage("Unlock your keys before adding a public key.");
    setBusy(true);
    try {
      const parsed = await readImportedPublicKey(sender.armoredPublicKey);
      await applyRecipientKey(email, { ...parsed, senderName: sender.name });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not use that public key."); }
    finally { setBusy(false); }
  };
  const onPublicKey = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const email = keyTarget.current;
    event.target.value = "";
    if (!file || !email) return;
    if (!privateKey) return setMessage("Unlock your keys before uploading a public key.");
    setBusy(true);
    try {
      const parsed = await readImportedPublicKey(await file.text());
      await applyRecipientKey(email, parsed);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not use that public key."); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-md sm:p-5">
      <h2 className="font-head text-xl">2. Share securely</h2>
      <p className="mt-1 text-sm text-muted-foreground">Add up to 100 emails manually or from CSV, TXT, or XLSX. Sending uses your saved OpenPGP public key. The recipient must upload the matching private key before the file opens.</p>
      {loadingLinks && <p role="status">Loading existing secure links…</p>}
      {savedKey && <div className="mt-4 rounded-xl border-2 border-black bg-background p-3"><p className="font-bold">Public key for this link</p><p className="mt-1 text-sm">Your saved OpenPGP public key encrypts the invitation. The file stays locked until the recipient uploads the private key with this fingerprint.</p><p className="mt-2 break-all font-mono text-xs">{savedKey.fingerprint.toUpperCase().replace(/(.{4})/g, "$1 ").trim()}</p></div>}
      {batchId && <div className="mt-4 rounded-xl border-2 border-black bg-background p-3"><p className="font-bold">{shares.length} existing recipient{shares.length === 1 ? "" : "s"}</p><div className="my-3 space-y-2">{shares.map(share => <div key={share.shareId} className="rounded-xl border-2 border-black bg-card p-3"><p className="font-bold">{share.recipientEmail}</p><p className="text-xs text-muted-foreground">{share.cameraRequired ? "High-Security Camera View required" : "Webcam off"} · This setting is fixed for this link.</p><button type="button" onClick={() => focusSenderSearch(share.recipientEmail)} className="mt-1 rounded-full text-xs font-bold underline">{openPgpEmails.includes(share.recipientEmail.toLowerCase()) ? "Key added" : "Add public key"}</button>{share.cameraRequired && <CameraEventHistory shareId={share.shareId} active={active} />}</div>)}</div><button type="button" disabled={busy} onClick={() => void reopenLinks()} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-5 py-2.5 font-bold shadow-sm">View secure links</button>{savedKey && <button type="button" disabled={busy || !privateKey} onClick={() => void lockExistingWithSavedKey()} className="ml-2 rounded-full border-2 border-black bg-primary text-primary-foreground px-5 py-2.5 font-bold shadow-sm disabled:opacity-40">Use saved public key</button>}<p className="mt-2 text-sm">Add recipients below. Existing permission and access times are preserved.</p>{shares.some(share => share.status === "AWAITING_RECIPIENT_KEY") && <button type="button" disabled={busy || !privateKey} onClick={() => void create(savedKey)} className="mt-3 rounded-full border-2 border-black bg-primary text-primary-foreground px-5 py-2 font-bold disabled:opacity-40">Finish and send waiting invitations</button>}</div>}
      {!privateKey && <p className="mt-3 text-sm">Unlock your keys to add recipients. You can view and share existing links now.</p>}
      <input ref={keyFileRef} type="file" accept=".asc,.pgp,.txt,.key" aria-label="Upload OpenPGP public key" className="sr-only" onChange={(event) => void onPublicKey(event)} />
      <SenderKeyPicker disabled={busy} focusSignal={senderFocus} targetLabel={senderTarget} onSelect={(sender) => void onSenderKey(sender)} />
      <button type="button" disabled={busy || !senderTarget} onClick={() => keyFileRef.current?.click()} className="mt-2 rounded-full border-2 border-black bg-background px-4 py-2 text-sm font-bold shadow-sm disabled:opacity-50">Upload key file</button>
      <fieldset disabled={busy || loadingLinks || !privateKey}>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="recipient@example.com" className="h-11 min-w-56 flex-1 rounded-xl border-2 border-black" />
        <button type="button" onClick={() => { addEmails(parseEmailText(entry)); setEntry(""); }} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-5 font-bold shadow-sm">Add</button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-full border-2 border-black bg-background px-4 font-bold shadow-sm"><Upload className="size-4" /> Import</button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; try { if (file) addEmails(await parseRecipientFile(file)); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read the list."); } event.target.value = ""; }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{emails.map((email) => <span key={email} className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-black bg-muted px-3 py-2 text-xs font-bold"><span>{email}</span><button type="button" onClick={() => focusSenderSearch(email)} className="rounded-full underline">{recipientKeys[email]?.senderName ?? (recipientKeys[email] ? "Key added" : "Add public key")}</button><label className="flex items-center gap-1.5 rounded-full border-2 border-black bg-background px-2 py-1"><input type="checkbox" checked={cameraSettings[email] ?? false} onChange={event => setCameraSettings(current => ({ ...current, [email]: event.target.checked }))} /> Require webcam checks</label><button type="button" aria-label={`Remove ${email}`} onClick={() => { setEmails((list) => list.filter((item) => item !== email)); setRecipientKeys((current) => { const next = { ...current }; delete next[email]; return next; }); setCameraSettings(current => { const next = { ...current }; delete next[email]; return next; }); }} className="rounded-full border-2 border-black p-1"><Trash2 className="size-3.5" /></button></span>)}</div>
      {emails.some(email => cameraSettings[email]) && <p className="mt-2 text-xs text-muted-foreground">Required links ask the recipient for camera permission before opening files. Face checks run locally; only browser-reported events are shown to you.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border-2 border-black bg-background px-4 py-2 text-sm font-bold">{permission === "VIEW_ONLY" ? "View only" : "Existing link permissions retained"}</span>
        <button type="button" disabled={busy || !emails.length} onClick={() => void create(savedKey)} className="rounded-full border-2 border-black bg-primary text-primary-foreground px-5 py-2.5 font-head shadow-sm disabled:opacity-50">{savedKey ? "Send with saved public key" : "Send"}</button>
      </div>
      {!batchId && <details className="mt-4 rounded-xl border-2 border-black bg-background p-3">
        <summary className="cursor-pointer rounded-full font-bold">Access timing (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl border-2 border-black p-3 text-sm font-bold"><input type="checkbox" checked={useOpening} onChange={(event) => setUseOpening(event.target.checked)} className="mr-2" /> Opens at<Input type="datetime-local" disabled={!useOpening} value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} className="mt-2 rounded-xl border-2 border-black" /></label>
          <label className="rounded-xl border-2 border-black p-3 text-sm font-bold"><input type="checkbox" checked={useExpiry} onChange={(event) => setUseExpiry(event.target.checked)} className="mr-2" /> Expires at<Input type="datetime-local" disabled={!useExpiry} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-2 rounded-xl border-2 border-black" /></label>
        </div>
        {schedule && <p className="mt-3 text-sm font-bold">{schedule}</p>}
      </details>}
      </fieldset>
      <p className="mt-3 flex min-h-5 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">{busy && <LoaderCircle className="size-4 animate-spin" />}{message}</p>
      <ShareLinksDialog open={dialogOpen} onOpenChange={setDialogOpen} shares={shares} busy={busy} message={message} schedule={batchId ? savedSchedule : schedule} openPgpEmails={openPgpEmails} openPgpKnown={openPgpKnown} onSendEmail={() => void sendEmail()} onResend={id => { const share = shares.find(item => item.shareId === id); if (share) void sendEmail([share], true); }} />
    </section>
  );
}
