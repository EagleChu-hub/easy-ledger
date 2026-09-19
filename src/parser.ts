// 規則式解析：把「午餐 180」「昨天 Uber 245」「薪水 52,000」轉成結構化交易
// 純函式、不碰 DOM，方便測試

import { DEFAULT_CATEGORIES, INCOME_CATEGORY_KEY, INCOME_KEYWORDS, OTHER_CATEGORY_KEY, type Category } from './categories';
import type { TxType, UserRule } from './types';

export type { UserRule };

export interface ParsedTransaction {
  date: string;        // YYYY-MM-DD
  type: TxType;
  amount: number;      // 整數 TWD
  category: string;    // 分類 key
  note: string;        // 品項/商家，去掉金額與日期後的剩餘文字
  confidence: number;  // 0.9 = 金額+分類都命中；0.5 = 只有金額
  rawInput: string;
}

export type ParseResult =
  | { ok: true; value: ParsedTransaction }
  | { ok: false; reason: 'empty' | 'no_amount' | 'bad_amount' };

export interface ParseOptions {
  today?: Date;
  categories?: Category[];
  userRules?: UserRule[];
}

// 全形數字與標點轉半形
function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/，/g, ',')
    .replace(/／/g, '/')
    .replace(/　/g, ' ');
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface DateHit { date: string; token: string }

// 找日期詞；找不到就回 undefined（呼叫端用今天）
function extractDate(text: string, today: Date): DateHit | undefined {
  const relative: Array<[RegExp, number]> = [
    [/大前天/, -3],
    [/前天|前日/, -2],
    [/昨天|昨日|昨晚/, -1],
    [/今天|今日|今晚|剛剛|剛才/, 0],
  ];
  for (const [re, offset] of relative) {
    const m = text.match(re);
    if (m) return { date: formatDate(addDays(today, offset)), token: m[0] };
  }
  // 9/12、09/12、9月12日、9月12
  const md = text.match(/(?<!\d)(\d{1,2})\s*[/月]\s*(\d{1,2})\s*(?:日|號)?(?!\d)/);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), month - 1, day);
      // 日期無效（例如 2/30）會被 JS 自動進位，直接拒絕
      if (d.getMonth() === month - 1 && d.getDate() === day) {
        return { date: formatDate(d), token: md[0] };
      }
    }
  }
  return undefined;
}

interface AmountHit { amount: number; token: string; hasUnit: boolean }

// 找金額：排除 7-11、日期這類含數字的詞；多個候選時「有單位」優先、否則取最大
function extractAmount(text: string): AmountHit[] {
  const re = /(?<![\d\-/月.])(\d{1,3}(?:,\d{3})+|\d+)(?:\s*(元|塊|圓|块|nt\$?|ntd|twd))?(?![\d\-/月日號.])/gi;
  const hits: AmountHit[] = [];
  for (const m of text.matchAll(re)) {
    const end = (m.index ?? 0) + m[0].length;
    // 數字後面直接接量詞（2杯、3個）的不是金額
    const after = text.slice(end, end + 1);
    if (!m[2] && /[杯個顆包件份張條瓶罐盒次人位]/.test(after)) continue;
    const amount = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(amount)) continue;
    hits.push({ amount, token: m[0], hasUnit: Boolean(m[2]) });
  }
  return hits;
}

function pickAmount(hits: AmountHit[]): AmountHit | undefined {
  if (hits.length === 0) return undefined;
  const withUnit = hits.filter((h) => h.hasUnit);
  const pool = withUnit.length > 0 ? withUnit : hits;
  return pool.reduce((best, h) => (h.amount > best.amount ? h : best));
}

interface CategoryHit { category: string; keyword: string }

function matchCategory(text: string, categories: Category[], userRules: UserRule[]): CategoryHit | undefined {
  const lower = text.toLowerCase();
  let best: CategoryHit | undefined;
  // 使用者規則優先，且同樣取最長命中
  for (const r of userRules) {
    const kw = r.keyword.toLowerCase();
    if (kw && lower.includes(kw) && (!best || kw.length > best.keyword.length)) {
      best = { category: r.category, keyword: r.keyword };
    }
  }
  if (best) return best;
  for (const c of categories) {
    for (const kw of c.keywords) {
      const k = kw.toLowerCase();
      if (lower.includes(k) && (!best || k.length > best.keyword.length)) {
        best = { category: c.key, keyword: kw };
      }
    }
  }
  return best;
}

function isIncome(text: string): boolean {
  return INCOME_KEYWORDS.some((k) => text.includes(k));
}

function cleanNote(text: string, removeTokens: string[]): string {
  let s = text;
  for (const t of removeTokens) {
    if (t) s = s.replace(t, ' ');
  }
  return s
    .replace(/[，,、。．.：:；;！!？?「」『』()（）\[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTransaction(input: string, opts: ParseOptions = {}): ParseResult {
  const today = opts.today ?? new Date();
  const categories = opts.categories ?? DEFAULT_CATEGORIES;
  const userRules = opts.userRules ?? [];

  const raw = input ?? '';
  const text = toHalfWidth(raw).trim();
  if (!text) return { ok: false, reason: 'empty' };

  const dateHit = extractDate(text, today);
  const textNoDate = dateHit ? text.replace(dateHit.token, ' ') : text;

  const amountHit = pickAmount(extractAmount(textNoDate));
  if (!amountHit) return { ok: false, reason: 'no_amount' };
  if (amountHit.amount <= 0 || amountHit.amount > 100_000_000) return { ok: false, reason: 'bad_amount' };

  const income = isIncome(textNoDate);
  const catHit = income ? undefined : matchCategory(textNoDate, categories, userRules);

  const note = cleanNote(textNoDate, [amountHit.token]);
  const category = income ? INCOME_CATEGORY_KEY : (catHit?.category ?? OTHER_CATEGORY_KEY);
  const confidence = income || catHit ? 0.9 : 0.5;

  return {
    ok: true,
    value: {
      date: dateHit?.date ?? formatDate(today),
      type: income ? 'income' : 'expense',
      amount: amountHit.amount,
      category,
      note,
      confidence,
      rawInput: raw,
    },
  };
}
