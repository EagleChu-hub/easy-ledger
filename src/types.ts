// 共用型別與資料驗證（純函式，不依賴 Dexie，方便在 node 測試）

export type TxType = 'expense' | 'income';

export interface Transaction {
  id?: number;        // Dexie 自動編號
  date: string;       // 'YYYY-MM-DD'
  type: TxType;
  amount: number;     // 整數 TWD
  category: string;   // 分類 key
  note: string;       // 品項/商家
  rawInput: string;   // 原始輸入，供除錯與重新解析
  createdAt: number;  // Date.now()
  recurringId?: number; // 由週期規則自動產生時，指向該規則
}

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringRule {
  id?: number;
  freq: Freq;
  dayOfWeek?: number;   // weekly：0=日 … 6=六
  dayOfMonth?: number;  // monthly：1–31，超過當月天數則取月底
  month?: number;       // yearly：1–12
  day?: number;         // yearly：1–31
  type: TxType;
  amount: number;
  category: string;
  note: string;
  rawInput: string;
  active: boolean;
  startDate: string;        // 第一次發生日 ≥ startDate
  lastGenerated?: string;   // 已補記到哪一天（含）
  createdAt: number;
}

export interface UserRule {
  id?: number;
  keyword: string;
  category: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_AMOUNT = 100_000_000;

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'ValidationError';
  }
}

// 通過就原樣回傳（方便鏈式使用）；不通過就丟 ValidationError
export function validateTransaction(tx: unknown): Transaction {
  if (!tx || typeof tx !== 'object') throw new ValidationError('transaction', '必須是物件');
  const t = tx as Record<string, unknown>;

  if (typeof t.date !== 'string' || !DATE_RE.test(t.date)) throw new ValidationError('date', '格式必須是 YYYY-MM-DD');
  const [y, m, d] = t.date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) throw new ValidationError('date', '不是有效日期');

  if (t.type !== 'expense' && t.type !== 'income') throw new ValidationError('type', '必須是 expense 或 income');

  if (typeof t.amount !== 'number' || !Number.isInteger(t.amount)) throw new ValidationError('amount', '必須是整數');
  if (t.amount <= 0 || t.amount > MAX_AMOUNT) throw new ValidationError('amount', `必須介於 1 與 ${MAX_AMOUNT}`);

  if (typeof t.category !== 'string' || !t.category.trim()) throw new ValidationError('category', '不可為空');
  if (typeof t.note !== 'string') throw new ValidationError('note', '必須是字串');
  if (t.note.length > 200) throw new ValidationError('note', '不可超過 200 字');

  const rawInput = typeof t.rawInput === 'string' ? t.rawInput : '';
  const createdAt = typeof t.createdAt === 'number' && Number.isFinite(t.createdAt) ? t.createdAt : Date.now();

  const out: Transaction = {
    date: t.date,
    type: t.type,
    amount: t.amount,
    category: t.category.trim(),
    note: t.note.trim(),
    rawInput,
    createdAt,
  };
  if (typeof t.id === 'number') out.id = t.id;
  if (t.recurringId != null) {
    if (typeof t.recurringId !== 'number' || !Number.isInteger(t.recurringId)) throw new ValidationError('recurringId', '必須是整數');
    out.recurringId = t.recurringId;
  }
  return out;
}

function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const FREQS: Freq[] = ['daily', 'weekly', 'monthly', 'yearly'];

export function validateRecurringRule(r: unknown): RecurringRule {
  if (!r || typeof r !== 'object') throw new ValidationError('rule', '必須是物件');
  const t = r as Record<string, unknown>;

  if (!FREQS.includes(t.freq as Freq)) throw new ValidationError('freq', '必須是 daily / weekly / monthly / yearly');
  const freq = t.freq as Freq;
  const intIn = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

  if (freq === 'weekly' && !intIn(t.dayOfWeek, 0, 6)) throw new ValidationError('dayOfWeek', '必須是 0–6');
  if (freq === 'monthly' && !intIn(t.dayOfMonth, 1, 31)) throw new ValidationError('dayOfMonth', '必須是 1–31');
  if (freq === 'yearly') {
    if (!intIn(t.month, 1, 12)) throw new ValidationError('month', '必須是 1–12');
    if (!intIn(t.day, 1, 31)) throw new ValidationError('day', '必須是 1–31');
  }

  if (t.type !== 'expense' && t.type !== 'income') throw new ValidationError('type', '必須是 expense 或 income');
  if (!intIn(t.amount, 1, MAX_AMOUNT)) throw new ValidationError('amount', `必須是 1 到 ${MAX_AMOUNT} 的整數`);
  if (typeof t.category !== 'string' || !t.category.trim()) throw new ValidationError('category', '不可為空');
  if (typeof t.note !== 'string') throw new ValidationError('note', '必須是字串');
  if (!isValidDateStr(t.startDate)) throw new ValidationError('startDate', '格式必須是 YYYY-MM-DD');
  if (t.lastGenerated != null && !isValidDateStr(t.lastGenerated)) throw new ValidationError('lastGenerated', '格式必須是 YYYY-MM-DD');

  const out: RecurringRule = {
    freq,
    type: t.type,
    amount: t.amount as number,
    category: t.category.trim(),
    note: t.note.trim(),
    rawInput: typeof t.rawInput === 'string' ? t.rawInput : '',
    active: t.active !== false,
    startDate: t.startDate,
    createdAt: typeof t.createdAt === 'number' && Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
  };
  if (freq === 'weekly') out.dayOfWeek = t.dayOfWeek as number;
  if (freq === 'monthly') out.dayOfMonth = t.dayOfMonth as number;
  if (freq === 'yearly') { out.month = t.month as number; out.day = t.day as number; }
  if (typeof t.lastGenerated === 'string') out.lastGenerated = t.lastGenerated;
  if (typeof t.id === 'number') out.id = t.id;
  return out;
}
