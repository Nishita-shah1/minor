import "server-only";
// Enable only after applying the reviewed migration. No automatic database writes.
export const experimentalFingerprintingEnabled = () => process.env.EXPERIMENTAL_FINGERPRINTING === "true";
