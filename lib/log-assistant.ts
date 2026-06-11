import type { AnalysisResult, IssueGroup } from "@/lib/log-parser";

export interface AssistantAnswer {
  text: string;
  issueFingerprints: string[];
}

const numberFormat = new Intl.NumberFormat("vi-VN");

export function answerLogQuestion(question: string, result: AnalysisResult): AssistantAnswer {
  const query = normalize(question);
  if (!query) return answerSummary(result);

  if (hasAny(query, ["tom tat", "tong quan", "tinh hinh", "hien tai"])) return answerSummary(result);
  if (hasAny(query, ["component", "thanh phan", "module"])) return answerComponents(result);
  if (hasAny(query, ["file", "dong nao", "dong log", "line", "vi tri"])) return answerLocations(result, query);
  if (hasAny(query, ["canh bao", "warning", "alert"])) return answerByLevels(result, ["W", "A"], "cảnh báo");
  if (hasAny(query, ["gan nhat", "moi nhat", "lan cuoi"])) return answerRecent(result);
  if (hasAny(query, ["nhieu nhat", "top loi", "thuong xuyen", "lap lai"])) return answerTopIssues(result);

  const matches = result.issues
    .filter((issue) => normalize(`${issue.title} ${issue.example} ${issue.component} ${issue.category}`).includes(query))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  if (matches.length) return issueListAnswer(`Tìm thấy ${matches.length} nhóm sự cố phù hợp với “${question.trim()}”:`, matches);

  const terms = query.split(/\s+/).filter((term) => term.length > 2);
  const partialMatches = result.issues
    .map((issue) => ({ issue, score: terms.filter((term) => normalize(`${issue.title} ${issue.example} ${issue.component} ${issue.category}`).includes(term)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.issue.count - a.issue.count)
    .slice(0, 5)
    .map((item) => item.issue);
  if (partialMatches.length) return issueListAnswer("Các nhóm sự cố gần nhất với nội dung bạn hỏi:", partialMatches);

  return {
    text: "Tôi chưa tìm thấy dữ liệu phù hợp trong phạm vi đang hiển thị. Hãy thử hỏi về lỗi lặp lại, component, cảnh báo, vị trí file/dòng hoặc yêu cầu tóm tắt.",
    issueFingerprints: [],
  };
}

function answerSummary(result: AnalysisResult): AssistantAnswer {
  const errors = result.levelCounts.E || 0;
  const warnings = (result.levelCounts.W || 0) + (result.levelCounts.A || 0);
  const top = [...result.issues].sort((a, b) => b.count - a.count).slice(0, 3);
  const topText = top.length ? ` Ba nhóm nổi bật: ${top.map((issue) => `${issue.title} (${numberFormat.format(issue.count)} lần)`).join("; ")}.` : "";
  return {
    text: `Phạm vi hiện tại có ${numberFormat.format(result.parsedLines)} sự kiện, ${numberFormat.format(errors)} lỗi, ${numberFormat.format(warnings)} cảnh báo và ${numberFormat.format(result.issues.length)} nhóm sự cố.${topText}`,
    issueFingerprints: top.map((issue) => issue.fingerprint),
  };
}

function answerComponents(result: AnalysisResult): AssistantAnswer {
  const components = result.componentErrors.slice(0, 5);
  if (!components.length) return { text: "Không có component phát sinh lỗi trong phạm vi đang hiển thị.", issueFingerprints: [] };
  const componentNames = new Set(components.map((item) => item.name));
  const issues = result.issues.filter((issue) => componentNames.has(issue.component)).sort((a, b) => b.count - a.count).slice(0, 5);
  return {
    text: `Component cần ưu tiên: ${components.map((item) => `${item.name} (${numberFormat.format(item.count)} lỗi)`).join("; ")}.`,
    issueFingerprints: issues.map((issue) => issue.fingerprint),
  };
}

function answerLocations(result: AnalysisResult, query: string): AssistantAnswer {
  const searchable = result.issues.filter((issue) => normalize(`${issue.title} ${issue.example} ${issue.component} ${issue.category}`).split(/\s+/).some((term) => term.length > 3 && query.includes(term)));
  const candidates = (searchable.length ? searchable : result.issues).filter((issue) => issue.occurrences.length).sort((a, b) => b.count - a.count).slice(0, 4);
  if (!candidates.length) {
    return {
      text: "Phiên này chỉ có dữ liệu tổng hợp nên chưa còn thông tin file và số dòng. Hãy phân tích lại file nguồn tại Tổng quan để xem vị trí chính xác.",
      issueFingerprints: result.issues.slice(0, 3).map((issue) => issue.fingerprint),
    };
  }
  return {
    text: `Một số vị trí có thể kiểm tra ngay: ${candidates.map((issue) => {
      const event = issue.occurrences[0];
      return `${issue.title}: ${event.sourceFile}, dòng ${event.lineNumber}${event.endLine > event.lineNumber ? `–${event.endLine}` : ""}`;
    }).join("; ")}.`,
    issueFingerprints: candidates.map((issue) => issue.fingerprint),
  };
}

function answerByLevels(result: AnalysisResult, levels: string[], label: string): AssistantAnswer {
  const issues = result.issues.filter((issue) => levels.includes(issue.level)).sort((a, b) => b.count - a.count).slice(0, 5);
  const total = levels.reduce((sum, level) => sum + (result.levelCounts[level] || 0), 0);
  if (!issues.length) return { text: `Không có nhóm ${label} trong phạm vi đang hiển thị.`, issueFingerprints: [] };
  return issueListAnswer(`Có ${numberFormat.format(total)} tín hiệu ${label}. Các nhóm cần chú ý:`, issues);
}

function answerTopIssues(result: AnalysisResult): AssistantAnswer {
  const issues = [...result.issues].sort((a, b) => b.count - a.count).slice(0, 5);
  return issues.length ? issueListAnswer("Các lỗi lặp lại thường xuyên nhất:", issues) : { text: "Chưa có nhóm lỗi trong phạm vi đang hiển thị.", issueFingerprints: [] };
}

function answerRecent(result: AnalysisResult): AssistantAnswer {
  const issues = [...result.issues].sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()).slice(0, 5);
  return issues.length ? issueListAnswer("Các nhóm sự cố xuất hiện gần nhất:", issues) : { text: "Chưa có nhóm sự cố trong phạm vi đang hiển thị.", issueFingerprints: [] };
}

function issueListAnswer(intro: string, issues: IssueGroup[]): AssistantAnswer {
  return {
    text: `${intro} ${issues.map((issue) => `${issue.title} (${numberFormat.format(issue.count)} lần, ${issue.component})`).join("; ")}.`,
    issueFingerprints: issues.map((issue) => issue.fingerprint),
  };
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().trim();
}
