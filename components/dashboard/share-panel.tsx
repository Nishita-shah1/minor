"use client";

import { LoaderCircle, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreatedShare, ShareLinksDialog } from "@/components/dashboard/share-links-dialog";
import { Input } from "@/components/ui/input";
import { MAX_RECIPIENTS } from "@/lib/crypto/constants";
import type { PreparedRecipient } from "@/lib/crypto/types";
import { rewrapForRecipients } from "@/lib/crypto/worker-client";
import { parseEmailText, parseRecipientFile } from "@/lib/recipients/parse";
import { validateShareSchedule } from "@/lib/shares/schedule";

type OwnerAccess = { fingerprintOwnerPublicKey?: JsonWebKey; existingFingerprints?: Array<{documentId: string; ownerWrappedKey: string}>; files: Array<{ documentId: string; status: string; wrappedFileKey: string | null }> };

export function SharePanel({ groupId, privateKey }: { groupId: string; privateKey?: CryptoKey }) {
  const emailAttempt = useRef<string | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [savedSchedule, setSavedSchedule] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [entry, setEntry] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [permission, setPermission] = useState<"VIEW_ONLY" | "VIEW_AND_DOWNLOAD">("VIEW_AND_DOWNLOAD");
  const [useOpening, setUseOpening] = useState(false);
  const [useExpiry, setUseExpiry] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [prepared, setPrepared] = useState<PreparedRecipient[]>([]);
  const [shares, setShares] = useState<CreatedShare[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const applyLinks = (body: { shares: CreatedShare[]; batchId: string | null; emailAttemptId?: string | null; permission?: "VIEW_ONLY" | "VIEW_AND_DOWNLOAD"; availableFrom?: string | null; expiresAt?: string | null }) => {
    setShares(body.shares); setBatchId(body.batchId); emailAttempt.current = body.emailAttemptId ?? null;
    if (body.permission) setPermission(body.permission);
    setSavedSchedule([body.availableFrom ? `Opens ${new Date(body.availableFrom).toLocaleString()}` : "", body.expiresAt ? `Expires ${new Date(body.expiresAt).toLocaleString()}` : ""].filter(Boolean).join(" · "));
  };
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
    setPrepared([]);
  };

  const prepare = async () => {
    if (!emails.length) return setMessage("Add at least one recipient.");
    setBusy(true); setMessage("Checking recipients with Clerk…");
    try {
      const response = await fetch(`/api/upload-groups/${groupId}/shares/prepare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientEmails: emails }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not prepare recipients.");
      setPrepared(body.recipients); setMessage("Recipients checked.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recipient preparation failed."); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!privateKey) return setMessage("Unlock your keys to add recipients. Existing links can still be copied or emailed.");
    const start = useOpening ? new Date(availableFrom) : null;
    const end = useExpiry ? new Date(expiresAt) : null;
    if ((useOpening && !availableFrom) || (useExpiry && !expiresAt)) return setMessage("Choose a time for each enabled access rule.");
    const scheduleError = validateShareSchedule({ availableFrom: start, expiresAt: end });
    if (!batchId && scheduleError) return setMessage(scheduleError);
    setBusy(true); setMessage("Loading protected file keys…");
    try {
      const ownerResponse = await fetch(`/api/upload-groups/${groupId}/owner-access`, { cache: "no-store" });
      const owner = await ownerResponse.json() as OwnerAccess & { error?: { message?: string } };
      if (!ownerResponse.ok) throw new Error(owner.error?.message ?? "Owner keys unavailable.");
      const documents = owner.files.filter((file) => file.status === "READY" && file.wrappedFileKey).map((file) => ({ documentId: file.documentId, ownerWrappedKey: file.wrappedFileKey! }));
      const wrapped = await rewrapForRecipients({ privateKey, documents, recipients: prepared, fingerprintOwnerPublicKey: owner.fingerprintOwnerPublicKey, existingFingerprints: owner.existingFingerprints }, (count) => setMessage(`Preparing secure links… ${count} / ${prepared.filter((recipient) => recipient.status === "READY").length} recipients`));
      const recipients = [...wrapped, ...prepared.filter((recipient) => recipient.status === "NOT_ENROLLED").map((recipient) => ({ status: "NOT_ENROLLED" as const, email: recipient.email }))];
      const response = await fetch(`/api/upload-groups/${groupId}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        recipients, permission,
        availableFrom: start?.toISOString() ?? null,
        expiresAt: end?.toISOString() ?? null,
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not create links.");
      applyLinks(body); setEmails([]); setPrepared([]); setMessage("Secure links are ready. Existing recipients keep the same link."); setDialogOpen(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Share creation failed."); }
    finally { setBusy(false); }
  };

  const sendEmail = async () => {
    if (!batchId) return;
    setBusy(true); setMessage("Sending personalized links through Brevo…");
    try {
      emailAttempt.current ??= crypto.randomUUID();
      const response = await fetch(`/api/share-batches/${batchId}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: emailAttempt.current }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Email request failed.");
      emailAttempt.current = null; setMessage("Brevo accepted the email request. This is not a delivery confirmation.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Email request failed. Your links are still available."); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-md sm:p-5">
      <h2 className="font-head text-xl">2. Share securely</h2>
      <p className="mt-1 text-sm text-muted-foreground">Add up to 100 emails manually or from CSV, TXT, or XLSX.</p>
      {loadingLinks && <p role="status">Loading existing secure links…</p>}
      {batchId && <div className="mt-4 rounded-xl border-2 border-black bg-background p-3"><p className="font-bold">{shares.length} existing recipient{shares.length === 1 ? "" : "s"}</p><p className="my-2 text-sm">{shares.map(share => share.recipientEmail).join(", ")}</p><button type="button" disabled={busy} onClick={() => void reopenLinks()} className="rounded-full border-2 border-black bg-primary px-5 py-2.5 font-bold shadow-sm">View secure links</button><p className="mt-2 text-sm">Add recipients below. Existing permission and access times are preserved.</p></div>}
      {!privateKey && <p className="mt-3 text-sm">Unlock your keys to add recipients. You can view and share existing links now.</p>}
      <fieldset disabled={busy || loadingLinks || !privateKey}>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="recipient@example.com" className="h-11 min-w-56 flex-1 rounded-xl border-2 border-black" />
        <button type="button" onClick={() => { addEmails(parseEmailText(entry)); setEntry(""); }} className="rounded-full border-2 border-black bg-primary px-5 font-bold shadow-sm">Add</button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-full border-2 border-black bg-background px-4 font-bold shadow-sm"><Upload className="size-4" /> Import</button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; try { if (file) addEmails(await parseRecipientFile(file)); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read the list."); } event.target.value = ""; }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{emails.map((email) => <span key={email} className="flex items-center gap-2 rounded-full border-2 border-black bg-muted px-3 py-1.5 text-xs font-bold">{email}<button type="button" aria-label={`Remove ${email}`} onClick={() => { setEmails((list) => list.filter((item) => item !== email)); setPrepared([]); }} className="rounded-full"><Trash2 className="size-3.5" /></button></span>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select disabled={!!batchId} value={permission} onChange={(event) => setPermission(event.target.value as typeof permission)} className="h-11 rounded-xl border-2 border-black bg-background px-3 font-bold"><option value="VIEW_AND_DOWNLOAD">View and download</option><option value="VIEW_ONLY">View only</option></select>
        {!prepared.length ? <button type="button" disabled={busy || !emails.length} onClick={() => void prepare()} className="rounded-full border-2 border-black bg-primary px-5 py-2.5 font-head shadow-sm disabled:opacity-50">Prepare share</button> : <button type="button" disabled={busy} onClick={() => void create()} className="rounded-full border-2 border-black bg-primary px-5 py-2.5 font-head shadow-sm disabled:opacity-50">{batchId ? "Add recipients and show links" : "Create secure links"}</button>}
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
      <ShareLinksDialog open={dialogOpen} onOpenChange={setDialogOpen} shares={shares} busy={busy} message={message} schedule={batchId ? savedSchedule : schedule} onSendEmail={() => void sendEmail()} />
    </section>
  );
}
