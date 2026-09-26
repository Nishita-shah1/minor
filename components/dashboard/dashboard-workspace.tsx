"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Calendar,
  Eye,
  FileText,
  Lightbulb,
  LoaderCircle,
  MoreHorizontal,
  ScanSearch,
  Shield,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useKeyVault } from "@/hooks/use-key-vault";
import {
  buildDashboard,
  type BuiltDashboard,
  type DashboardRange,
  type DocumentRef,
  type FileMetrics,
  type RecipientMetrics,
  type SessionActivity,
  type TrendPoint,
} from "@/lib/activity/dashboard-metrics";
import type { ExposureBand } from "@/lib/activity/exposure-risk";
import type { FileMetadata } from "@/lib/crypto/types";
import { decryptMetadata } from "@/lib/crypto/worker-client";
import { useWorkspaceActive } from "./workspace-activity";

type ExposureResponse = {
  documents: DocumentRef[];
  sessions: SessionActivity[];
  disclaimer: string;
};

const avatarTones = ["bg-[#d9c5f4]", "bg-[#b7e4c7]", "bg-[#a9ddef]", "bg-[#ffd6a5]", "bg-[#ffaaa0]"];
const actionLegend = [
  { key: "screenshots" as const, label: "Screenshots", color: "#7c5cbf" },
  { key: "prints" as const, label: "Prints", color: "#3cba8b" },
  { key: "tabSwitches" as const, label: "Tab switches", color: "#f0c14a" },
  { key: "fullscreenExits" as const, label: "Fullscreen exits", color: "#e85d6c" },
  { key: "pageChanges" as const, label: "Page changes", color: "#b9c0cc" },
];

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

function riskLabel(band: ExposureBand) {
  if (band === "high" || band === "elevated") return "High";
  if (band === "moderate") return "Medium";
  return "Low";
}

function riskTone(band: ExposureBand) {
  if (band === "high" || band === "elevated") return "text-[#c43b4b]";
  if (band === "moderate") return "text-[#a07d00]";
  return "text-[#1f7a45]";
}

function riskPill(band: ExposureBand) {
  if (band === "high" || band === "elevated") return "bg-[#ffe0e0] text-[#c43b4b]";
  if (band === "moderate") return "bg-[#fff3c4] text-[#8a6a00]";
  return "bg-[#e5f8ec] text-[#1f7a45]";
}

function riskStroke(band: ExposureBand) {
  if (band === "high" || band === "elevated") return "#e85d6c";
  if (band === "moderate") return "#f0c14a";
  return "#7dcea0";
}

function initials(name: string) {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function deltaText(delta: number | null, label: string | null) {
  if (delta === null || !label) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} vs previous ${label}`;
}

function deltaClass(delta: number | null, invert = false) {
  if (delta === null || delta === 0) return "text-muted-foreground";
  const positive = delta > 0;
  const good = invert ? !positive : positive;
  return good ? "text-[#1f7a45]" : "text-[#c43b4b]";
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
  const [range, setRange] = useState<DashboardRange>("7");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const dashboard = useMemo(() => {
    if (!data) return null;
    return buildDashboard({ documents: data.documents, sessions: data.sessions, range, now: new Date() });
  }, [data, range]);

  const displayName = user?.fullName || user?.firstName || "there";
  const nameFor = (documentId: string) => names[documentId]?.name ?? "Encrypted file";
  const selected = dashboard?.files.find((file) => file.documentId === selectedId) ?? dashboard?.files[0] ?? null;
  const hottest = dashboard?.files
    .flatMap((file) => file.recipients.map((recipient) => ({ ...recipient, documentId: file.documentId })))
    .sort((a, b) => b.exposureRiskPercent - a.exposureRiskPercent)[0];

  return (
    <section className="min-h-[calc(100svh-4rem)] bg-[#fffaf2] px-4 pb-10 sm:px-6 lg:px-8 dark:bg-background">
      <div className="mx-auto max-w-295 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 pt-1">
          <div>
            <p className="text-sm text-muted-foreground">{greeting()},</p>
            <h1 className="font-head text-4xl tracking-tight sm:text-5xl">{displayName}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Track your shared files, monitor viewing behavior, and investigate potential leaks.</p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-card px-3 py-2 text-sm font-bold shadow-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span className="sr-only">Time range</span>
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as DashboardRange)}
              className="bg-transparent pr-1 outline-none"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total files shared" value={loading ? "—" : dashboard?.filesShared ?? 0} delta={deltaText(dashboard?.filesSharedDelta ?? null, dashboard?.comparisonLabel ?? null)} deltaClassName={deltaClass(dashboard?.filesSharedDelta ?? null)} icon={<FileText className="size-4" />} tone="bg-[#fff6d8]" iconTone="bg-primary" />
          <StatCard label="Total recipients" value={loading ? "—" : dashboard?.recipients ?? 0} delta={deltaText(dashboard?.recipientsDelta ?? null, dashboard?.comparisonLabel ?? null)} deltaClassName={deltaClass(dashboard?.recipientsDelta ?? null)} icon={<Users className="size-4" />} tone="bg-[#eef6ff]" iconTone="bg-[#b9dcff]" />
          <StatCard label="Total views" value={loading ? "—" : dashboard?.views ?? 0} delta={deltaText(dashboard?.viewsDelta ?? null, dashboard?.comparisonLabel ?? null)} deltaClassName={deltaClass(dashboard?.viewsDelta ?? null)} icon={<Eye className="size-4" />} tone="bg-[#f3eefe]" iconTone="bg-[#d9c5f4]" />
          <StatCard label="Capture attempts" value={loading ? "—" : dashboard?.captureAttempts ?? 0} delta={deltaText(dashboard?.captureAttemptsDelta ?? null, dashboard?.comparisonLabel ?? null)} deltaClassName={deltaClass(dashboard?.captureAttemptsDelta ?? null, true)} icon={<TriangleAlert className="size-4" />} tone="bg-[#fff1f1]" iconTone="bg-[#ffb4b4]" />
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <article className="overflow-hidden rounded-2xl border border-black/10 bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <h2 className="font-head text-lg">Recent files</h2>
                  <p className="text-xs text-muted-foreground">Views, screenshot shortcuts, and print attempts in this range</p>
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
                  <Link href="/dashboard/history" className="text-xs font-bold text-muted-foreground">View all</Link>
                </div>
              </div>
              {loading && (
                <div className="flex min-h-40 items-center justify-center">
                  <LoaderCircle className="size-7 animate-spin" />
                </div>
              )}
              {error && <p role="alert" className="px-5 pb-5 text-sm text-destructive">{error}</p>}
              {!loading && !error && dashboard && dashboard.files.length === 0 && (
                <p className="px-5 pb-8 text-sm text-muted-foreground">No files yet. Upload one to start tracking viewing behavior.</p>
              )}
              {!loading && !error && !!dashboard?.files.length && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-200 text-left text-sm">
                    <thead className="text-[0.68rem] tracking-[0.12em] text-muted-foreground uppercase">
                      <tr className="border-y border-black/5">
                        <th className="px-5 py-3 font-semibold">File name</th>
                        <th className="px-3 py-3 font-semibold">Recipients</th>
                        <th className="px-3 py-3 font-semibold">Views</th>
                        <th className="px-3 py-3 font-semibold" title="Print Screen and macOS capture shortcuts observed while the file was open">Screenshots</th>
                        <th className="px-3 py-3 font-semibold">Prints</th>
                        <th className="px-3 py-3 font-semibold">Exposure risk</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-3 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.files.slice(0, 8).map((file) => {
                        const meta = names[file.documentId];
                        const kind = fileKind(meta?.name ?? "", meta?.type ?? "");
                        const activeShare = file.groupStatus === "READY" && file.documentStatus === "READY";
                        const isSelected = selected?.documentId === file.documentId;
                        return (
                          <tr
                            key={file.documentId}
                            className={`cursor-pointer border-b border-black/5 last:border-0 ${isSelected ? "bg-[#fff6d8]/70" : "hover:bg-muted/40"}`}
                            onClick={() => setSelectedId(file.documentId)}
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <span className={`flex size-9 items-center justify-center rounded-xl ${kind.className}`}>
                                  <FileText className="size-4" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate font-bold">{nameFor(file.documentId)}</span>
                                  <span className="block text-xs text-muted-foreground">{formatWhen(file.documentCreatedAt)}</span>
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3"><People recipients={file.recipients} /></td>
                            <td className="px-3 py-3 font-bold">{file.views}</td>
                            <td className="px-3 py-3 font-bold">{file.screenshots}</td>
                            <td className="px-3 py-3 font-bold">{file.prints}</td>
                            <td className={`px-3 py-3 font-bold ${riskTone(file.band)}`}>{file.exposureRiskPercent}%</td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${activeShare ? "bg-[#e5f8ec] text-[#1f7a45]" : "bg-muted text-muted-foreground"}`}>
                                {activeShare ? "Active" : file.documentStatus.toLowerCase()}
                              </span>
                            </td>
                            <td className="relative px-3 py-3">
                              <button
                                type="button"
                                aria-label="File actions"
                                className="rounded-full p-2 hover:bg-muted"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMenu((current) => current === file.documentId ? null : file.documentId);
                                }}
                              >
                                <MoreHorizontal className="size-4" />
                              </button>
                              {menu === file.documentId && (
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

            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-black/10 bg-card p-5 shadow-sm">
                <h2 className="font-head text-base">Viewing and risk trends</h2>
                <p className="text-xs text-muted-foreground">Sessions opened and exposure risk for each day in this range</p>
                <TrendChart points={dashboard?.trends ?? []} />
              </article>
              <article className="rounded-2xl border border-black/10 bg-card p-5 shadow-sm">
                <h2 className="font-head text-base">Actions breakdown</h2>
                <p className="text-xs text-muted-foreground">Behavior recorded while recipients had a file open</p>
                <ActionsDonut actions={dashboard?.actions} />
              </article>
            </div>

            <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[#f3fbf4] px-4 py-3">
              <p className="flex items-start gap-2 text-sm">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#1f7a45]" />
                <span>
                  {hottest && (hottest.band === "high" || hottest.band === "elevated")
                    ? `${hottest.recipientName ?? hottest.recipientEmail} is in the ${riskLabel(hottest.band).toLowerCase()} band on ${nameFor(hottest.documentId)}. That is an estimate, not proof of a leak.`
                    : "No elevated exposure risk in this range. Risk stays an estimate from viewing behavior."}
                </span>
              </p>
              <Link href="/dashboard/history" className="rounded-full bg-[#d9f5df] px-4 py-2 text-sm font-bold text-[#1f7a45]">
                Revoke access
              </Link>
            </article>
          </div>

          <aside className="space-y-4">
            <article className="rounded-2xl border border-black/10 bg-card p-5 shadow-sm">
              {!selected && <p className="text-sm text-muted-foreground">{loading ? "Loading files…" : "No file selected."}</p>}
              {selected && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${fileKind(names[selected.documentId]?.name ?? "", names[selected.documentId]?.type ?? "").className}`}>
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate font-head text-lg">{nameFor(selected.documentId)}</h2>
                        <p className="text-xs text-muted-foreground">{formatWhen(selected.documentCreatedAt)}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${fileKind(names[selected.documentId]?.name ?? "", names[selected.documentId]?.type ?? "").className}`}>
                      {fileKind(names[selected.documentId]?.name ?? "", names[selected.documentId]?.type ?? "").label}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Shared with {selected.recipients.length} {selected.recipients.length === 1 ? "recipient" : "recipients"}</p>
                      <div className="mt-2"><People recipients={selected.recipients} limit={4} /></div>
                    </div>
                    <RiskRing percent={selected.exposureRiskPercent} band={selected.band} />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{data?.disclaimer}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <h3 className="font-head text-sm">Viewing behavior</h3>
                    <Link href="/dashboard/history" className="text-xs font-bold text-muted-foreground">View all</Link>
                  </div>
                  <RecipientTable recipients={selected.recipients} />
                </>
              )}
            </article>

            <article className="rounded-2xl border border-[#d9c5f4] bg-[#f7f3ff] p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-head text-base">
                <Shield className="size-4" /> Investigate a suspected leak
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">Upload a screenshot and match it locally with a recipient copy. This does not use the behavior counts above.</p>
              <Link href="/dashboard/scan" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1f1a14] px-4 py-2 text-sm font-bold text-white">
                <ScanSearch className="size-4" /> Scan screenshot
              </Link>
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
  delta,
  deltaClassName,
  icon,
  tone,
  iconTone,
}: {
  label: string;
  value: string | number;
  delta: string | null;
  deltaClassName: string;
  icon: ReactNode;
  tone: string;
  iconTone: string;
}) {
  return (
    <article className={`rounded-2xl border border-black/10 px-4 py-4 shadow-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-bold tracking-[0.14em] uppercase">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-full ${iconTone}`}>{icon}</span>
      </div>
      <p className="mt-3 font-head text-3xl tracking-tight">{value}</p>
      {delta && <p className={`mt-1 text-xs font-bold ${deltaClassName}`}>{delta}</p>}
    </article>
  );
}

function People({ recipients, limit = 1 }: { recipients: RecipientMetrics[]; limit?: number }) {
  if (!recipients.length) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = recipients.slice(0, limit);
  const extra = recipients.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((recipient, index) => (
        <span
          key={recipient.shareId}
          className={`flex size-7 items-center justify-center rounded-full border-2 border-card text-xs font-bold ${avatarTones[index % avatarTones.length]} ${index > 0 ? "-ml-2" : ""}`}
          title={recipient.recipientName ?? recipient.recipientEmail}
        >
          {initials(recipient.recipientName ?? recipient.recipientEmail)}
        </span>
      ))}
      {extra > 0 && <span className="ml-1 text-xs font-bold text-muted-foreground">+{extra}</span>}
    </span>
  );
}

function RiskRing({ percent, band }: { percent: number; band: ExposureBand }) {
  const gradient = `conic-gradient(${riskStroke(band)} 0% ${percent}%, #efe8dc ${percent}% 100%)`;
  return (
    <div className="relative size-24 shrink-0 rounded-full" style={{ background: gradient }} aria-label={`${percent}% exposure risk, ${riskLabel(band)}`}>
      <div className="absolute inset-2.5 flex flex-col items-center justify-center rounded-full bg-card">
        <span className="font-head text-xl leading-none">{percent}%</span>
        <span className="mt-1 text-[0.65rem] text-muted-foreground">{riskLabel(band)}</span>
      </div>
    </div>
  );
}

function RecipientTable({ recipients }: { recipients: RecipientMetrics[] }) {
  if (!recipients.length) return <p className="mt-3 text-sm text-muted-foreground">No recipients yet.</p>;
  return (
    <div className="mt-3 max-h-72 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
          <tr>
            <th className="py-2 font-semibold">Recipient</th>
            <th className="py-2 font-semibold">Views</th>
            <th className="py-2 font-semibold">Screenshots</th>
            <th className="py-2 font-semibold">Prints</th>
            <th className="py-2 font-semibold">Last viewed</th>
            <th className="py-2 font-semibold">Risk</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((recipient) => (
            <tr key={recipient.shareId} className="border-t border-black/5">
              <td className="max-w-28 truncate py-2 font-bold" title={recipient.recipientEmail}>{recipient.recipientName ?? recipient.recipientEmail}</td>
              <td className="py-2">{recipient.views}</td>
              <td className="py-2">{recipient.screenshots}</td>
              <td className="py-2">{recipient.prints}</td>
              <td className="py-2">{recipient.lastViewedAt ? formatAgo(recipient.lastViewedAt) : "—"}</td>
              <td className="py-2">
                <span className={`rounded-full px-2 py-0.5 font-bold ${riskPill(recipient.band)}`}>{recipient.exposureRiskPercent}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (!points.length) return <p className="mt-6 text-sm text-muted-foreground">No sessions in this range.</p>;
  const width = 520;
  const height = 180;
  const pad = { l: 28, r: 36, t: 16, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxViews = Math.max(1, ...points.map((point) => point.views));
  const slot = innerW / points.length;
  const barW = Math.max(4, Math.min(18, slot * 0.45));
  const line = points.map((point, index) => {
    const x = pad.l + slot * index + slot / 2;
    const y = pad.t + innerH - (point.risk / 100) * innerH;
    return `${x},${y}`;
  }).join(" ");
  const labelEvery = points.length > 10 ? Math.ceil(points.length / 6) : 1;
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Views and exposure risk over time">
        {[0, 0.5, 1].map((step) => {
          const y = pad.t + innerH - step * innerH;
          return <line key={step} x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />;
        })}
        {points.map((point, index) => {
          const barH = (point.views / maxViews) * innerH;
          const x = pad.l + slot * index + (slot - barW) / 2;
          const y = pad.t + innerH - barH;
          return <rect key={`${point.label}-${index}`} x={x} y={y} width={barW} height={barH} rx="4" fill="#7eb6e6" />;
        })}
        <polyline points={line} fill="none" stroke="#f0c14a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => index % labelEvery === 0 ? (
          <text key={`${point.label}-label`} x={pad.l + slot * index + slot / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.55">
            {point.label}
          </text>
        ) : null)}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#7eb6e6]" /> Views</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#f0c14a]" /> Exposure risk</span>
      </div>
    </div>
  );
}

function ActionsDonut({ actions }: { actions: BuiltDashboard["actions"] | undefined }) {
  const slices = actionLegend.map((item) => ({ ...item, count: actions?.[item.key] ?? 0 }));
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  let cursor = 0;
  const gradient = total === 0
    ? "conic-gradient(#efe8dc 0% 100%)"
    : `conic-gradient(${slices.map((slice) => {
      const start = cursor;
      cursor += (slice.count / total) * 100;
      return `${slice.color} ${start}% ${cursor}%`;
    }).join(", ")})`;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <div className="relative size-28 shrink-0 rounded-full" style={{ background: gradient }} aria-label={`${total} recorded actions`}>
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card">
          <span className="font-head text-2xl leading-none">{total}</span>
          <span className="mt-1 text-[0.65rem] text-muted-foreground">Actions</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: slice.color }} />
              {slice.label}
            </span>
            <span className="font-bold">{slice.count}{total > 0 ? ` (${Math.round((slice.count / total) * 100)}%)` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
