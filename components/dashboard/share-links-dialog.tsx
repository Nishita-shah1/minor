"use client";

import { Check, Clipboard, LoaderCircle, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CreatedShare = { shareId: string; recipientEmail: string; status: string; shareUrl: string | null };

export function ShareLinksDialog({
  open, onOpenChange, shares, busy, message, schedule, onSendEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shares: CreatedShare[];
  busy: boolean;
  message: string;
  schedule: string;
  onSendEmail: () => void;
}) {
  const ready = shares.filter((share) => share.shareUrl);
  const waiting = shares.filter((share) => !share.shareUrl);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto rounded-2xl border-[3px] border-black bg-card shadow-lg sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-head text-2xl">Secure links are ready</DialogTitle>
          <DialogDescription>{schedule || "No opening or expiry restriction."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ready.map((share) => (
            <div key={share.shareId} className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-background p-3">
              <span className="min-w-0 truncate font-bold">{share.recipientEmail}</span>
              <button type="button" onClick={async () => share.shareUrl && navigator.clipboard.writeText(share.shareUrl)} className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-black bg-primary px-3 py-1.5 font-bold shadow-sm">
                <Clipboard className="size-4" /> Copy
              </button>
            </div>
          ))}
        </div>
        {waiting.length > 0 && <div className="rounded-xl border-2 border-black bg-muted p-3"><p className="font-head">Not enrolled</p><p className="mt-1 text-sm text-muted-foreground">{waiting.map((share) => share.recipientEmail).join(", ")}</p></div>}
        <p className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : message && <Check className="size-4" />}{message}
        </p>
        <DialogFooter className="rounded-b-2xl border-black">
          <button type="button" disabled={busy || !ready.length} onClick={onSendEmail} className="flex items-center justify-center gap-2 rounded-full border-2 border-black bg-primary px-5 py-2.5 font-head shadow-sm disabled:opacity-50">
            <Mail className="size-4" /> Send enrolled recipients via email
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
