"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bell, ChevronRight, FileSearch, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppSidebar } from "@/components/app-sidebar";
import { IssueDetailDrawer } from "@/components/issue-detail-drawer";
import { ThemeMenu } from "@/components/theme-menu";
import { AnalysisHistoryEntry, AnomalyStatus, createSessionTrend, detectAnomalies } from "@/lib/anomaly-detection";
import type { IssueGroup } from "@/lib/log-parser";

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const statusInfo: Record<AnomalyStatus, { label: string; description: string; color: string }> = {
  NEW: { label: "Lỗi mới", description: "Chưa từng có trong baseline", color: "#7f6ab0" },
  SPIKE: { label: "Tăng đột biến", description: "Cao hơn baseline có ý nghĩa", color: "#d24c3f" },
  RECURRING: { label: "Tái diễn", description: "Biến mất rồi xuất hiện lại", color: "#e68b2c" },
  NORMAL: { label: "Bình thường", description: "Nằm trong vùng baseline", color: "#126b52" },
};

export function AnomalyDashboard() {
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [baselineSize, setBaselineSize] = useState(7);
  const [filter, setFilter] = useState<AnomalyStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFingerprint, setSelectedFingerprint] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analysis-history", { cache: "no-store" });
      if (!response.ok) throw new Error("Không thể tải lịch sử phân tích.");
      const payload = await response.json() as { history: AnalysisHistoryEntry[] };
      setHistory(payload.history);
      setCurrentId((value) => value && payload.history.some((entry) => entry.id === value) ? value : payload.history[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => { setSelectedFingerprint(""); }, [currentId]);

  const currentIndex = history.findIndex((entry) => entry.id === currentId);
  const current = history[currentIndex];
  const olderSessions = currentIndex >= 0 ? history.slice(currentIndex + 1) : [];
  const baseline = olderSessions.slice(0, baselineSize);
  const anomalies = useMemo(() => current && baseline.length ? detectAnomalies(current, baseline) : [], [current, baseline]);
  const visibleRows = anomalies.filter((row) => filter === "ALL" || row.status === filter);
  const trend = createSessionTrend(current ? [current, ...baseline] : []);
  const counts = anomalies.reduce((summary, row) => ({ ...summary, [row.status]: summary[row.status] + 1 }), { NEW: 0, SPIKE: 0, RECURRING: 0, NORMAL: 0 });
  const selectedRow = anomalies.find((row) => row.fingerprint === selectedFingerprint);
  const selectedIssue = current?.result.issues?.find((issue) => issue.fingerprint === selectedFingerprint);

  return (
    <div className="shell">
      <AppSidebar />
      <main className="main">
        <header className="topbar">
          <div className="crumb">Signal / <b>Phân tích log</b></div>
          <div className="top-actions"><button className="icon-btn" onClick={refresh} title="Làm mới"><RefreshCw size={16} /></button><ThemeMenu /><button className="icon-btn" aria-label="Thông báo"><Bell size={16} /></button><div className="avatar">HL</div></div>
        </header>
        <div className="content">
          <section className="hero analysis-hero">
            <div><div className="eyebrow">Baseline intelligence</div><h1>Phát hiện lỗi mới và bất thường</h1><p>So sánh một phiên phân tích với lịch sử để tìm tín hiệu cần điều tra trước.</p></div>
          </section>

          <section className="analysis-controls panel">
            <div className="control-intro"><span><Sparkles size={18} /></span><div><b>Thiết lập phép so sánh</b><small>Baseline chỉ sử dụng các phiên cũ hơn phiên đang kiểm tra.</small></div></div>
            <label><span>Phiên cần kiểm tra</span><select value={currentId} onChange={(event) => setCurrentId(event.target.value)}>{history.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {formatDate(entry.createdAt)}</option>)}</select></label>
            <label><span>Số phiên baseline</span><select value={baselineSize} onChange={(event) => setBaselineSize(Number(event.target.value))}>{[3, 5, 7, 10, 20].map((size) => <option key={size} value={size}>{size} phiên gần nhất</option>)}</select></label>
          </section>

          {loading ? <AnalysisState icon={<RefreshCw className="analysis-spin" />} title="Đang đọc lịch sử phân tích" text="Hệ thống đang chuẩn bị baseline..." /> :
            error ? <AnalysisState icon={<AlertTriangle />} title="Không thể phân tích baseline" text={error} action={<button onClick={refresh}>Thử lại</button>} /> :
              history.length < 2 ? <AnalysisState icon={<FileSearch />} title="Cần ít nhất 2 phiên phân tích" text="Hãy phân tích log ở Tổng quan. Phiên mới nhất sẽ được so sánh với các phiên trước đó." action={<Link href="/">Đi tới Tổng quan</Link>} /> :
                !baseline.length ? <AnalysisState icon={<RotateCcw />} title="Phiên này chưa có baseline" text="Hãy chọn một phiên mới hơn để có dữ liệu lịch sử dùng làm mốc so sánh." /> :
                  <>
                    <section className="anomaly-stats">
                      {(Object.keys(statusInfo) as AnomalyStatus[]).map((status) => <button key={status} className={`anomaly-stat ${filter === status ? "active" : ""}`} style={{ "--status": statusInfo[status].color } as React.CSSProperties} onClick={() => setFilter(filter === status ? "ALL" : status)}>
                        <span className="anomaly-stat-top"><i /><b>{statusInfo[status].label}</b></span><strong>{counts[status]}</strong><small>{statusInfo[status].description}</small>
                      </button>)}
                    </section>

                    <section className="analysis-grid">
                      <div className="panel baseline-panel">
                        <div className="panel-head"><div><h2 className="panel-title">Diễn biến số lỗi</h2><div className="panel-subtitle">{baseline.length} phiên baseline và phiên đang kiểm tra</div></div><BarChart3 size={17} color="#69736f" /></div>
                        <div className="baseline-chart"><ResponsiveContainer minWidth={0} minHeight={250}><BarChart data={trend}><CartesianGrid stroke="#edf0ee" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#78837f" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#78837f" }} width={38} /><Tooltip contentStyle={{ border: "1px solid #e3e8e5", borderRadius: 9, fontSize: 11 }} /><Bar dataKey="errors" name="Lỗi" fill="#d24c3f" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
                      </div>
                      <div className="panel method-panel">
                        <div className="panel-head"><div><h2 className="panel-title">Cách hệ thống đánh giá</h2><div className="panel-subtitle">Quy tắc minh bạch, có thể kiểm chứng</div></div><Activity size={17} color="#69736f" /></div>
                        <Method number="01" title="Lỗi mới" text="Fingerprint chưa xuất hiện trong baseline và có từ 2 lần trở lên." />
                        <Method number="02" title="Tăng đột biến" text="Số lần hiện tại ≥ 2 lần trung bình và z-score ≥ 2." />
                        <Method number="03" title="Tái diễn" text="Không có ở phiên baseline gần nhất nhưng đã từng xuất hiện trước đó." />
                      </div>
                    </section>

                    <section className="panel anomaly-panel">
                      <div className="panel-head"><div><h2 className="panel-title">Tín hiệu cần điều tra</h2><div className="panel-subtitle">Sắp xếp theo mức bất thường và độ lệch khỏi baseline</div></div><div className="filters"><button className={`filter ${filter === "ALL" ? "active" : ""}`} onClick={() => setFilter("ALL")}>Tất cả</button>{(Object.keys(statusInfo) as AnomalyStatus[]).filter((status) => status !== "NORMAL").map((status) => <button key={status} className={`filter ${filter === status ? "active" : ""}`} onClick={() => setFilter(status)}>{statusInfo[status].label}</button>)}</div></div>
                      <div className="table-wrap"><table className="anomaly-table"><thead><tr><th>Sự cố</th><th>Trạng thái</th><th>Hiện tại</th><th>Baseline TB</th><th>Thay đổi</th><th>Z-score</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.fingerprint} className="clickable-row" tabIndex={0} onClick={() => setSelectedFingerprint(row.fingerprint)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedFingerprint(row.fingerprint); }}><td className="issue-name"><b>{row.title}</b><span>{row.component} · {row.category}</span></td><td><span className="status-chip" style={{ "--status": statusInfo[row.status].color } as React.CSSProperties}>{statusInfo[row.status].label}</span></td><td className="count">{numberFormat.format(row.currentCount)}</td><td>{numberFormat.format(row.baselineMean)}</td><td className={row.changePercent && row.changePercent > 0 ? "trend-up" : "trend-flat"}>{formatChange(row.changePercent)}</td><td><span className="z-score">{numberFormat.format(row.zScore)}</span></td><td><ChevronRight size={16} color="#8a9490" /></td></tr>)}</tbody></table></div>
                      {!visibleRows.length && <div className="empty"><Activity size={28} /><b>Không có tín hiệu phù hợp</b><span>Thử chọn bộ lọc khác để xem dữ liệu.</span></div>}
                    </section>
                  </>}
        </div>
      </main>
      {selectedIssue && selectedRow && <IssueDetailDrawer
        issue={restoreIssue(selectedIssue)}
        sourceFiles={current?.result.sourceFiles?.map((file) => file.name)}
        insight={{ statusLabel: statusInfo[selectedRow.status].label, statusColor: statusInfo[selectedRow.status].color, baselineMean: selectedRow.baselineMean, changePercent: selectedRow.changePercent, zScore: selectedRow.zScore }}
        onClose={() => setSelectedFingerprint("")}
      />}
    </div>
  );
}

function AnalysisState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return <section className="analysis-state panel"><span>{icon}</span><h2>{title}</h2><p>{text}</p>{action && <div className="analysis-state-action">{action}</div>}</section>;
}

function Method({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="method-row"><span>{number}</span><div><b>{title}</b><p>{text}</p></div></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatChange(value: number | null) {
  if (value === null) return "Mới";
  return `${value > 0 ? "+" : ""}${numberFormat.format(value)}%`;
}

function restoreIssue(issue: IssueGroup): IssueGroup {
  return {
    ...issue,
    firstSeen: new Date(issue.firstSeen),
    lastSeen: new Date(issue.lastSeen),
    occurrences: (issue.occurrences || []).map((event) => ({ ...event, timestamp: new Date(event.timestamp) })),
  };
}
