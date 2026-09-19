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
  return out;
}
