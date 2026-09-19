// 週期規則：解析「每月 1 號 房租 18500」、算下一次發生日、補算區間內的發生日。
// 純函式，不碰 DOM 與 Dexie。
import { formatDate, parseTransaction, type ParseOptions } from './parser';
import type { Freq, RecurringRule } from './types';

const WEEKDAY_MAP: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

// 建立規則時還不知道 id / startDate / createdAt，由呼叫端補
export type RecurringDraft = Omit<RecurringRule, 'id' | 'startDate' | 'createdAt' | 'active' | 'lastGenerated'> & {
  confidence: number;
};

export type ParseRecurringResult =
  | { ok: true; draft: RecurringDraft; rest: string }
  | { ok: false; reason: 'not_recurring' | 'no_amount' | 'bad_amount' | 'empty' };

interface FreqHit { freq: Freq; dayOfWeek?: number; dayOfMonth?: number; month?: number; day?: number; token: string }

function matchFreq(text: string): FreqHit | undefined {
  let m = text.match(/每\s*(天|日)/);
  if (m) return { freq: 'daily', token: m[0] };
  m = text.match(/每\s*(週|星期|禮拜)\s*([一二三四五六日天])/);
  if (m) return { freq: 'weekly', dayOfWeek: WEEKDAY_MAP[m[2]], token: m[0] };
  m = text.match(/每\s*個?月\s*底/);
  if (m) return { freq: 'monthly', dayOfMonth: 31, token: m[0] };
  m = text.match(/每\s*個?月\s*(\d{1,2})\s*(號|日)/);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) return { freq: 'monthly', dayOfMonth: d, token: m[0] };
  }
  m = text.match(/每\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(日|號)?/);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { freq: 'yearly', month: mo, day: d, token: m[0] };
  }
  m = text.match(/每\s*年\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { freq: 'yearly', month: mo, day: d, token: m[0] };
  }
  return undefined;
}

// 命中「每…」前綴就回規則草稿；其餘欄位沿用 parseTransaction 的金額／分類／備註解析
export function parseRecurring(input: string, opts: ParseOptions = {}): ParseRecurringResult {
  const text = (input ?? '').replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)).trim();
  if (!text) return { ok: false, reason: 'empty' };
  const hit = matchFreq(text);
  if (!hit) return { ok: false, reason: 'not_recurring' };

  const rest = text.replace(hit.token, ' ').replace(/\s+/g, ' ').trim();
  const r = parseTransaction(rest, opts);
  if (!r.ok) return { ok: false, reason: r.reason === 'empty' ? 'no_amount' : r.reason };

  const draft: RecurringDraft = {
    freq: hit.freq,
    type: r.value.type,
    amount: r.value.amount,
    category: r.value.category,
    note: r.value.note,
    rawInput: input,
    confidence: r.value.confidence,
  };
  if (hit.dayOfWeek !== undefined) draft.dayOfWeek = hit.dayOfWeek;
  if (hit.dayOfMonth !== undefined) draft.dayOfMonth = hit.dayOfMonth;
  if (hit.month !== undefined) draft.month = hit.month;
  if (hit.day !== undefined) draft.day = hit.day;
  return { ok: true, draft, rest };
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

type RuleShape = Pick<RecurringRule, 'freq' | 'dayOfWeek' | 'dayOfMonth' | 'month' | 'day'>;

// 從 fromInclusive 起（含）下一次發生日
export function nextOccurrence(rule: RuleShape, fromInclusive: string): string {
  const from = parseISO(fromInclusive);
  switch (rule.freq) {
    case 'daily':
      return formatDate(from);
    case 'weekly': {
      const diff = ((rule.dayOfWeek ?? 0) - from.getDay() + 7) % 7;
      const d = new Date(from);
      d.setDate(d.getDate() + diff);
      return formatDate(d);
    }
    case 'monthly': {
      // 該月的發生日（夾到月底）；已過就看下個月
      for (let k = 0; k < 2; k++) {
        const y = from.getFullYear();
        const m0 = from.getMonth() + k;
        const base = new Date(y, m0, 1);
        const day = Math.min(rule.dayOfMonth ?? 1, daysInMonth(base.getFullYear(), base.getMonth()));
        const d = new Date(base.getFullYear(), base.getMonth(), day);
        if (d >= from) return formatDate(d);
      }
      throw new Error('unreachable');
    }
    case 'yearly': {
      for (let k = 0; k < 2; k++) {
        const y = from.getFullYear() + k;
        const m0 = (rule.month ?? 1) - 1;
        const day = Math.min(rule.day ?? 1, daysInMonth(y, m0));
        const d = new Date(y, m0, day);
        if (d >= from) return formatDate(d);
      }
      throw new Error('unreachable');
    }
  }
}

// 區間內（含兩端）所有發生日，最多 limit 筆（防呆：daily 一年也才 365）
export function occurrencesBetween(rule: RuleShape, fromInclusive: string, toInclusive: string, limit = 400): string[] {
  const out: string[] = [];
  if (fromInclusive > toInclusive) return out;
  let cursor = fromInclusive;
  while (out.length < limit) {
    const next = nextOccurrence(rule, cursor);
    if (next > toInclusive) break;
    out.push(next);
    const d = parseISO(next);
    d.setDate(d.getDate() + 1);
    cursor = formatDate(d);
  }
  return out;
}

export function describeRule(rule: RuleShape): string {
  switch (rule.freq) {
    case 'daily': return '每天';
    case 'weekly': return `每週${WEEKDAY_LABEL[rule.dayOfWeek ?? 0]}`;
    case 'monthly': return rule.dayOfMonth === 31 ? '每月底' : `每月 ${rule.dayOfMonth} 號`;
    case 'yearly': return `每年 ${rule.month}/${rule.day}`;
  }
}

// 「10/1（週四）」給預覽用
export function friendlyOccurrence(iso: string): string {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（週${WEEKDAY_LABEL[d.getDay()]}）`;
}
