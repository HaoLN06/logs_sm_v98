"use client";

import { useEffect, useState } from "react";
import { FileSearch, X } from "lucide-react";
import type { IssueGroup } from "@/lib/log-parser";

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const priorityColor = { Critical: "#d24c3f", High: "#e68b2c", Medium: "#397bb6", Low: "#69736f" };

export interface IssueInsight {
  statusLabel: string;
  statusColor: string;
  baselineMean: number;
  changePercent: number | null;
  zScore: number;
}

export function IssueDetailDrawer({ issue, insight, sourceFiles = [], onClose }: {
  issue: IssueGroup;
  insight?: IssueInsight;
  sourceFiles?: string[];
  onClose: () => void;
}) {
  const [limit, setLimit] = useState(50);
  const occurrences = issue.occurrences.slice(0, limit);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);

  return <div className="detail-backdrop" onMouseDown={onClose}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`Chi tiết ${issue.title}`} onMouseDown={(event) => event.stopPropagation()}>
    <div className="detail-head"><div><span className="detail-kicker">{issue.category} · {issue.component}</span><h2>{issue.title}</h2><div className="detail-summary"><span className="badge" style={{ "--badge": priorityColor[issue.priority] } as React.CSSProperties}>{issue.priority}</span><span>{numberFormat.format(issue.count)} lần xuất hiện</span><span>{formatDate(issue.firstSeen)} → {formatDate(issue.lastSeen)}</span></div></div><button className="detail-close" onClick={onClose} aria-label="Đóng chi tiết"><X size={18} /></button></div>
    {insight && <section className="detail-insight">
      <span className="status-chip" style={{ "--status": insight.statusColor } as React.CSSProperties}>{insight.statusLabel}</span>
      <div><small>Hiện tại</small><b>{numberFormat.format(issue.count)}</b></div>
      <div><small>Baseline TB</small><b>{numberFormat.format(insight.baselineMean)}</b></div>
      <div><small>Thay đổi</small><b>{formatChange(insight.changePercent)}</b></div>
      <div><small>Z-score</small><b>{numberFormat.format(insight.zScore)}</b></div>
    </section>}
    <section className="detail-example"><span>Message mẫu</span><pre><code>{issue.example}</code></pre></section>
    {occurrences.length ? <div className="occurrence-list">{occurrences.map((event, index) => <article className="occurrence" key={`${event.sourceFile}-${event.lineNumber}-${index}`}>
      <div className="occurrence-meta"><b>{event.sourceFile}</b><span>Dòng {event.lineNumber}{event.endLine > event.lineNumber ? `–${event.endLine}` : ""}</span><span>{formatFullDate(event.timestamp)}</span><span>PID {event.processId} · Thread {event.threadId}</span></div>
      <pre><code><strong>{event.component} {event.level}</strong> {event.message}{event.continuationLines.length ? `\n${event.continuationLines.join("\n")}` : ""}</code></pre>
    </article>)}</div> : <div className="detail-no-occurrence"><span><FileSearch size={22} /></span><b>Không có dữ liệu dòng log trong lịch sử</b><p>Phiên phân tích chỉ lưu dữ liệu tổng hợp. Mở hoặc phân tích lại file nguồn tại Tổng quan để xem chính xác file và số dòng.</p>{sourceFiles.length > 0 && <div>{sourceFiles.slice(0, 6).map((file) => <i key={file}>{file}</i>)}{sourceFiles.length > 6 && <i>+{sourceFiles.length - 6} file</i>}</div>}</div>}
    {limit < issue.occurrences.length && <button className="load-more" onClick={() => setLimit((value) => value + 50)}>Hiển thị thêm 50 occurrence</button>}
  </aside></div>;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(date));
}

function formatChange(value: number | null) {
  if (value === null) return "Mới";
  return `${value > 0 ? "+" : ""}${numberFormat.format(value)}%`;
}
