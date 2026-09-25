"use client";

import { LoaderCircle, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreatedShare, ShareLinksDialog } from "@/components/dashboard/share-links-dialog";
import { Input } from "@/components/ui/input";
import { MAX_RECIPIENTS } from "@/lib/crypto/constants";
import type { PreparedRecipient } from "@/lib/crypto/types";
import { rewrapForRecipients } from "@/lib/crypto/worker-client";
import { prepareInvitation, recoverInvitationSecret } from "@/lib/shares/invitation-crypto";
import { parseEmailText, parseRecipientFile } from "@/lib/recipients/parse";
import { validateShareSchedule } from "@/lib/shares/schedule";

type OwnerAccess = { fingerprintOwnerPublicKey?: JsonWebKey; existingFingerprints?: Array<{documentId: string; ownerWrappedKey: string}>; files: Array<{ documentId: string; status: string; wrappedFileKey: string | null }> };

export function SharePanel({ groupId, privateKey }: { groupId: string; privateKey?: CryptoKey }) {
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [savedSchedule, setSavedSchedule] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [entry, setEntry] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
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
    let cancelled = false;
    fetch(`/api/upload-groups/${groupId}/shares`, { cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load existing links.");
      if (!cancelled) applyLinks(body);
    }).catch(error => { if (!cancelled) setMessage(error.message); })
      .finally(() => { if (!cancelled) setLoadingLinks(false); });
    return () => { cancelled = true; };
  }, [groupId]);
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

  const create = async () => {
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
      const recipients = [...wrapped, ...prepared.filter((recipient) => recipient.status === "NOT_ENROLLED").map((recipient) => ({ status: "NOT_ENROLLED" as const, email: recipient.email }))];
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
        share.ownerWrappedInviteSecret = invitation.ownerWrappedSecret;
        share.shareUrl = `${share.shareBaseUrl}#invite=${invitation.inviteSecret}`;
        share.emailStatus = "NOT_REQUESTED";
        share.emailAttemptId = null;
        issuedIds.add(share.shareId);
      }
      applyLinks({...body, shares: created}); setEmails([]); setDialogOpen(true);
      await deliver(created.filter(share => !existingIds.has(share.shareId) || issuedIds.has(share.shareId) ||
        (!emails.length && share.status === "AWAITING_RECIPIENT_KEY" && share.emailStatus !== "ACCEPTED")));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Share creation failed."); }
    finally { setBusy(false); }
  };

  const sendEmail = async (list = shares, resend = false) => { setBusy(true); try { await deliver(list, resend); } finally { setBusy(false); } };

  return (
    <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-md sm:p-5">
      <h2 className="font-head text-xl">2. Share securely</h2>
      <p className="mt-1 text-sm text-muted-foreground">Add up to 100 emails manually or from CSV, TXT, or XLSX.</p>
      {loadingLinks && <p role="status">Loading existing secure links…</p>}
      {batchId && <div className="mt-4 rounded-xl border-2 border-black bg-background p-3"><p className="font-bold">{shares.length} existing recipient{shares.length === 1 ? "" : "s"}</p><p className="my-2 text-sm">{shares.map(share => share.recipientEmail).join(", ")}</p><button type="button" disabled={busy} onClick={() => void reopenLinks()} className="rounded-full border-2 border-black bg-primary px-5 py-2.5 font-bold shadow-sm">View secure links</button><p className="mt-2 text-sm">Add recipients below. Existing permission and access times are preserved.</p>{shares.some(share => share.status === "AWAITING_RECIPIENT_KEY") && <button type="button" disabled={busy || !privateKey} onClick={() => void create()} className="mt-3 rounded-full border-2 border-black bg-primary px-5 py-2 font-bold disabled:opacity-40">Finish and send waiting invitations</button>}</div>}
      {!privateKey && <p className="mt-3 text-sm">Unlock your keys to add recipients. You can view and share existing links now.</p>}
      <fieldset disabled={busy || loadingLinks || !privateKey}>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="recipient@example.com" className="h-11 min-w-56 flex-1 rounded-xl border-2 border-black" />
        <button type="button" onClick={() => { addEmails(parseEmailText(entry)); setEntry(""); }} className="rounded-full border-2 border-black bg-primary px-5 font-bold shadow-sm">Add</button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-full border-2 border-black bg-background px-4 font-bold shadow-sm"><Upload className="size-4" /> Import</button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; try { if (file) addEmails(await parseRecipientFile(file)); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read the list."); } event.target.value = ""; }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{emails.map((email) => <span key={email} className="flex items-center gap-2 rounded-full border-2 border-black bg-muted px-3 py-1.5 text-xs font-bold">{email}<button type="button" aria-label={`Remove ${email}`} onClick={() => { setEmails((list) => list.filter((item) => item !== email)); }} className="rounded-full"><Trash2 className="size-3.5" /></button></span>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border-2 border-black bg-background px-4 py-2 text-sm font-bold">{permission === "VIEW_ONLY" ? "View only" : "Existing link permissions retained"}</span>
        <button type="button" disabled={busy || !emails.length} onClick={() => void create()} className="rounded-full border-2 border-black bg-primary px-5 py-2.5 font-head shadow-sm disabled:opacity-50">Send</button>
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
      <ShareLinksDialog open={dialogOpen} onOpenChange={setDialogOpen} shares={shares} busy={busy} message={message} schedule={batchId ? savedSchedule : schedule} onSendEmail={() => void sendEmail()} onResend={id => { const share = shares.find(item => item.shareId === id); if (share) void sendEmail([share], true); }} />
    </section>
  );
}
