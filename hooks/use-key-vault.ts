"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { forgetLocalPrivateKey, getLocalPrivateKey, saveLocalPrivateKey } from "@/lib/crypto/indexed-db";
import type { KeyBundleResponse } from "@/lib/crypto/types";
import { recoverKeyVault, setupKeyVault } from "@/lib/crypto/worker-client";

export type KeyVaultState =
  | { status: "CHECKING" }
  | { status: "NEEDS_SETUP" }
  | { status: "NEEDS_UNLOCK"; bundle: KeyBundleResponse }
  | { status: "READY"; bundle: KeyBundleResponse; privateKey: CryptoKey }
  | { status: "ERROR"; message: string };

export function useKeyVault(clerkUserId: string | null | undefined) {
  const [state, setState] = useState<KeyVaultState>({ status: "CHECKING" });

  const refresh = useCallback(async () => {
    if (!clerkUserId) return;
    setState({ status: "CHECKING" });
    try {
      const response = await fetch("/api/key-vault", { cache: "no-store" });
      const result = await response.json() as { bundle?: KeyBundleResponse | null; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not load your encryption key.");
      const { bundle } = result;
      if (!bundle) {
        setState({ status: "NEEDS_SETUP" });
        return;
      }
      const local = await getLocalPrivateKey(clerkUserId);
      if (local?.fingerprint === bundle.publicKeyFingerprint) {
        setState({ status: "READY", bundle, privateKey: local.privateKey });
      } else {
        setState({ status: "NEEDS_UNLOCK", bundle });
      }
    } catch (error) {
      setState({ status: "ERROR", message: error instanceof Error ? error.message : "Key vault unavailable." });
    }
  }, [clerkUserId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const setup = useCallback(async (passphrase: string) => {
    if (!clerkUserId) throw new Error("Sign in first.");
    const result = await setupKeyVault(clerkUserId, passphrase);
    const response = await fetch("/api/key-vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.bundle),
    });
    if (!response.ok) throw new Error("Could not register the encryption key.");
    await saveLocalPrivateKey(clerkUserId, {
      privateKey: result.privateKey,
      fingerprint: result.bundle.publicKeyFingerprint,
    });
    setState({ status: "READY", bundle: result.bundle, privateKey: result.privateKey });
  }, [clerkUserId]);

  const setupRef = useRef(false);
  useEffect(() => {
    if (state.status !== "NEEDS_SETUP" || !clerkUserId || setupRef.current) return;
    setupRef.current = true;
    const passphrase = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    void setup(passphrase).catch((error: unknown) => {
      setupRef.current = false;
      setState({ status: "ERROR", message: error instanceof Error ? error.message : "Could not prepare encryption on this device." });
    });
  }, [clerkUserId, setup, state.status]);

  const unlock = async (passphrase: string) => {
    if (!clerkUserId || state.status !== "NEEDS_UNLOCK") throw new Error("No encrypted backup is available.");
    const result = await recoverKeyVault(clerkUserId, passphrase, state.bundle);
    await saveLocalPrivateKey(clerkUserId, {
      privateKey: result.privateKey,
      fingerprint: state.bundle.publicKeyFingerprint,
    });
    setState({ status: "READY", bundle: state.bundle, privateKey: result.privateKey });
  };

  const forget = async () => {
    if (!clerkUserId) return;
    await forgetLocalPrivateKey(clerkUserId);
    await refresh();
  };

  return { state, setup, unlock, forget, refresh };
}
