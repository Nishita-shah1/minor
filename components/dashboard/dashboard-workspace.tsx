"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Eye,
  FileText,
  FolderLock,
  LoaderCircle,
  MoreHorizontal,
  Upload,
  Users,
  Activity,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useKeyVault } from "@/hooks/use-key-vault";
import type { FileMetadata } from "@/lib/crypto/types";
import { decryptMetadata } from "@/lib/crypto/worker-client";
import { useWorkspaceActive } from "./workspace-activity";

type Band = "low" | "moderate" | "elevated" | "high";

type RecipientRisk = {
  shareId: string;
  recipientName: string | null;
  recipientEmail: string;
};

type DocumentRisk = {
  documentId: string;
  groupId: string;
  documentStatus: string;
  groupStatus: string;
  documentCreatedAt: string;
  exposureRiskPercent: number;
  band: Band;
  recipients: RecipientRisk[];
};

type ActivityItem = {
  id: string;
  kind: "viewed" | "shared" | "uploaded";
  documentId: string;
  at: string;
  band: Band;
};

type ExposureResponse = {
  documents: DocumentRisk[];
  summary: { fileCount: number; recipientCount: number; sessionCount: number; overallPercent: number; low: number; medium: number; high: number };
  activity: ActivityItem[];
};

const avatarTones = ["bg-[#d9c5f4]", "bg-[#b7e4c7]", "bg-[#a9ddef]", "bg-[#ffd6a5]", "bg-[#ffaaa0]"];

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function fileKind(name: string, type: string) {
  const value = `${name} ${type}`.toLowerCase();
  if (value.includes("pdf")) return { label: "PDF", className: "bg-[#ffe0e0] text-[#c43b4b]" };
  if (value.includes("png")) return { label: "PNG", className: "bg-[#efe4ff] text-[#7a4bb5]" };
  if (value.includes("jpg") || value.includes("jpeg")) return { label: "JPG", className: "bg-[#e3f2ff] text-[#2f6f9f]" };
  return { label: "FILE", className: "bg-muted text-foreground" };
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  return `Uploaded ${date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function formatAgo(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function riskLabel(band: Band) {
  if (band === "high" || band === "elevated") return "High";
  if (band === "moderate") return "Medium";
  return "Low";
}

function riskPill(band: Band) {
  if (band === "high" || band === "elevated") return "bg-[#ffe0e0] text-[#c43b4b]";
  if (band === "moderate") return "bg-[#fff3c4] text-[#8a6a00]";
  return "bg-[#e5f8ec] text-[#1f7a45]";
}

function initials(name: string) {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function Donut({ overall, low, medium, high }: { overall: number; low: number; medium: number; high: number }) {
  const total = Math.max(1, low + medium + high);
  const lowPct = (low / total) * 100;
  const mediumPct = (medium / total) * 100;
  const highPct = (high / total) * 100;
  const gradient = `conic-gradient(#7dcea0 0% ${lowPct}%, #f0c14a ${lowPct}% ${lowPct + mediumPct}%, #e85d6c ${lowPct + mediumPct}% ${lowPct + mediumPct + highPct}%)`;
  return (
    <div className="relative size-28 shrink-0 rounded-full" style={{ background: gradient }} aria-label={`${overall}% overall exposure risk`}>
      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card">
        <span className="font-head text-2xl leading-none">{overall}%</span>
        <span className="mt-1 text-[0.65rem] text-muted-foreground">Overall risk</span>
      </div>
    </div>
  );
}

export function DashboardWorkspace() {
  const active = useWorkspaceActive();
  const { user } = useUser();
  const vault = useKeyVault(user?.id);
  const [data, setData] = useState<ExposureResponse | null>(null);
  const [names, setNames] = useState<Record<string, FileMetadata | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/owner/exposure-risk", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load dashboard.");
        if (!cancelled) setData(body);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!data?.documents.length || vault.state.status !== "READY") return;
    const privateKey = vault.state.privateKey;
    const groupIds = [...new Set(data.documents.map((document) => document.groupId))];
    let cancelled = false;
    void (async () => {
      const next: Record<string, FileMetadata | null> = {};
      await Promise.all(groupIds.map(async (groupId) => {
        const response = await fetch(`/api/upload-groups/${groupId}/owner-access`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) return;
        const descriptors = body.files
          .filter((file: { status: string }) => file.status === "READY" || file.status === "DELETED")
          .map((file: { documentId: string; status: string; wrappedFileKey: string | null; encryptedMetadata: string | null; metadataIv: string | null }) => ({
            ...file,
            status: file.status === "READY" ? "READY" as const : "DELETED" as const,
          }));
        const decrypted = await decryptMetadata(privateKey, descriptors);
        for (const file of decrypted) next[file.documentId] = file.metadata;
      }));
      if (!cancelled) setNames(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, vault.state]);

  const displayName = user?.fullName || user?.firstName || "there";
  const summary = data?.summary ?? { fileCount: 0, recipientCount: 0, sessionCount: 0, overallPercent: 0, low: 0, medium: 0, high: 0 };
  const totalBands = Math.max(1, summary.low + summary.medium + summary.high);
  const legend = useMemo(() => ([
    { label: "Low", color: "bg-[#7dcea0]", pct: Math.round((summary.low / totalBands) * 100) },
    { label: "Medium", color: "bg-[#f0c14a]", pct: Math.round((summary.medium / totalBands) * 100) },
    { label: "High", color: "bg-[#e85d6c]", pct: Math.round((summary.high / totalBands) * 100) },
  ]), [summary.high, summary.low, summary.medium, totalBands]);

  const nameFor = (documentId: string) => names[documentId]?.name ?? "Encrypted file";

  return (
    <section className="min-h-[calc(100svh-4rem)] bg-[#fffaf2] px-4 pb-10 sm:px-6 lg:px-8 dark:bg-background">
      <div className="mx-auto max-w-295 space-y-5">
          <header className="flex flex-wrap items-start justify-between gap-4 pt-1">
            <div>
              <p className="text-sm text-muted-foreground">{greeting()},</p>
              <h1 className="font-head text-4xl tracking-tight sm:text-5xl">{displayName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Secure your files. Track their journeys. Stay informed.</p>
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              <div className="relative mr-2 hidden lg:block">
                <FolderMark />
                <p className="absolute -right-1 top-1 w-28 rotate-6 text-sm leading-tight text-[#c4a15a]" style={{ fontFamily: "\"Segoe Script\", cursive" }}>
                  Your data. Your control.
                </p>
              </div>
              <Link href="/dashboard/profile" aria-label="Profile" className="flex size-10 items-center justify-center rounded-full border border-black/10 bg-[#7c5cbf] font-bold text-white">
                {(displayName[0] ?? "E").toUpperCase()}
              </Link>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Files" value={loading ? "—" : summary.fileCount} hint="Total encrypted files" icon={<FileText className="size-4" />} tone="bg-[#fff6d8]" iconTone="bg-primary" />
            <StatCard label="Recipients" value={loading ? "—" : summary.recipientCount} hint="Total unique recipients" icon={<Users className="size-4" />} tone="bg-[#eef8f0]" iconTone="bg-[#b7e4c7]" />
            <StatCard label="Exposure risk" value={loading ? "—" : `${summary.overallPercent}%`} hint="Across all files" icon={<Eye className="size-4" />} tone="bg-[#fff1f1]" iconTone="bg-[#ffb4b4]" />
            <StatCard label="Views" value={loading ? "—" : summary.sessionCount} hint="Recipient viewing sessions" icon={<Activity className="size-4" />} tone="bg-[#eef6ff]" iconTone="bg-[#b9dcff]" />
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <article className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-muted">
                  <FileText className="size-4" />
                </span>
                <div>
                  <h2 className="font-head text-lg">Recent files</h2>
                  <p className="text-xs text-muted-foreground">Your latest uploaded and shared files</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {vault.state.status !== "READY" && (
                  <button
                    type="button"
                    onClick={() => setError("File names stay encrypted until this browser has the device key.")}
                    className="rounded-full border border-black/10 bg-card px-3 py-2 text-xs font-bold"
                  >
                    Unlock names
                  </button>
                )}
                <Link href="/dashboard/upload" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm">
                  <Upload className="size-4" /> Upload file
                </Link>
              </div>
            </div>

            {loading && (
              <div className="flex min-h-40 items-center justify-center">
                <LoaderCircle className="size-7 animate-spin" />
              </div>
            )}
            {error && <p role="alert" className="px-5 pb-5 text-sm text-destructive">{error}</p>}
            {!loading && !error && data && data.documents.length === 0 && (
              <p className="px-5 pb-8 text-sm text-muted-foreground">No files yet. Upload one to start tracking exposure.</p>
            )}
            {!loading && !error && !!data?.documents.length && (
                <div className="overflow-x-auto">
                <table className="w-full min-w-180 text-left text-sm">
                  <thead className="text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase">
                    <tr className="border-y border-black/5">
                      <th className="px-5 py-3 font-semibold">File name</th>
                      <th className="px-3 py-3 font-semibold">Type</th>
                      <th className="px-3 py-3 font-semibold">Recipients</th>
                      <th className="px-3 py-3 font-semibold">Exposure risk</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.slice(0, 8).map((document) => {
                      const meta = names[document.documentId];
                      const kind = fileKind(meta?.name ?? "", meta?.type ?? "");
                      const activeShare = document.groupStatus === "READY" && document.documentStatus === "READY";
                      const people = document.recipients;
                      return (
                        <tr key={document.documentId} className="border-b border-black/5 last:border-0">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <span className={`flex size-9 items-center justify-center rounded-xl ${kind.className}`}>
                                <FileText className="size-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-bold">{nameFor(document.documentId)}</span>
                                <span className="block text-xs text-muted-foreground">{formatWhen(document.documentCreatedAt)}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${kind.className}`}>{kind.label}</span>
                          </td>
                          <td className="px-3 py-3">
                            {people.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <span className="flex items-center">
                                <span className={`flex size-7 items-center justify-center rounded-full border-2 border-card text-xs font-bold ${avatarTones[0]}`}>
                                  {initials(people[0].recipientName ?? people[0].recipientEmail)}
                                </span>
                                {people.length > 1 && (
                                  <span className="ml-1 text-xs font-bold text-muted-foreground">+{people.length - 1}</span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex size-9 items-center justify-center rounded-full border border-black/10 text-xs font-bold">
                              {document.exposureRiskPercent}%
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${activeShare ? "bg-[#e5f8ec] text-[#1f7a45]" : "bg-muted text-muted-foreground"}`}>
                              {activeShare ? "Active" : document.documentStatus.toLowerCase()}
                            </span>
                          </td>
                          <td className="relative px-3 py-3">
                            <button
                              type="button"
                              aria-label="File actions"
                              className="rounded-full p-2 hover:bg-muted"
                              onClick={() => setMenu((current) => current === document.documentId ? null : document.documentId)}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                            {menu === document.documentId && (
                              <div className="absolute right-3 z-10 mt-1 w-36 rounded-xl border border-black/10 bg-card p-1 shadow-md">
                                <Link href="/dashboard/history" className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-muted" onClick={() => setMenu(null)}>
                                  Manage
                                </Link>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        <aside className="space-y-4">
          <article className="rounded-2xl border border-black/10 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-head text-base">
                <Eye className="size-4" /> Exposure risk overview
              </h2>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <Donut overall={summary.overallPercent} low={summary.low} medium={summary.medium} high={summary.high} />
              <ul className="space-y-2 text-sm">
                {legend.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${item.color}`} />
                      {item.label}
                    </span>
                    <span className="font-bold">{item.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[0.65rem] font-bold">i</span>
              Exposure risk is an estimate based on disclosed viewing behavior. It is not proof of a leak.
            </p>
          </article>

          <article className="rounded-2xl border border-black/10 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-head text-base">Recent activity</h2>
              <Link href="/dashboard/history" className="text-xs font-bold text-muted-foreground">View all</Link>
            </div>
            <ul className="mt-4 space-y-4">
              {!data?.activity.length && !loading && (
                <li className="text-sm text-muted-foreground">No activity yet.</li>
              )}
              {data?.activity.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    {item.kind === "viewed" ? <Eye className="size-3.5" /> : item.kind === "shared" ? <Users className="size-3.5" /> : <Upload className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">
                      {item.kind === "viewed" ? "Recipient viewed a file" : item.kind === "shared" ? "File shared" : "File uploaded"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {nameFor(item.documentId)} · {formatAgo(item.at)}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${riskPill(item.band)}`}>
                    {riskLabel(item.band)}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </aside>
          </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  iconTone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  tone: string;
  iconTone: string;
}) {
  return (
    <article className={`rounded-2xl border border-black/10 px-4 py-4 shadow-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-bold tracking-[0.16em] uppercase">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-full ${iconTone}`}>{icon}</span>
      </div>
      <p className="mt-3 font-head text-3xl tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </article>
  );
}

function FolderMark() {
  return (
    <div className="relative size-16" aria-hidden="true">
      <div className="absolute top-3 left-1 h-10 w-14 rotate-[-8deg] rounded-lg border-2 border-[#1f1a14] bg-[#ffe08a] shadow-sm" />
      <div className="absolute top-5 left-3 flex size-8 items-center justify-center rounded-md border-2 border-[#1f1a14] bg-[#fff6d0]">
        <FolderLock className="size-4" />
      </div>
    </div>
  );
}
