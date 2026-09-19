// 月度彙總（純函式）。輸入是交易陣列，輸出是給畫面與 AI 摘要用的數字。
import type { Transaction } from './types';

export interface CategoryTotal {
  category: string;
  amount: number;
  count: number;
}

export interface MonthSummary {
  month: string;             // 'YYYY-MM'
  count: number;
  income: number;
  expense: number;
  balance: number;           // income - expense
  byCategory: CategoryTotal[];   // 只算支出，金額大到小
  topExpenses: Transaction[];    // 支出前 N 筆，金額大到小
  firstDate?: string;
  lastDate?: string;
}

export interface CategoryCompare {
  category: string;
  current: number;
  previous: number;
  diff: number;              // current - previous
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

// 'YYYY-MM' 往前 n 個月
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function summarizeMonth(transactions: Transaction[], month: string, topN = 5): MonthSummary {
  const rows = transactions.filter((t) => monthOf(t.date) === month);
  let income = 0;
  let expense = 0;
  const cat = new Map<string, CategoryTotal>();
  for (const t of rows) {
    if (t.type === 'income') {
      income += t.amount;
      continue;
    }
    expense += t.amount;
    const c = cat.get(t.category) ?? { category: t.category, amount: 0, count: 0 };
    c.amount += t.amount;
    c.count += 1;
    cat.set(t.category, c);
  }
  const byCategory = [...cat.values()].sort((a, b) => b.amount - a.amount);
  const topExpenses = rows
    .filter((t) => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date))
    .slice(0, topN);
  const dates = rows.map((t) => t.date).sort();
  return {
    month,
    count: rows.length,
    income,
    expense,
    balance: income - expense,
    byCategory,
    topExpenses,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
  };
}

// 本月 vs 上月的分類比較；兩邊都有的分類都列出，依「本月金額」大到小
export function compareCategories(current: MonthSummary, previous: MonthSummary): CategoryCompare[] {
  const keys = new Set<string>();
  current.byCategory.forEach((c) => keys.add(c.category));
  previous.byCategory.forEach((c) => keys.add(c.category));
  const cur = new Map(current.byCategory.map((c) => [c.category, c.amount]));
  const prev = new Map(previous.byCategory.map((c) => [c.category, c.amount]));
  return [...keys]
    .map((k) => {
      const a = cur.get(k) ?? 0;
      const b = prev.get(k) ?? 0;
      return { category: k, current: a, previous: b, diff: a - b };
    })
    .sort((x, y) => y.current - x.current || y.previous - x.previous);
}

export function formatTWD(n: number): string {
  return n.toLocaleString('zh-TW');
}

export function formatSigned(n: number): string {
  if (n > 0) return `+${formatTWD(n)}`;
  if (n < 0) return `−${formatTWD(-n)}`;
  return '0';
}
