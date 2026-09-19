// Dexie（IndexedDB）資料層。所有資料只存在使用者瀏覽器。
import Dexie, { type EntityTable } from 'dexie';
import { validateTransaction, type Transaction, type UserRule } from './types';

interface Setting {
  key: string;
  value: unknown;
}

export class LedgerDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  userRules!: EntityTable<UserRule, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'easy-ledger') {
    super(name);
    this.version(1).stores({
      transactions: '++id, date, type, category, createdAt',
      userRules: '++id, &keyword',
      settings: 'key',
    });
  }
}

export const db = new LedgerDB();

// ---- transactions ----

export async function addTransaction(tx: Omit<Transaction, 'id' | 'createdAt'> & { createdAt?: number }): Promise<number> {
  const valid = validateTransaction({ ...tx, createdAt: tx.createdAt ?? Date.now() });
  const id = await db.transactions.add(valid);
  return id as number;
}

export async function updateTransaction(id: number, patch: Partial<Transaction>): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) throw new Error(`找不到交易 #${id}`);
  const valid = validateTransaction({ ...existing, ...patch, id });
  await db.transactions.put(valid);
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id);
}

// month = 'YYYY-MM'；回傳該月所有交易，日期新到舊、同日後加的在前
export async function listByMonth(month: string): Promise<Transaction[]> {
  const rows = await db.transactions.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray();
  return rows.sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
}

export async function listAll(): Promise<Transaction[]> {
  const rows = await db.transactions.toArray();
  return rows.sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
}

export async function countAll(): Promise<number> {
  return db.transactions.count();
}

// 匯入：逐筆驗證，任一筆壞就整批不寫（transaction 內丟錯會 rollback）
export async function bulkImport(rows: unknown[]): Promise<number> {
  const valid = rows.map((r, i) => {
    try {
      const v = validateTransaction(r);
      delete v.id; // 匯入一律重新編號，避免撞到既有資料
      return v;
    } catch (e) {
      throw new Error(`第 ${i + 1} 筆：${(e as Error).message}`);
    }
  });
  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.bulkAdd(valid);
  });
  return valid.length;
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.transactions, db.userRules, async () => {
    await db.transactions.clear();
    await db.userRules.clear();
  });
}

// ---- user rules ----

export async function listUserRules(): Promise<UserRule[]> {
  return db.userRules.toArray();
}

// 同一關鍵字只留最新一條
export async function upsertUserRule(keyword: string, category: string): Promise<void> {
  const kw = keyword.trim();
  if (!kw || !category) return;
  const existing = await db.userRules.where('keyword').equals(kw).first();
  if (existing?.id != null) await db.userRules.update(existing.id, { category });
  else await db.userRules.add({ keyword: kw, category });
}

export async function deleteUserRule(id: number): Promise<void> {
  await db.userRules.delete(id);
}

// ---- settings ----

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
