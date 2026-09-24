"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { KeyVaultState } from "@/hooks/use-key-vault";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: KeyVaultState;
  onSetup: (passphrase: string) => Promise<void>;
  onUnlock: (passphrase: string) => Promise<void>;
};

export function KeyVaultDialog({ open, onOpenChange, state, onSetup, onUnlock }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSetup = state.status === "NEEDS_SETUP";

  const submit = async () => {
    if (passphrase.length < 10) return setError("Use at least 10 characters.");
    if (isSetup && passphrase !== confirmation) return setError("The passphrases do not match.");
    setBusy(true);
    setError("");
    try {
      if (isSetup) await onSetup(passphrase);
      else await onUnlock(passphrase);
      setPassphrase("");
      setConfirmation("");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Key vault operation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-2 border-black bg-card shadow-lg sm:max-w-md">
        <DialogHeader>
          <span className="flex size-11 items-center justify-center rounded-full border-2 border-black bg-primary shadow-sm">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle className="font-head text-xl">
            {isSetup ? "Create your encryption key" : "Unlock this device"}
          </DialogTitle>
          <DialogDescription>
            {isSetup
              ? "Create a separate recovery passphrase. This is not your Clerk password and never leaves this browser."
              : "Enter your EchoLeaks recovery passphrase. Decryption happens only on this device."}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 font-bold">
          Recovery passphrase
          <Input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            className="rounded-xl border-2 border-black"
          />
        </label>
        {isSetup && (
          <label className="grid gap-1.5 font-bold">
            Confirm passphrase
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="rounded-xl border-2 border-black"
            />
          </label>
        )}
        <p className="rounded-xl border-2 border-black bg-accent p-3 text-xs font-medium">
          If you lose both this passphrase and every trusted device, old protected files cannot be recovered.
        </p>
        {error && <p className="text-sm font-bold text-destructive" role="alert">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-black bg-primary px-5 font-head shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? "Working locally…" : isSetup ? "Create secure key" : "Unlock locally"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
