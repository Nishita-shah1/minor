import { notFound } from "next/navigation";
import { FingerprintLab } from "@/components/fingerprint/fingerprint-lab";

export default function FingerprintLabPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <FingerprintLab />;
}
