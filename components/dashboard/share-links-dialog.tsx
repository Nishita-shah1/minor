"use client";

import { useState } from "react";
import { Check, Clipboard, LoaderCircle, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CreatedShare = { shareId: string; recipientEmail: string; status: string; emailStatus: string; emailAttemptId?: string | null; shareUrl: string | null;
  shareBaseUrl: string; ownerWrappedInviteSecret?: string | null };

export function ShareLinksDialog({
  open, onOpenChange, shares, busy, message, schedule, onSendEmail, onResend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shares: CreatedShare[];
  busy: boolean;
  message: string;
  schedule: string;
  onSendEmail: () => void;
  onResend: (shareId: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const ready = shares.filter((share) => share.shareUrl);
  const waiting = shares.filter((share) => !share.shareUrl);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto rounded-2xl border-[3px] border-black bg-card shadow-lg sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-head text-2xl">Share invitations</DialogTitle>
          <DialogDescription>{schedule || "No opening or expiry restriction."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ready.map((share) => (
            <div key={share.shareId} className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-background p-3">
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{share.recipientEmail}</p><p className="text-xs">{share.emailStatus === "ACCEPTED" ? "Accepted by Brevo; delivery not confirmed" : share.emailStatus === "SENDING" ? "Email attempt in progress" : share.emailStatus === "FAILED" ? "Acceptance unconfirmed — retry available" : "Invitation ready to send"}</p><input aria-label={`Secure link for ${share.recipientEmail}`} readOnly value={share.shareUrl ?? ""} className="mt-2 w-full rounded-lg border-2 border-black p-2 text-xs" onFocus={event => event.target.select()} /></div>
              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(share.shareUrl!); setCopied(share.shareId); setCopyError(""); } catch { setCopyError("Clipboard access failed. Select and copy the link below."); } }} className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-black bg-primary px-3 py-1.5 font-bold shadow-sm">
                <Clipboard className="size-4" /> {copied === share.shareId ? "Copied" : "Copy link"}
              </button>
              <button type="button" disabled={busy} onClick={() => onResend(share.shareId)} className="shrink-0 rounded-full border-2 border-black bg-card px-3 py-1.5 text-sm font-bold disabled:opacity-50">Send again</button>
            </div>
          ))}
        </div>
        {waiting.length > 0 && <div className="rounded-xl border-2 border-black bg-muted p-3"><p className="font-head">Invitations needing preparation</p><p className="mt-1 text-sm text-muted-foreground">{waiting.map((share) => `${share.recipientEmail} (${share.status})`).join(", ")}</p></div>}
        <p className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : message && <Check className="size-4" />}{message}
        </p>
        {copyError && <p role="alert">{copyError}</p>}
        <DialogFooter className="rounded-b-2xl border-black">
          <button type="button" disabled={busy || !ready.some(share => share.emailStatus !== "ACCEPTED")} onClick={onSendEmail} className="flex items-center justify-center gap-2 rounded-full border-2 border-black bg-primary px-5 py-2.5 font-head shadow-sm disabled:opacity-50">
            <Mail className="size-4" /> Retry unsent invitations
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
