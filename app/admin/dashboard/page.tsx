"use client";

import { useState, useEffect } from "react";
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db, auth, ensureAuthPersistence } from "@/app/firebase/config";
import { onAuthStateChanged } from "firebase/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserSummary {
  email: string;
  firstName: string;
  firstCheckinDate: string | null;
  lastCheckInDate: string | null;
  accountAgeDays: number;
  totalCheckIns: number;
  checkInsLast7: number;
  checkInsLast14: number;
  articlesRead: number;
  hasViewedCoaching: boolean;
  isSubscriber: boolean;
  trialStartDate: string | null;
  converted: boolean;
  status: "active" | "at-risk" | "churned" | "new";
  consistencyLast14: number;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  atRiskUsers: number;
  churnedUsers: number;
  newUsers: number;
  conversionRate: number;
  avgCheckInsLast7: number;
  avgArticlesRead: number;
  coachingViewRate: number;
  day14ReachedCount: number;
  day14ConvertedCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.floor(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

function getUserStatus(u: Partial<UserSummary>): UserSummary["status"] {
  if (!u.firstCheckinDate) return "new";
  if (u.accountAgeDays! <= 3) return "new";
  if (u.lastCheckInDate && daysBetween(u.lastCheckInDate, today()) <= 2) return "active";
  if (u.lastCheckInDate && daysBetween(u.lastCheckInDate, today()) <= 7) return "at-risk";
  return "churned";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RetentionDashboard() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sortBy, setSortBy] = useState<keyof UserSummary>("accountAgeDays");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "active" | "at-risk" | "churned" | "new">("all");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  useEffect(() => {
    ensureAuthPersistence().then(() => {
      const unsub = onAuthStateChanged(auth, (user) => {
        if (!user) { window.location.href = "/login"; return; }
        if (user.email !== "dsimpsonj@gmail.com") { window.location.href = "/dashboard"; return; }
        setAuthorized(true);
      });
      return () => unsub();
    });
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadDashboard();
  }, [authorized]);

  async function loadDashboard() {
    setLoading(true);
    setProgress(0);

    const todayStr = today();
    const sevenDaysAgo = nDaysAgo(7);
    const fourteenDaysAgo = nDaysAgo(14);

    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const total = usersSnap.docs.length;
      const summaries: UserSummary[] = [];

      for (let i = 0; i < usersSnap.docs.length; i++) {
        const userDoc = usersSnap.docs[i];
        const email = userDoc.id;
        const data = userDoc.data();

        setProgress(Math.round(((i + 1) / total) * 100));
        setProgressLabel(`Loading ${i + 1} of ${total}...`);

        // Skip users without commitment
        if (!data.hasCommitment) continue;

        // Metadata
        let firstCheckinDate: string | null = null;
        try {
          const metaSnap = await getDoc(
            doc(db, "users", email, "metadata", "accountInfo")
          );
          if (metaSnap.exists()) {
            firstCheckinDate = metaSnap.data()?.firstCheckinDate ?? null;
          }
        } catch {}

        const accountAgeDays = firstCheckinDate
          ? Math.floor(daysBetween(firstCheckinDate, todayStr)) + 1
          : 0;

        // Check-ins in last 7 and 14 days
        let checkInsLast7 = 0;
        let checkInsLast14 = 0;
        let totalCheckIns = 0;
        try {
          const momentumSnap = await getDocs(collection(db, "users", email, "momentum"));
          momentumSnap.docs.forEach((d) => {
            const md = d.data();
            if (md.checkinType === "real" && md.checkinCompleted === true) {
              totalCheckIns++;
              if (md.date >= sevenDaysAgo) checkInsLast7++;
              if (md.date >= fourteenDaysAgo) checkInsLast14++;
            }
          });
        } catch {}

        // Coaching viewed
        let hasViewedCoaching = false;
        try {
          const coachingSnap = await getDocs(
            collection(db, "users", email, "weeklySummaries")
          );
          hasViewedCoaching = coachingSnap.docs.some((d) => d.data()?.viewedAt);
        } catch {}

        const articlesRead = Array.isArray(data.readLearnSlugs)
          ? data.readLearnSlugs.length
          : 0;

        const partial: Partial<UserSummary> = {
          firstCheckinDate,
          lastCheckInDate: data.lastCheckInDate ?? null,
          accountAgeDays,
        };

        const status = getUserStatus(partial);
        const consistencyLast14 =
          accountAgeDays >= 14
            ? Math.round((checkInsLast14 / 14) * 100)
            : accountAgeDays > 0
            ? Math.round((checkInsLast14 / accountAgeDays) * 100)
            : 0;

        summaries.push({
          email,
          firstName: data.firstName || data.name || "—",
          firstCheckinDate,
          lastCheckInDate: data.lastCheckInDate ?? null,
          accountAgeDays,
          totalCheckIns,
          checkInsLast7,
          checkInsLast14,
          articlesRead,
          hasViewedCoaching,
          isSubscriber: data.isSubscriber === true,
          trialStartDate: data.trialStartDate ?? null,
          converted: data.isSubscriber === true,
          status,
          consistencyLast14,
        });
      }

      // Compute stats
      const active = summaries.filter((u) => u.status === "active").length;
      const atRisk = summaries.filter((u) => u.status === "at-risk").length;
      const churned = summaries.filter((u) => u.status === "churned").length;
      const newU = summaries.filter((u) => u.status === "new").length;
      const subscribers = summaries.filter((u) => u.converted).length;
      const day14Reached = summaries.filter((u) => u.accountAgeDays >= 14).length;
      const day14Converted = summaries.filter(
        (u) => u.accountAgeDays >= 14 && u.converted
      ).length;

      const avgC7 =
        summaries.length > 0
          ? summaries.reduce((s, u) => s + u.checkInsLast7, 0) / summaries.length
          : 0;
      const avgArt =
        summaries.length > 0
          ? summaries.reduce((s, u) => s + u.articlesRead, 0) / summaries.length
          : 0;
      const coachingViewed = summaries.filter((u) => u.hasViewedCoaching).length;

      setStats({
        totalUsers: summaries.length,
        activeUsers: active,
        atRiskUsers: atRisk,
        churnedUsers: churned,
        newUsers: newU,
        conversionRate: day14Reached > 0 ? (day14Converted / day14Reached) * 100 : 0,
        avgCheckInsLast7: avgC7,
        avgArticlesRead: avgArt,
        coachingViewRate:
          summaries.length > 0 ? (coachingViewed / summaries.length) * 100 : 0,
        day14ReachedCount: day14Reached,
        day14ConvertedCount: day14Converted,
      });

      setUsers(summaries);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSort(col: keyof UserSummary) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  const filtered = users.filter((u) => filter === "all" || u.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "boolean") return sortDir === "asc" ? (av ? 1 : -1) : av ? -1 : 1;
    if (typeof av === "number" && typeof bv === "number")
      return sortDir === "asc" ? av - bv : bv - av;
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const statusColor: Record<string, string> = {
    active: "#22c55e",
    "at-risk": "#f59e0b",
    churned: "#ef4444",
    new: "#60a5fa",
  };

  const statusBg: Record<string, string> = {
    active: "rgba(34,197,94,0.12)",
    "at-risk": "rgba(245,158,11,0.12)",
    churned: "rgba(239,68,68,0.12)",
    new: "rgba(96,165,250,0.12)",
  };

  if (!authorized) return null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#080c14", color: "#e2e8f0", fontFamily: "'DM Mono', 'Courier New', monospace" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#f59e0b", textTransform: "uppercase", marginBottom: 4 }}>Nelson</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.03em" }}>Retention Dashboard</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          <button
            onClick={loadDashboard}
            style={{ fontSize: 11, padding: "6px 14px", backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, color: "#f59e0b", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 20 }}>
          <div style={{ fontSize: 13, color: "#64748b", letterSpacing: "0.1em" }}>{progressLabel || "Initializing..."}</div>
          <div style={{ width: 280, height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
            <div style={{ height: 3, width: `${progress}%`, backgroundColor: "#f59e0b", borderRadius: 2, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ fontSize: 11, color: "#334155" }}>{progress}%</div>
        </div>
      ) : (
        <div style={{ padding: "28px 32px" }}>

          {/* Stat Cards */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
              {[
                { label: "Total Users", value: stats.totalUsers, color: "#e2e8f0" },
                { label: "Active", value: stats.activeUsers, color: "#22c55e", sub: `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}%` },
                { label: "At Risk", value: stats.atRiskUsers, color: "#f59e0b", sub: `${Math.round((stats.atRiskUsers / stats.totalUsers) * 100)}%` },
                { label: "Churned", value: stats.churnedUsers, color: "#ef4444", sub: `${Math.round((stats.churnedUsers / stats.totalUsers) * 100)}%` },
                { label: "New (≤3d)", value: stats.newUsers, color: "#60a5fa" },
                { label: "Day 14 Conv.", value: `${stats.conversionRate.toFixed(1)}%`, color: "#a78bfa", sub: `${stats.day14ConvertedCount}/${stats.day14ReachedCount}` },
                { label: "Avg Check-ins/7d", value: stats.avgCheckInsLast7.toFixed(1), color: "#e2e8f0" },
                { label: "Coaching View %", value: `${stats.coachingViewRate.toFixed(0)}%`, color: "#f59e0b" },
                { label: "Avg Articles Read", value: stats.avgArticlesRead.toFixed(1), color: "#e2e8f0" },
              ].map((s) => (
                <div key={s.label} style={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Filter Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["all", "active", "at-risk", "churned", "new"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 5,
                  border: filter === f ? `1px solid ${f === "all" ? "#475569" : statusColor[f]}` : "1px solid rgba(255,255,255,0.07)",
                  backgroundColor: filter === f ? (f === "all" ? "rgba(71,85,105,0.2)" : statusBg[f]) : "transparent",
                  color: filter === f ? (f === "all" ? "#94a3b8" : statusColor[f]) : "#475569",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {f} {f !== "all" && stats ? `(${stats[`${f === "at-risk" ? "atRisk" : f === "new" ? "new" : f}Users` as keyof DashboardStats]})` : ""}
              </button>
            ))}
            <div style={{ marginLeft: "auto", fontSize: 11, color: "#334155", alignSelf: "center" }}>{sorted.length} users</div>
          </div>

          {/* Table */}
          <div style={{ backgroundColor: "#0b1120", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {[
                      { key: "status", label: "Status" },
                      { key: "firstName", label: "Name" },
                      { key: "email", label: "Email" },
                      { key: "accountAgeDays", label: "Age (d)" },
                      { key: "totalCheckIns", label: "Total CI" },
                      { key: "checkInsLast7", label: "CI/7d" },
                      { key: "consistencyLast14", label: "14d %" },
                      { key: "articlesRead", label: "Articles" },
                      { key: "hasViewedCoaching", label: "Coaching" },
                      { key: "converted", label: "Subscriber" },
                      { key: "lastCheckInDate", label: "Last CI" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key as keyof UserSummary)}
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          color: sortBy === col.key ? "#f59e0b" : "#475569",
                          fontWeight: 500,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontSize: 10,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          userSelect: "none",
                        }}
                      >
                        {col.label} {sortBy === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((u, i) => (
                    <tr
                      key={u.email}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                        backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      }}
                    >
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 4,
                          backgroundColor: statusBg[u.status],
                          color: statusColor[u.status],
                          border: `1px solid ${statusColor[u.status]}30`,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}>
                          {u.status}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", color: "#cbd5e1" }}>{u.firstName}</td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: 11 }}>{u.email}</td>
                      <td style={{ padding: "9px 14px", color: u.accountAgeDays >= 14 ? "#a78bfa" : "#e2e8f0", fontWeight: u.accountAgeDays >= 14 ? 600 : 400 }}>{u.accountAgeDays}</td>
                      <td style={{ padding: "9px 14px", color: "#e2e8f0" }}>{u.totalCheckIns}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ color: u.checkInsLast7 >= 5 ? "#22c55e" : u.checkInsLast7 >= 3 ? "#f59e0b" : "#ef4444" }}>
                          {u.checkInsLast7}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 48, height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: 4, width: `${Math.min(u.consistencyLast14, 100)}%`, backgroundColor: u.consistencyLast14 >= 70 ? "#22c55e" : u.consistencyLast14 >= 40 ? "#f59e0b" : "#ef4444", borderRadius: 2 }} />
                          </div>
                          <span style={{ color: "#94a3b8", fontSize: 11 }}>{u.consistencyLast14}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "9px 14px", color: u.articlesRead >= 3 ? "#22c55e" : u.articlesRead >= 1 ? "#f59e0b" : "#ef4444" }}>{u.articlesRead}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ color: u.hasViewedCoaching ? "#22c55e" : "#ef4444", fontSize: 11 }}>
                          {u.hasViewedCoaching ? "Yes" : "No"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ color: u.converted ? "#a78bfa" : "#475569", fontSize: 11 }}>
                          {u.converted ? "✓" : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", color: "#475569", fontSize: 11 }}>
                        {u.lastCheckInDate
                          ? (() => {
                              const d = daysBetween(u.lastCheckInDate!, today());
                              return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
                            })()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 16, display: "flex", gap: 20, fontSize: 10, color: "#334155", letterSpacing: "0.08em" }}>
            <span><span style={{ color: "#22c55e" }}>●</span> ACTIVE — checked in within 2 days</span>
            <span><span style={{ color: "#f59e0b" }}>●</span> AT-RISK — last CI 3–7 days ago</span>
            <span><span style={{ color: "#ef4444" }}>●</span> CHURNED — no CI in 7+ days</span>
            <span><span style={{ color: "#60a5fa" }}>●</span> NEW — account age ≤ 3 days</span>
          </div>

        </div>
      )}
    </div>
  );
}