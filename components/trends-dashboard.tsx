"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, ChevronRight, FileSearch, RefreshCw, Repeat2, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppSidebar } from "@/components/app-sidebar";
import { IssueDetailDrawer } from "@/components/issue-detail-drawer";
import { ThemeMenu } from "@/components/theme-menu";
import type { AnalysisHistoryEntry } from "@/lib/anomaly-detection";
import type { IssueGroup } from "@/lib/log-parser";
import { buildTrendSummary, filterHistoryByDays, type TrendGranularity } from "@/lib/trend-analysis";

type Period = 7 | 30 | 90 | "all";
const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function TrendsDashboard() {
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [period, setPeriod] = useState<Period>(30);
  const [granularity, setGranularity] = useState<TrendGranularity>("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<IssueGroup | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analysis-history", { cache: "no-store" });
      if (!response.ok) throw new Error("Không thể tải lịch sử phân tích.");
      const payload = await response.json() as { history: AnalysisHistoryEntry[] };
      setHistory(payload.history);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  const filteredHistory = useMemo(() => filterHistoryByDays(history, period), [history, period]);
  const summary = useMemo(() => buildTrendSummary(filteredHistory, granularity), [filteredHistory, granularity]);
  const latest = summary.points.at(-1)?.entry;

  return <div className="shell">
    <AppSidebar />
    <main className="main">
      <header className="topbar"><div className="crumb">Signal / <b>Xu hướng</b></div><div className="top-actions"><button className="icon-btn" onClick={refresh} title="Làm mới"><RefreshCw size={16} /></button><ThemeMenu /><button className="icon-btn" aria-label="Thông báo"><Bell size={16} /></button><div className="avatar">HL</div></div></header>
      <div className="content">
        <section className="hero trend-hero"><div><div className="eyebrow">Historical intelligence</div><h1>Xu hướng chất lượng hệ thống</h1><p>Theo dõi biến động lỗi, component bị ảnh hưởng và mức độ tái diễn qua các phiên phân tích.</p></div></section>
        <section className="trend-controls panel">
          <div className="control-intro"><span><TrendingUp size={18} /></span><div><b>Khoảng quan sát</b><small>Mỗi ngày hoặc tuần sử dụng snapshot phân tích mới nhất.</small></div></div>
          <div className="trend-control-group"><span>Thời gian</span><div className="time-presets">{([7, 30, 90, "all"] as Period[]).map((value) => <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{value === "all" ? "Tất cả" : `${value} ngày`}</button>)}</div></div>
          <div className="trend-control-group"><span>Nhóm theo</span><div className="time-presets"><button className={granularity === "day" ? "active" : ""} onClick={() => setGranularity("day")}>Ngày</button><button className={granularity === "week" ? "active" : ""} onClick={() => setGranularity("week")}>Tuần</button></div></div>
        </section>

        {loading ? <TrendState icon={<RefreshCw className="analysis-spin" />} title="Đang tổng hợp xu hướng" text="Hệ thống đang đọc các snapshot lịch sử..." /> :
          error ? <TrendState icon={<AlertTriangle />} title="Không thể tải xu hướng" text={error} action={<button onClick={refresh}>Thử lại</button>} /> :
            !history.length ? <TrendState icon={<FileSearch />} title="Chưa có dữ liệu xu hướng" text="Phân tích log nhiều lần để hệ thống bắt đầu xây dựng lịch sử và xu hướng." action={<Link href="/">Đi tới Tổng quan</Link>} /> :
              <>
                <section className="trend-kpis">
                  <TrendKpi label="Lỗi snapshot mới nhất" value={summary.latestErrors} foot={formatChange(summary.errorChangePercent)} icon={<Activity size={16} />} tone="#d24c3f" />
                  <TrendKpi label="Issue tăng nhanh" value={summary.growingIssues.length} foot="So với snapshot liền trước" icon={<TrendingUp size={16} />} tone="#e68b2c" />
                  <TrendKpi label="Tỷ lệ lỗi tái diễn" value={summary.recurringRate} suffix="%" foot={`${summary.recurringIssues}/${summary.uniqueIssues} fingerprint`} icon={<Repeat2 size={16} />} tone="#7f6ab0" />
                  <TrendKpi label="Snapshot sử dụng" value={summary.points.length} foot={`Nhóm theo ${granularity === "day" ? "ngày" : "tuần"}`} icon={<BarChart3 size={16} />} tone="#126b52" />
                </section>

                <section className="trend-main-grid">
                  <div className="panel trend-chart-panel">
                    <div className="panel-head"><div><h2 className="panel-title">Lỗi theo {granularity === "day" ? "ngày" : "tuần"}</h2><div className="panel-subtitle">Error và cảnh báo từ snapshot mới nhất của mỗi khoảng</div></div><TrendDelta value={summary.errorChangePercent} /></div>
                    {summary.points.length > 1 ? <div className="trend-chart"><ResponsiveContainer minWidth={0} minHeight={280}><AreaChart data={summary.points}><defs><linearGradient id="trendErrorFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d24c3f" stopOpacity=".22" /><stop offset="100%" stopColor="#d24c3f" stopOpacity="0" /></linearGradient></defs><CartesianGrid stroke="#edf0ee" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#78837f" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#78837f" }} width={42} /><Tooltip contentStyle={{ border: "1px solid #e3e8e5", borderRadius: 9, fontSize: 11 }} /><Area type="monotone" dataKey="errors" name="Lỗi" stroke="#d24c3f" strokeWidth={2} fill="url(#trendErrorFill)" /><Area type="monotone" dataKey="warnings" name="Cảnh báo" stroke="#e68b2c" strokeWidth={1.5} fill="transparent" /></AreaChart></ResponsiveContainer></div> : <CompactEmpty title="Cần thêm snapshot ở khoảng thời gian khác" text={`Hiện chỉ có ${summary.points.length} snapshot khi nhóm theo ${granularity === "day" ? "ngày" : "tuần"}.`} />}
                  </div>
                  <div className="panel component-trend-panel">
                    <div className="panel-head"><div><h2 className="panel-title">Lỗi theo component</h2><div className="panel-subtitle">Phân bố tại snapshot mới nhất</div></div><BarChart3 size={17} color="#69736f" /></div>
                    {summary.components.length ? <div className="component-trend-chart"><ResponsiveContainer minWidth={0} minHeight={280}><BarChart data={summary.components.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 18 }}><CartesianGrid stroke="#edf0ee" horizontal={false} /><XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#78837f" }} /><YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#43504b" }} width={58} /><Tooltip contentStyle={{ border: "1px solid #e3e8e5", borderRadius: 9, fontSize: 11 }} /><Bar dataKey="count" name="Lỗi" fill="#397bb6" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div> : <CompactEmpty title="Chưa có dữ liệu component" text="Snapshot mới nhất không chứa lỗi theo component." />}
                  </div>
                </section>

                <section className="panel growth-panel">
                  <div className="panel-head"><div><h2 className="panel-title">Top issue tăng nhanh nhất</h2><div className="panel-subtitle">So sánh snapshot mới nhất với snapshot liền trước</div></div><span className="snapshot-label">{latest?.name || "Chưa xác định"}</span></div>
                  {summary.growingIssues.length ? <div className="growth-list">{summary.growingIssues.map((row, index) => <button key={row.fingerprint} onClick={() => setSelectedIssue(restoreIssue(row.issue))}><span className="growth-rank">{String(index + 1).padStart(2, "0")}</span><span className="growth-copy"><b>{row.title}</b><small>{row.component} · {row.category}</small></span><span className="growth-count"><small>Trước</small><b>{numberFormat.format(row.previousCount)}</b></span><span className="growth-arrow"><ArrowUpRight size={15} />+{numberFormat.format(row.delta)}</span><span className="growth-count"><small>Hiện tại</small><b>{numberFormat.format(row.currentCount)}</b></span><span className="growth-percent">{row.growthPercent === null ? "Mới" : `+${numberFormat.format(row.growthPercent)}%`}</span><ChevronRight size={16} /></button>)}</div> : <CompactEmpty title="Chưa xác định được issue tăng nhanh" text="Cần ít nhất hai snapshot khác khoảng hoặc không có issue nào tăng." />}
                </section>
              </>}
      </div>
    </main>
    {selectedIssue && <IssueDetailDrawer issue={selectedIssue} sourceFiles={latest?.result.sourceFiles?.map((file) => file.name)} onClose={() => setSelectedIssue(null)} />}
  </div>;
}

function TrendKpi({ label, value, suffix = "", foot, icon, tone }: { label: string; value: number; suffix?: string; foot: string; icon: React.ReactNode; tone: string }) {
  return <article className="trend-kpi" style={{ "--tone": tone } as React.CSSProperties}><div><span>{label}</span><i>{icon}</i></div><strong>{numberFormat.format(value)}{suffix}</strong><small>{foot}</small></article>;
}

function TrendDelta({ value }: { value: number | null }) {
  if (value === null) return <span className="trend-delta neutral">Chưa có mốc so sánh</span>;
  const up = value > 0;
  return <span className={`trend-delta ${up ? "up" : "down"}`}>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{numberFormat.format(Math.abs(value))}%</span>;
}

function TrendState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return <section className="analysis-state panel"><span>{icon}</span><h2>{title}</h2><p>{text}</p>{action && <div className="analysis-state-action">{action}</div>}</section>;
}

function CompactEmpty({ title, text }: { title: string; text: string }) {
  return <div className="trend-empty"><BarChart3 size={24} /><b>{title}</b><span>{text}</span></div>;
}

function formatChange(value: number | null) {
  if (value === null) return "Chưa có snapshot so sánh";
  return `${value > 0 ? "+" : ""}${numberFormat.format(value)}% so với mốc trước`;
}

function restoreIssue(issue: IssueGroup): IssueGroup {
  return { ...issue, firstSeen: new Date(issue.firstSeen), lastSeen: new Date(issue.lastSeen), occurrences: (issue.occurrences || []).map((event) => ({ ...event, timestamp: new Date(event.timestamp) })) };
}
