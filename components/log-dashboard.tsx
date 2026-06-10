"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Bell, Check, CheckCircle2, ChevronLeft, ChevronRight, FileSearch, FileText,
  Clock3, FolderOpen, Gauge, History, ListFilter, LoaderCircle, RefreshCw, Search,
  ShieldAlert, Trash2, Upload, X, XCircle,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppSidebar } from "@/components/app-sidebar";
import { IssueDetailDrawer } from "@/components/issue-detail-drawer";
import { ThemeMenu } from "@/components/theme-menu";
import { AnalysisResult, IssueGroup } from "@/lib/log-parser";
import { filterAnalysisByPreset, filterAnalysisByRange, restoreTimeBuckets, TIME_PRESETS, TimePreset } from "@/lib/time-filter";
import { bucketTimeline, BUCKET_INTERVALS, BucketInterval } from "@/lib/time-buckets";

const demo: AnalysisResult = {
  fileName: "sm-13083.log",
  sourceFiles: [{ name: "sm-13083.log", size: 3611710 }],
  fileSize: 3611710,
  totalLines: 27170,
  parsedLines: 26033,
  continuationLines: 1137,
  events: [],
  levelCounts: { I: 19112, E: 5210, W: 885, D: 436, A: 390 },
  componentErrors: [{ name: "JS", count: 4191 }, { name: "RTE", count: 1015 }, { name: "RAD", count: 4 }],
  timeline: [
    { time: "10:00", errors: 607, warnings: 45, alerts: 24 }, { time: "11:00", errors: 1274, warnings: 139, alerts: 76 },
    { time: "12:00", errors: 210, warnings: 24, alerts: 2 }, { time: "13:00", errors: 426, warnings: 86, alerts: 37 },
    { time: "14:00", errors: 1026, warnings: 95, alerts: 96 }, { time: "15:00", errors: 1052, warnings: 195, alerts: 60 },
    { time: "16:00", errors: 615, warnings: 301, alerts: 95 },
  ],
  timeBuckets: [],
  issues: [
    makeIssue("Không thể gán thuộc tính trên SCFile", "Data model", "JS", "E", "Critical", 1909, "SetProperty() called on Object {address} of class SCFile(...)"),
    makeIssue("Field không tồn tại trong schema", "Schema", "RTE", "E", "Critical", 653, 'SCFile.setOrderBy called with unknown field "created.at"'),
    makeIssue("PostgreSQL idle-session timeout", "Database", "RTE", "E", "Critical", 495, "FATAL: terminating connection due to idle-session timeout"),
    makeIssue("Vượt giới hạn license: Self Service Ticketing", "License", "JRTE", "W", "Critical", 444, "No license for module ( Self Service Ticketing )"),
    makeIssue("dynamicFormGenerator: from is null", "JavaScript", "JS", "E", "Critical", 431, "JSScript 'dynamicFormGenerator' line 1768: TypeError: from is null"),
  ],
  firstSeen: demoDate(10),
  lastSeen: demoDate(16),
};

type FolderFile = { name: string; size: number; modifiedAt: string };
type HistoryEntry = { id: string; name: string; createdAt: string; result: unknown };
type ToastMessage = { id: number; tone: "success" | "error"; title: string; message: string };
type SortKey = "title" | "priority" | "component" | "count" | "lastSeen";
type SortDirection = "asc" | "desc";
type SignalDrilldown = "errors" | "warnings";
const numberFormat = new Intl.NumberFormat("vi-VN");
const priorityColor = { Critical: "#d24c3f", High: "#e68b2c", Medium: "#397bb6", Low: "#69736f" };
const priorityRank = { Critical: 4, High: 3, Medium: 2, Low: 1 };

export function LogDashboard() {
  const [fullResult, setFullResult] = useState<AnalysisResult>(demo);
  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [bucketInterval, setBucketInterval] = useState<BucketInterval>("15m");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("All");
  const [folderFiles, setFolderFiles] = useState<FolderFile[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<IssueGroup | null>(null);
  const [signalDrilldown, setSignalDrilldown] = useState<SignalDrilldown | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [query, setQuery] = useState("");
  const [componentFilter, setComponentFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [deleteTargets, setDeleteTargets] = useState<HistoryEntry[]>([]);
  const [deletingHistoryIds, setDeletingHistoryIds] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const result = useMemo(() => {
    if (timePreset !== "all") return filterAnalysisByPreset(fullResult, timePreset);
    if (customStart && customEnd) return filterAnalysisByRange(fullResult, new Date(customStart), new Date(customEnd));
    return fullResult;
  }, [fullResult, timePreset, customStart, customEnd]);

  useEffect(() => { refreshFolderFiles(); refreshHistory(); }, []);
  useEffect(() => {
    if (!showHistory) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleteTargets.length) setDeleteTargets([]);
      else closeHistory();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", close);
    };
  }, [showHistory, deleteTargets]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredIssues = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const normalizedQuery = query.trim().toLowerCase();
    return [...result.issues]
      .filter((issue) => filter === "All" || issue.priority === filter)
      .filter((issue) => componentFilter === "All" || issue.component === componentFilter)
      .filter((issue) => levelFilter === "All" || issue.level === levelFilter)
      .filter((issue) => !normalizedQuery || `${issue.title} ${issue.example} ${issue.component} ${issue.category}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => compareIssues(a, b, sortKey) * direction)
  }, [result, filter, componentFilter, levelFilter, query, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(filteredIssues.length / pageSize));
  const visibleIssues = filteredIssues.slice((page - 1) * pageSize, page * pageSize);
  const componentOptions = useMemo(() => [...new Set(result.issues.map((issue) => issue.component))].sort(), [result]);
  const levelOptions = useMemo(() => [...new Set(result.issues.map((issue) => issue.level))].sort(), [result]);
  const warningSignals = (result.levelCounts.W || 0) + (result.levelCounts.A || 0);

  useEffect(() => { setPage(1); }, [filter, componentFilter, levelFilter, query, pageSize, result]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  async function refreshFolderFiles() {
    try {
      const response = await fetch("/api/log-files");
      const data = await response.json() as { files: FolderFile[] };
      setFolderFiles(data.files);
      setSelectedNames((selected) => selected.filter((name) => data.files.some((file) => file.name === name)));
    } catch {
      setSourceError("Không thể tải danh sách file trong logs_files.");
    }
  }

  async function refreshHistory() {
    try {
      const response = await fetch("/api/analysis-history");
      const data = await response.json() as { history: HistoryEntry[] };
      setHistory(data.history);
      setSelectedHistoryIds((selected) => selected.filter((id) => data.history.some((entry) => entry.id === id)));
    } catch {
      setSourceError("Không thể tải lịch sử phân tích.");
    }
  }

  async function analyzeFiles(files: { name: string; size: number; text: string }[]) {
    const analysis = await parseInWorker(files);
    setFullResult(analysis);
    setTimePreset("all");
    setCustomStart("");
    setCustomEnd("");
    setSelectedIssue(null);
    setSignalDrilldown(null);
    await saveAnalysisHistory(analysis);
  }

  async function saveAnalysisHistory(analysis: AnalysisResult) {
    const summary = {
      ...analysis,
      events: [],
      issues: analysis.issues.map((issue) => ({ ...issue, occurrences: issue.occurrences.slice(0, 20) })),
    };
    try {
      const response = await fetch("/api/analysis-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: analysis.fileName, result: summary }),
      });
      if (response.ok) await refreshHistory();
    } catch {
      setSourceError("Phân tích thành công nhưng chưa thể lưu lịch sử.");
    }
  }

  async function removeHistory() {
    if (!deleteTargets.length || deletingHistoryIds.length) return;
    const ids = deleteTargets.map((entry) => entry.id);
    setDeletingHistoryIds(ids);
    try {
      const response = await fetch("/api/analysis-history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Delete failed");
      await refreshHistory();
      showToast(
        "success",
        deleteTargets.length > 1 ? `Đã xóa ${deleteTargets.length} phiên` : "Đã xóa lịch sử",
        deleteTargets.length > 1 ? "Các phiên phân tích đã chọn đã được xóa thành công." : `Phiên “${deleteTargets[0].name}” đã được xóa thành công.`,
      );
      setDeleteTargets([]);
    } catch {
      showToast("error", "Không thể xóa lịch sử", "Có lỗi xảy ra khi xóa phiên phân tích. Vui lòng thử lại.");
    } finally {
      setDeletingHistoryIds([]);
    }
  }

  function closeHistory() {
    setShowHistory(false);
    setSelectedHistoryIds([]);
  }

  function toggleHistorySelection(id: string) {
    setSelectedHistoryIds((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function toggleAllHistory() {
    setSelectedHistoryIds((selected) => selected.length === history.length ? [] : history.map((entry) => entry.id));
  }

  function showToast(tone: ToastMessage["tone"], title: string, message: string) {
    setToast({ id: Date.now(), tone, title, message });
  }

  function openHistory(entry: HistoryEntry) {
    setFullResult(restoreAnalysis(entry.result));
    setTimePreset("all");
    setCustomStart("");
    setCustomEnd("");
    setSelectedIssue(null);
    setSignalDrilldown(null);
    closeHistory();
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    setLoading(true);
    setSourceError("");
    try {
      const inputs = await Promise.all(files.map(async (file) => ({ name: file.name, size: file.size, text: await file.text() })));
      await analyzeFiles(inputs);
    } catch {
      setSourceError("Không thể phân tích các file đã tải lên.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  async function analyzeFolderFiles() {
    if (!selectedNames.length) return;
    setLoading(true);
    setSourceError("");
    try {
      const response = await fetch("/api/log-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: selectedNames }),
      });
      if (!response.ok) throw new Error("Read failed");
      const data = await response.json() as { files: { name: string; size: number; text: string }[] };
      await analyzeFiles(data.files);
    } catch {
      setSourceError("Không thể đọc hoặc phân tích file trong logs_files.");
    } finally {
      setLoading(false);
    }
  }

  function toggleFolderFile(name: string) {
    setSelectedNames((selected) => selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name]);
  }

  function changeSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection(key === "title" || key === "component" ? "asc" : "desc");
  }

  function clearIssueFilters() {
    setQuery("");
    setFilter("All");
    setComponentFilter("All");
    setLevelFilter("All");
  }

  return (
    <div className="shell">
      <AppSidebar />
      <main className="main">
        <header className="topbar">
          <div className="crumb">Workspace / <b>Phân tích tổng quan</b></div>
          <div className="top-actions"><button className="icon-btn" aria-label="Tìm kiếm"><Search size={16} /></button><ThemeMenu /><button className="icon-btn" aria-label="Thông báo"><Bell size={16} /></button><div className="avatar">HL</div></div>
        </header>
        <div className="content">
          <section className="hero"><div><h1>Tình trạng hệ thống</h1>
          {/* <p>Chọn nguồn log, sau đó hệ thống sẽ chuẩn hóa và nhóm các sự cố tương tự.</p> */}
          </div>
          <button className="history-toggle" onClick={() => setShowHistory((value) => !value)}><History size={15} />Lịch sử <span>{history.length}</span></button></section>

          <section className="source-grid">
            <div className="source-card">
              <div className="source-heading">
                <span className="source-icon"><FolderOpen size={18} /></span>
                <div><b>File trong logs_files</b><span>Chọn một hoặc nhiều file có sẵn</span></div>
                <div className="source-tools">
                  {!!folderFiles.length && <button className="text-action" onClick={() => setSelectedNames(selectedNames.length === folderFiles.length ? [] : folderFiles.map((file) => file.name))}>{selectedNames.length === folderFiles.length ? "Bỏ chọn" : "Chọn tất cả"}</button>}
                  <button className="mini-icon" onClick={refreshFolderFiles} title="Làm mới" aria-label="Làm mới danh sách file"><RefreshCw size={14} /></button>
                </div>
              </div>
              <div className="folder-list">
                {folderFiles.length ? folderFiles.map((file) => (
                  <button key={file.name} className={`folder-file ${selectedNames.includes(file.name) ? "selected" : ""}`} onClick={() => toggleFolderFile(file.name)}>
                    <span className="file-check">{selectedNames.includes(file.name) && <Check size={11} />}</span>
                    <FileText size={13} /><span className="folder-name">{file.name}</span><small>{formatBytes(file.size)}</small>
                  </button>
                )) : <div className="folder-empty">Chưa có file `.log` hoặc `.txt`.</div>}
              </div>
              <button className="source-action" disabled={!selectedNames.length || loading} onClick={analyzeFolderFiles}>
                <FileSearch size={14} />Phân tích {selectedNames.length ? `${selectedNames.length} file` : "file đã chọn"}
              </button>
            </div>

            <div className="source-card upload-source">
              <div className="source-heading"><span className="source-icon"><Upload size={18} /></span><div><b>Tải lên từ máy</b><span>Hỗ trợ chọn đồng thời nhiều file log</span></div></div>
              <label className={`drop-zone ${loading ? "disabled" : ""}`}>
                <Upload size={22} /><b>Chọn nhiều file .log</b><span>Nhấn để duyệt file từ máy của bạn</span>
                <input type="file" accept=".log,.txt" multiple onChange={upload} />
              </label>
            </div>
          </section>

          {sourceError && <div className="source-error">{sourceError}</div>}
          <div className="file-strip">
            <div className="file-info"><FileText size={15} /><span>Đang hiển thị <b>{result.fileName}</b> · {formatBytes(result.fileSize)}</span></div>
            <span>{result.sourceFiles.length} file · {formatDate(result.firstSeen)} → {formatDate(result.lastSeen)}</span>
          </div>

          <TimeRangeToolbar
            preset={timePreset}
            start={customStart}
            end={customEnd}
            min={fullResult.firstSeen}
            max={fullResult.lastSeen}
            disabled={!fullResult.timeBuckets.length}
            onPreset={(value) => { setTimePreset(value); setCustomStart(""); setCustomEnd(""); }}
            onCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); setTimePreset("all"); }}
          />

          <section className="stats">
            <Stat label="Dòng log" value={result.totalLines} foot={`${numberFormat.format(result.parsedLines)} dòng đã parse`} icon={<FileText size={15} />} tone="#397bb6" />
            <Stat label="Lỗi" value={result.levelCounts.E || 0} foot={`${result.parsedLines ? ((result.levelCounts.E || 0) / result.parsedLines * 100).toFixed(1) : 0}% tổng log`} icon={<XCircle size={15} />} tone="#d24c3f" onClick={() => setSignalDrilldown("errors")} />
            <Stat label="Cảnh báo" value={warningSignals} foot={`${numberFormat.format(warningSignals)} tín hiệu cần xem`} icon={<AlertTriangle size={15} />} tone="#e68b2c" onClick={() => setSignalDrilldown("warnings")} />
            <Stat label="Nhóm nguyên nhân" value={result.issues.length} foot={`${result.componentErrors.length} component bị ảnh hưởng`} icon={<ShieldAlert size={15} />} tone="#126b52" />
          </section>

          <section className="grid-main">
            <Timeline result={result} interval={bucketInterval} onInterval={setBucketInterval} />
            <div className="panel"><div className="panel-head"><div><h2 className="panel-title">Lỗi theo component</h2><div className="panel-subtitle">Khu vực cần ưu tiên điều tra</div></div><Gauge size={16} color="#7d8984" /></div>
              <div className="component-list">{result.componentErrors.slice(0, 6).map((item, index) => <ComponentBar key={item.name} {...item} max={result.componentErrors[0]?.count || 1} index={index} />)}</div>
            </div>
          </section>

          <section className="panel issues-panel">
            <IssueToolbar {...{ query, setQuery, componentFilter, setComponentFilter, levelFilter, setLevelFilter, componentOptions, levelOptions, clearIssueFilters }} priorityActive={filter !== "All"} />
            <div className="panel-head"><div><h2 className="panel-title">Nhóm sự cố nổi bật</h2><div className="panel-subtitle">Đã chuẩn hóa dữ liệu động và gộp lỗi tương tự trên tất cả file</div></div><div className="filters">{["All", "Critical", "High", "Medium"].map((value) => <button key={value} className={`filter ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{value === "All" ? "Tất cả" : value}</button>)}</div></div>
            {visibleIssues.length ? <IssueTable issues={visibleIssues} onSelect={setSelectedIssue} sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /> : <div className="empty"><ListFilter size={28} /><b>Không có sự cố phù hợp</b><span>Chọn bộ lọc khác để xem dữ liệu.</span></div>}
            <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={filteredIssues.length} onPage={setPage} onPageSize={setPageSize} />
          </section>
        </div>
      </main>
      {loading && <div className="loading"><div><div className="spinner" /><b>Đang phân tích nhiều file log</b><p>Parser đang chuẩn hóa và nhóm các sự cố...</p></div></div>}
      {showHistory && <HistoryModal history={history} selectedIds={selectedHistoryIds} deletingIds={deletingHistoryIds} onOpen={openHistory} onToggle={toggleHistorySelection} onToggleAll={toggleAllHistory} onDelete={(entry) => setDeleteTargets([entry])} onDeleteSelected={() => setDeleteTargets(history.filter((entry) => selectedHistoryIds.includes(entry.id)))} onClose={closeHistory} />}
      {!!deleteTargets.length && <DeleteHistoryDialog entries={deleteTargets} deleting={deletingHistoryIds.length > 0} onConfirm={removeHistory} onClose={() => setDeleteTargets([])} />}
      {toast && <Toast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
      {signalDrilldown && <SignalDrilldownDrawer type={signalDrilldown} result={result} onSelect={setSelectedIssue} onClose={() => setSignalDrilldown(null)} />}
      {selectedIssue && <IssueDetailDrawer issue={selectedIssue} sourceFiles={result.sourceFiles.map((file) => file.name)} onClose={() => setSelectedIssue(null)} />}
    </div>
  );
}

function HistoryModal({ history, selectedIds, deletingIds, onOpen, onToggle, onToggleAll, onDelete, onDeleteSelected, onClose }: { history: HistoryEntry[]; selectedIds: string[]; deletingIds: string[]; onOpen: (entry: HistoryEntry) => void; onToggle: (id: string) => void; onToggleAll: () => void; onDelete: (entry: HistoryEntry) => void; onDeleteSelected: () => void; onClose: () => void }) {
  const allSelected = history.length > 0 && selectedIds.length === history.length;
  return <div className="history-backdrop" onMouseDown={onClose}><section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" onMouseDown={(event) => event.stopPropagation()}><div className="history-modal-head"><div><span className="history-kicker">Analysis sessions</span><h2 id="history-title">Lịch sử phân tích</h2><p>Mở lại kết quả tổng hợp từ các phiên phân tích trước.</p></div><button className="history-close" onClick={onClose} aria-label="Đóng lịch sử"><X size={18} /></button></div><div className="history-modal-meta"><span><History size={14} />{history.length} phiên đã lưu</span><div className="history-selection-actions"><button className={`history-select-all ${allSelected ? "active" : ""}`} disabled={!history.length || deletingIds.length > 0} onClick={onToggleAll}><i>{allSelected && <Check size={12} strokeWidth={3} />}</i>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</button><button className="history-bulk-delete" disabled={!selectedIds.length || deletingIds.length > 0} onClick={onDeleteSelected}><Trash2 size={14} />Xóa đã chọn {selectedIds.length > 0 && `(${selectedIds.length})`}</button></div></div><div className="history-list">{history.length ? history.map((entry) => {
    const summary = entry.result as Partial<AnalysisResult>;
    const errorCount = summary.levelCounts?.E || 0;
    const deleting = deletingIds.includes(entry.id);
    const selected = selectedIds.includes(entry.id);
    return <article className={`history-item ${selected ? "selected" : ""} ${deleting ? "deleting" : ""}`} key={entry.id}><button className={`history-select ${selected ? "active" : ""}`} disabled={deleting} onClick={() => onToggle(entry.id)} aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${entry.name}`} aria-pressed={selected}>{selected && <Check size={13} strokeWidth={3} />}</button><button className="history-open" disabled={deleting} onClick={() => onOpen(entry)}><span className="history-icon"><FileText size={17} /></span><span className="history-content"><span className="history-title-row"><b>{entry.name}</b><time>{formatFullDate(new Date(entry.createdAt))}</time></span><span className="history-stats"><i>{numberFormat.format(summary.sourceFiles?.length || 0)} file</i><i>{numberFormat.format(summary.parsedLines || 0)} events</i><i className="error">{numberFormat.format(errorCount)} lỗi</i><i>{numberFormat.format(summary.issues?.length || 0)} nhóm</i></span></span><ChevronRight size={17} className="history-chevron" /></button><button className="history-delete" disabled={deleting} onClick={() => onDelete(entry)} aria-label={`Xóa ${entry.name}`} title="Xóa phiên">{deleting ? <LoaderCircle size={15} className="button-spin" /> : <Trash2 size={15} />}</button></article>;
  }) : <div className="history-empty"><span className="history-empty-icon"><History size={24} /></span><b>Chưa có lịch sử phân tích</b><p>Sau khi phân tích file log, kết quả tổng hợp sẽ tự động xuất hiện tại đây.</p></div>}</div></section></div>;
}

function DeleteHistoryDialog({ entries, deleting, onConfirm, onClose }: { entries: HistoryEntry[]; deleting: boolean; onConfirm: () => void; onClose: () => void }) {
  const multiple = entries.length > 1;
  return <div className="confirm-backdrop" onMouseDown={() => { if (!deleting) onClose(); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-history-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="confirm-icon"><Trash2 size={21} /></div>
    <div className="confirm-copy"><span>Xóa lịch sử phân tích</span><h2 id="delete-history-title">{multiple ? `Xóa ${entries.length} phiên đã chọn?` : "Bạn chắc chắn muốn xóa phiên này?"}</h2><p>Thao tác này sẽ xóa dữ liệu tổng hợp khỏi lịch sử và không thể hoàn tác.</p></div>
    <div className="confirm-targets">{entries.slice(0, 3).map((entry) => { const summary = entry.result as Partial<AnalysisResult>; return <div className="confirm-target" key={entry.id}><FileText size={16} /><div><b>{entry.name}</b><span>{formatFullDate(new Date(entry.createdAt))} · {numberFormat.format(summary.issues?.length || 0)} nhóm sự cố</span></div></div>; })}{entries.length > 3 && <span className="confirm-more">và {entries.length - 3} phiên khác</span>}</div>
    <div className="confirm-actions"><button className="confirm-cancel" disabled={deleting} onClick={onClose}>Giữ lại</button><button className="confirm-delete" disabled={deleting} onClick={onConfirm}>{deleting ? <><LoaderCircle size={15} className="button-spin" />Đang xóa...</> : <><Trash2 size={15} />{multiple ? `Xóa ${entries.length} phiên` : "Xóa lịch sử"}</>}</button></div>
  </section></div>;
}

function Toast({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  return <aside className={`toast toast-${toast.tone}`} role="status"><span className="toast-icon">{toast.tone === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}</span><div><b>{toast.title}</b><p>{toast.message}</p></div><button onClick={onClose} aria-label="Đóng thông báo"><X size={15} /></button><i /></aside>;
}

function Timeline({ result, interval, onInterval }: { result: AnalysisResult; interval: BucketInterval; onInterval: (interval: BucketInterval) => void }) {
  const bucketData = useMemo(() => bucketTimeline(result.timeBuckets, interval), [result.timeBuckets, interval]);
  const timeline = bucketData.length ? bucketData : result.timeline;
  return <div className="panel"><div className="panel-head timeline-head"><div><h2 className="panel-title">Tín hiệu theo thời gian</h2><div className="panel-subtitle">{bucketData.length ? `${bucketData.length} khung dữ liệu · tổng hợp theo ${BUCKET_INTERVALS.find((item) => item.value === interval)?.label}` : "Phân bố error, warning và performance alert"}</div></div><div className="timeline-actions"><div className="legend"><span style={{ "--dot": "#d24c3f" } as React.CSSProperties}>Error</span><span style={{ "--dot": "#e68b2c" } as React.CSSProperties}>Warning</span></div><label className="bucket-resolution"><span>Độ phân giải</span><select value={interval} disabled={!result.timeBuckets.length} onChange={(event) => onInterval(event.target.value as BucketInterval)}>{BUCKET_INTERVALS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div></div><div className="chart"><ResponsiveContainer minWidth={0} minHeight={240} initialDimension={{ width: 800, height: 240 }}><AreaChart data={timeline}><defs><linearGradient id="errorFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d24c3f" stopOpacity=".2" /><stop offset="100%" stopColor="#d24c3f" stopOpacity="0" /></linearGradient></defs><CartesianGrid stroke="#edf0ee" vertical={false} /><XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#89918e" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#89918e" }} width={35} /><Tooltip contentStyle={{ border: "1px solid #e3e8e5", borderRadius: 9, fontSize: 11 }} /><Area type="monotone" dataKey="errors" name="Lỗi" stroke="#d24c3f" strokeWidth={2} fill="url(#errorFill)" /><Area type="monotone" dataKey="warnings" name="Cảnh báo" stroke="#e68b2c" strokeWidth={1.5} fill="transparent" /></AreaChart></ResponsiveContainer></div></div>;
}

function TimeRangeToolbar({ preset, start, end, min, max, disabled, onPreset, onCustom }: {
  preset: TimePreset; start: string; end: string; min?: Date; max?: Date;
  disabled: boolean;
  onPreset: (preset: TimePreset) => void; onCustom: (start: string, end: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const activeLabel = start && end ? "Tùy chỉnh" : TIME_PRESETS.find((item) => item.value === preset)?.label;
  return <section className={`time-toolbar panel ${disabled ? "time-disabled" : ""}`}>
    <div className="time-toolbar-title"><span><Clock3 size={17} /></span><div><b>Khoảng thời gian</b><small>{disabled ? "Phân tích file để bật bộ lọc" : `${activeLabel} · tính đến log cuối cùng`}</small></div></div>
    <div className="time-presets">{TIME_PRESETS.map((item) => <button disabled={disabled} key={item.value} className={!start && preset === item.value ? "active" : ""} onClick={() => onPreset(item.value)}>{item.label}</button>)}</div>
    <div className="custom-time-wrap"><button disabled={disabled} className={`custom-time-toggle ${start && end ? "active" : ""}`} onClick={() => {
      if (!showCustom) {
        setDraftStart(start || toDateTimeInput(min));
        setDraftEnd(end || toDateTimeInput(max));
      }
      setShowCustom((value) => !value);
    }}>Tùy chỉnh</button>
      {showCustom && <div className="custom-time-popover">
        <div><b>Chọn khoảng chính xác</b><small>Dữ liệu khả dụng: {formatDate(min)} → {formatDate(max)}</small></div>
        <label><span>Từ</span><input type="datetime-local" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} /></label>
        <label><span>Đến</span><input type="datetime-local" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} /></label>
        <button disabled={!draftStart || !draftEnd || draftStart >= draftEnd} onClick={() => { onCustom(draftStart, draftEnd); setShowCustom(false); }}>Áp dụng</button>
      </div>}
    </div>
  </section>;
}

function SignalDrilldownDrawer({ type, result, onSelect, onClose }: { type: SignalDrilldown; result: AnalysisResult; onSelect: (issue: IssueGroup) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const isError = type === "errors";
  const levels = isError ? ["E"] : ["W", "A"];
  const total = levels.reduce((sum, level) => sum + (result.levelCounts[level] || 0), 0);
  const issues = result.issues
    .filter((issue) => levels.includes(issue.level))
    .filter((issue) => !query.trim() || `${issue.title} ${issue.example} ${issue.component} ${issue.category}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.count - a.count);
  const groupedCount = result.issues.filter((issue) => levels.includes(issue.level)).reduce((sum, issue) => sum + issue.count, 0);
  const tone = isError ? "#d24c3f" : "#e68b2c";

  return <div className="signal-backdrop" onMouseDown={onClose}><aside className="signal-drawer" role="dialog" aria-modal="true" aria-label={`Chi tiết ${isError ? "lỗi" : "cảnh báo"}`} onMouseDown={(event) => event.stopPropagation()}>
    <header className="signal-head" style={{ "--signal-tone": tone } as React.CSSProperties}><div className="signal-head-icon">{isError ? <XCircle size={20} /> : <AlertTriangle size={20} />}</div><div><span>Drill-down tín hiệu</span><h2>Chi tiết {isError ? "Lỗi" : "Cảnh báo"}</h2><p>{formatDate(result.firstSeen)} → {formatDate(result.lastSeen)}</p></div><button onClick={onClose} aria-label="Đóng danh sách"><X size={18} /></button></header>
    <section className="signal-summary">
      <div><small>Tổng tín hiệu</small><b>{numberFormat.format(total)}</b></div>
      <div><small>Đã nhóm vào issue</small><b>{numberFormat.format(groupedCount)}</b></div>
      <div><small>Chưa nhóm</small><b>{numberFormat.format(Math.max(0, total - groupedCount))}</b></div>
      <div><small>Nhóm nguyên nhân</small><b>{numberFormat.format(result.issues.filter((issue) => levels.includes(issue.level)).length)}</b></div>
    </section>
    <div className="signal-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm issue, message, component..." />{query && <button onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={14} /></button>}</div>
    <div className="signal-list">{issues.length ? issues.map((issue) => <button key={issue.fingerprint} className="signal-issue" onClick={() => onSelect(issue)}>
      <span className="signal-level" style={{ "--signal-tone": tone } as React.CSSProperties}>{issue.level}</span><span className="signal-issue-copy"><b>{issue.title}</b><small>{issue.component} · {issue.category}</small><i>{issue.example.slice(0, 135)}</i></span><span className="signal-count">{numberFormat.format(issue.count)}<small>lần</small></span><ChevronRight size={16} />
    </button>) : <div className="signal-empty"><ListFilter size={25} /><b>Không có nhóm sự cố phù hợp</b><span>Thử thay đổi nội dung tìm kiếm.</span></div>}</div>
  </aside></div>;
}

function IssueToolbar({ query, setQuery, componentFilter, setComponentFilter, levelFilter, setLevelFilter, componentOptions, levelOptions, clearIssueFilters, priorityActive }: {
  query: string; setQuery: (value: string) => void;
  componentFilter: string; setComponentFilter: (value: string) => void;
  levelFilter: string; setLevelFilter: (value: string) => void;
  componentOptions: string[]; levelOptions: string[]; clearIssueFilters: () => void; priorityActive: boolean;
}) {
  const hasFilters = query || componentFilter !== "All" || levelFilter !== "All" || priorityActive;
  return <div className="issue-toolbar">
    <label className="issue-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên lỗi, message, component..." />{query && <button onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={14} /></button>}</label>
    <label className="select-filter"><span>Component</span><select value={componentFilter} onChange={(event) => setComponentFilter(event.target.value)}><option value="All">Tất cả</option>{componentOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label className="select-filter"><span>Level</span><select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}><option value="All">Tất cả</option>{levelOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    {hasFilters && <button className="clear-filters" onClick={clearIssueFilters}><X size={13} />Xóa lọc</button>}
  </div>;
}

function IssueTable({ issues, onSelect, sortKey, sortDirection, onSort }: { issues: IssueGroup[]; onSelect: (issue: IssueGroup) => void; sortKey: SortKey; sortDirection: SortDirection; onSort: (key: SortKey) => void }) {
  return <div className="table-wrap"><table><thead><tr><SortableHeader label="Sự cố" field="title" {...{ sortKey, sortDirection, onSort }} /><SortableHeader label="Ưu tiên" field="priority" {...{ sortKey, sortDirection, onSort }} /><SortableHeader label="Component" field="component" {...{ sortKey, sortDirection, onSort }} /><SortableHeader label="Số lần" field="count" {...{ sortKey, sortDirection, onSort }} /><SortableHeader label="Lần cuối" field="lastSeen" {...{ sortKey, sortDirection, onSort }} /><th /></tr></thead><tbody>{issues.map((row) => <tr key={row.fingerprint} className="clickable-row" onClick={() => onSelect(row)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onSelect(row); }}><td className="issue-name"><b>{row.title}</b><span>{row.example.slice(0, 110)}</span></td><td><span className="badge" style={{ "--badge": priorityColor[row.priority] } as React.CSSProperties}>{row.priority}</span></td><td>{row.component} · {row.category}</td><td className="count">{numberFormat.format(row.count)}</td><td>{formatTime(row.lastSeen)}</td><td><ChevronRight size={16} color="#8a9490" /></td></tr>)}</tbody></table></div>;
}

function SortableHeader({ label, field, sortKey, sortDirection, onSort }: { label: string; field: SortKey; sortKey: SortKey; sortDirection: SortDirection; onSort: (key: SortKey) => void }) {
  const active = sortKey === field;
  return <th aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}><button className={`sort-header ${active ? "active" : ""}`} onClick={() => onSort(field)}>{label}{active ? (sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} />}</button></th>;
}

function Pagination({ page, pageCount, pageSize, total, onPage, onPageSize }: { page: number; pageCount: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  const pages = paginationPages(page, pageCount);
  return <div className="pagination"><span>Hiển thị <b>{start}–{end}</b> trong <b>{numberFormat.format(total)}</b> issue</span><div className="page-size"><span>Số dòng</span><select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></div><div className="page-buttons"><button disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={15} /></button>{pages.map((value, index) => value === "..." ? <span key={`dots-${index}`}>…</span> : <button key={value} className={value === page ? "active" : ""} onClick={() => onPage(value)}>{value}</button>)}<button disabled={page === pageCount} onClick={() => onPage(page + 1)} aria-label="Trang sau"><ChevronRight size={15} /></button></div></div>;
}

function Stat({ label, value, foot, icon, tone, onClick }: { label: string; value: number; foot: string; icon: React.ReactNode; tone: string; onClick?: () => void }) {
  const content = <><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{numberFormat.format(value)}</div><div className="stat-foot">{foot}</div>{onClick && <span className="stat-action">Xem chi tiết <ChevronRight size={13} /></span>}</>;
  return onClick ? <button className="stat-card stat-clickable" style={{ "--tone": tone } as React.CSSProperties} onClick={onClick}>{content}</button> : <article className="stat-card" style={{ "--tone": tone } as React.CSSProperties}>{content}</article>;
}
function ComponentBar({ name, count, max, index }: { name: string; count: number; max: number; index: number }) { const colors = ["#d24c3f", "#e68b2c", "#397bb6", "#126b52", "#7f6ab0"]; return <div><div className="component-row-top"><b>{name}</b><span>{numberFormat.format(count)} lỗi</span></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, count / max * 100)}%`, "--bar": colors[index % colors.length] } as React.CSSProperties} /></div></div>; }
function makeIssue(title: string, category: string, component: string, level: string, priority: IssueGroup["priority"], count: number, example: string): IssueGroup { return { title, category, component, level, priority, count, example, fingerprint: title, firstSeen: demoDate(10), lastSeen: demoDate(16), occurrences: [] }; }
function demoDate(hour: number) { return new Date(2026, 5, 8, hour, 0); }
function formatBytes(bytes: number) { return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`; }
function formatDate(date?: Date) { return date ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date) : "Không xác định"; }
function formatTime(date: Date) { return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date); }
function formatFullDate(date: Date) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date); }
function toDateTimeInput(date?: Date) {
  if (!date) return "";
  const value = new Date(date);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
function compareIssues(a: IssueGroup, b: IssueGroup, key: SortKey) {
  if (key === "count") return a.count - b.count;
  if (key === "priority") return priorityRank[a.priority] - priorityRank[b.priority];
  if (key === "lastSeen") return a.lastSeen.getTime() - b.lastSeen.getTime();
  if (key === "component") return `${a.component} ${a.category}`.localeCompare(`${b.component} ${b.category}`);
  return a.title.localeCompare(b.title);
}
function paginationPages(page: number, pageCount: number): (number | "...")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "...", pageCount];
  if (page >= pageCount - 3) return [1, "...", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, "...", page - 1, page, page + 1, "...", pageCount];
}

function parseInWorker(files: { name: string; size: number; text: string }[]) {
  return new Promise<AnalysisResult>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/log-parser.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ result?: AnalysisResult; error?: string }>) => {
      worker.terminate();
      if (event.data.error || !event.data.result) reject(new Error(event.data.error || "Không thể phân tích log."));
      else resolve(event.data.result);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage({ files });
  });
}

function restoreAnalysis(raw: unknown): AnalysisResult {
  const result = raw as AnalysisResult;
  return {
    ...result,
    firstSeen: result.firstSeen ? new Date(result.firstSeen) : undefined,
    lastSeen: result.lastSeen ? new Date(result.lastSeen) : undefined,
    events: [],
    timeBuckets: restoreTimeBuckets(result.timeBuckets),
    issues: result.issues.map((issue) => ({
      ...issue,
      firstSeen: new Date(issue.firstSeen),
      lastSeen: new Date(issue.lastSeen),
      occurrences: (issue.occurrences || []).map((event) => ({ ...event, timestamp: new Date(event.timestamp) })),
    })),
  };
}
