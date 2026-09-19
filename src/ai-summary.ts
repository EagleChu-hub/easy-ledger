// 把本月數字壓成一段純文字，讓使用者貼進自己的 AI（ChatGPT / Gemini / Claude）。
// 不傳完整帳本、不傳原始輸入；只有彙總數字與前幾筆大額支出。
import { categoryLabel, type Category } from './categories';
import { compareCategories, formatSigned, formatTWD, type MonthSummary } from './stats';

export interface QuestionTemplate {
  key: string;
  label: string;
  prompt: string;
}

export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    key: 'overview',
    label: '本月收支摘要',
    prompt: '請用 5 句話以內摘要我本月的收支狀況，指出最值得注意的一件事。',
  },
  {
    key: 'growth',
    label: '哪些分類增加最多',
    prompt: '請比較本月與上月，指出增加最多的分類，並根據資料推測可能原因（推測要標明是推測）。',
  },
  {
    key: 'unusual',
    label: '找出不尋常的消費',
    prompt: '請從前幾筆大額支出與分類變化中，找出可能不尋常或值得我回頭檢查的項目，並說明理由。',
  },
  {
    key: 'saving',
    label: '下月節流建議',
    prompt: '以不影響基本生活為前提，根據我的實際分類金額，給我 3 個下個月可行的節流建議，每個附上預估可省金額。',
  },
];

const RULES = [
  '請只根據上面的實際數字回答，不要編造沒有出現的交易。',
  '請區分「觀察」（資料直接看得出來）與「建議」或「推測」，推測要標明。',
  '金額一律用新台幣，回答用繁體中文。',
].join('\n');

export function buildSummaryText(current: MonthSummary, previous: MonthSummary, categories?: Category[]): string {
  const lines: string[] = [];
  const range = current.firstDate && current.lastDate ? `${current.firstDate} ~ ${current.lastDate}` : current.month;
  lines.push(`【記帳摘要 ${range}，共 ${current.count} 筆】`);
  lines.push(`收入 ${formatTWD(current.income)}｜支出 ${formatTWD(current.expense)}｜結餘 ${formatSigned(current.balance)}`);
  lines.push(`上月（${previous.month}）：收入 ${formatTWD(previous.income)}｜支出 ${formatTWD(previous.expense)}`);

  const cmp = compareCategories(current, previous);
  if (cmp.length > 0) {
    lines.push('');
    lines.push('支出分類（本月 / 上月 / 差額）');
    for (const c of cmp) {
      lines.push(`- ${categoryLabel(c.category, categories)} ${formatTWD(c.current)} / ${formatTWD(c.previous)} / ${formatSigned(c.diff)}`);
    }
  }

  if (current.topExpenses.length > 0) {
    lines.push('');
    lines.push(`本月前 ${current.topExpenses.length} 大單筆支出`);
    for (const t of current.topExpenses) {
      const note = t.note || categoryLabel(t.category, categories);
      lines.push(`- ${t.date.slice(5).replace('-', '/')} ${note} ${formatTWD(t.amount)}`);
    }
  }
  return lines.join('\n');
}

export function buildPrompt(summaryText: string, question: string): string {
  const q = question.trim() || QUESTION_TEMPLATES[0].prompt;
  return `${summaryText}\n\n${q}\n\n${RULES}`;
}
