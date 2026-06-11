"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, MessageCircle, Send, Sparkles, X } from "lucide-react";
import type { AnalysisResult, IssueGroup } from "@/lib/log-parser";
import { answerLogQuestion } from "@/lib/log-assistant";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  issueFingerprints?: string[];
};

const suggestions = [
  "Tóm tắt tình hình hiện tại",
  "Lỗi nào lặp lại nhiều nhất?",
  "Component nào cần ưu tiên?",
  "Lỗi nằm ở file và dòng nào?",
];

export function LogAssistant({ result, onSelectIssue }: { result: AnalysisResult; onSelectIssue: (issue: IssueGroup) => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 1,
    role: "assistant",
    text: "Tôi có thể giúp đọc dữ liệu log đang hiển thị, tìm lỗi lặp lại, component cần ưu tiên và vị trí file/dòng.",
  }]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  function ask(value: string) {
    const text = value.trim();
    if (!text) return;
    const answer = answerLogQuestion(text, result);
    const id = Date.now();
    setMessages((current) => [...current, { id, role: "user", text }, { id: id + 1, role: "assistant", ...answer }]);
    setQuestion("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  function selectIssue(fingerprint: string) {
    const issue = result.issues.find((item) => item.fingerprint === fingerprint);
    if (!issue) return;
    setOpen(false);
    onSelectIssue(issue);
  }

  return <>
    <button className={`assistant-launcher ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={open ? "Đóng trợ lý log" : "Mở trợ lý log"} title="Trợ lý điều tra log">
      {open ? <X size={20} /> : <MessageCircle size={21} />}<span>Chat cùng me</span>
    </button>
    {open && <div className="assistant-backdrop" onMouseDown={() => setOpen(false)}><aside className="assistant-drawer" role="dialog" aria-modal="true" aria-label="Trợ lý điều tra log" onMouseDown={(event) => event.stopPropagation()}>
      <header className="assistant-head"><span><Bot size={20} /></span><div><small>Signal assistant</small><h2>Trợ lý điều tra log</h2><p>Đang dùng dữ liệu trong phạm vi Tổng quan hiện tại</p></div><button onClick={() => setOpen(false)} aria-label="Đóng trợ lý"><X size={18} /></button></header>
      <div className="assistant-context"><Sparkles size={14} /><span>{result.fileName}</span><i>{result.issues.length} nhóm sự cố</i></div>
      <div className="assistant-messages">{messages.map((message) => <article key={message.id} className={`assistant-message ${message.role}`}>
        {message.role === "assistant" && <span className="assistant-avatar"><Bot size={14} /></span>}
        <div><p>{message.text}</p>{message.issueFingerprints?.length ? <section className="assistant-issues">{message.issueFingerprints.slice(0, 5).map((fingerprint) => {
          const issue = result.issues.find((item) => item.fingerprint === fingerprint);
          return issue && <button key={fingerprint} onClick={() => selectIssue(fingerprint)}><span><b>{issue.title}</b><small>{issue.component} · {issue.count.toLocaleString("vi-VN")} lần</small></span><ChevronRight size={15} /></button>;
        })}</section> : null}</div>
      </article>)}<div ref={endRef} /></div>
      <div className="assistant-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
      <form className="assistant-input" onSubmit={submit}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Hỏi về lỗi, component, file, dòng log..." autoFocus /><button disabled={!question.trim()} aria-label="Gửi câu hỏi"><Send size={17} /></button></form>
      <footer>Câu trả lời dựa trên dữ liệu đã parse và có thể kiểm chứng bằng chi tiết issue.</footer>
    </aside></div>}
  </>;
}
