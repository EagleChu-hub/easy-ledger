// Dexie（IndexedDB）資料層。所有資料只存在使用者瀏覽器。
import Dexie, { type EntityTable } from 'dexie';
import { occurrencesBetween } from './recurring';
import { validateRecurringRule, validateTransaction, type RecurringRule, type Transaction, type UserRule } from './types';

interface Setting {
  key: string;
  value: unknown;
}

export class LedgerDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  userRules!: EntityTable<UserRule, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  recurring!: EntityTable<RecurringRule, 'id'>;

  constructor(name = 'easy-ledger') {
    super(name);
    this.version(1).stores({
      transactions: '++id, date, type, category, createdAt',
      userRules: '++id, &keyword',
      settings: 'key',
    });
    // v2：週期規則；transactions 加 recurringId 複合索引供冪等檢查
    this.version(2).stores({
      transactions: '++id, date, type, category, createdAt, recurringId, [recurringId+date]',
      userRules: '++id, &keyword',
      settings: 'key',
      recurring: '++id, active',
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
  await db.transaction('rw', db.transactions, db.userRules, db.recurring, async () => {
    await db.transactions.clear();
    await db.userRules.clear();
    await db.recurring.clear();
  });
}

// ---- recurring rules ----

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function addRecurring(rule: Omit<RecurringRule, 'id' | 'createdAt' | 'active' | 'startDate'> & Partial<Pick<RecurringRule, 'active' | 'startDate' | 'createdAt'>>): Promise<number> {
  const valid = validateRecurringRule({
    ...rule,
    active: rule.active ?? true,
    startDate: rule.startDate ?? todayISO(),
    createdAt: rule.createdAt ?? Date.now(),
  });
  const id = await db.recurring.add(valid);
  return id as number;
}

export async function listRecurring(): Promise<RecurringRule[]> {
  const rows = await db.recurring.toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateRecurring(id: number, patch: Partial<RecurringRule>): Promise<void> {
  const existing = await db.recurring.get(id);
  if (!existing) throw new Error(`找不到週期規則 #${id}`);
  const valid = validateRecurringRule({ ...existing, ...patch, id });
  await db.recurring.put(valid);
}

export async function deleteRecurring(id: number): Promise<void> {
  await db.recurring.delete(id);
}

// 匯入：逐條驗證，壞一條整批不收；一律重新編號
export async function bulkImportRecurring(rows: unknown[]): Promise<number> {
  const valid = rows.map((r, i) => {
    try {
      const v = validateRecurringRule(r);
      delete v.id;
      return v;
    } catch (e) {
      throw new Error(`第 ${i + 1} 條：${(e as Error).message}`);
    }
  });
  await db.transaction('rw', db.recurring, async () => {
    await db.recurring.bulkAdd(valid);
  });
  return valid.length;
}

// 把所有啟用中的規則補記到 today（含）。冪等：同規則同日期已存在就不再新增。
export async function applyDueRecurring(today = todayISO()): Promise<number> {
  let added = 0;
  await db.transaction('rw', db.transactions, db.recurring, async () => {
    const rules = await db.recurring.toArray();
    for (const rule of rules) {
      if (!rule.active || rule.id == null) continue;
      let from = rule.startDate;
      if (rule.lastGenerated) {
        const [y, m, d] = rule.lastGenerated.split('-').map(Number);
        const next = new Date(y, m - 1, d + 1);
        const nextISO = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
        if (nextISO > from) from = nextISO;
      }
      const dates = occurrencesBetween(rule, from, today);
      for (const date of dates) {
        const exists = await db.transactions.where('[recurringId+date]').equals([rule.id, date]).count();
        if (exists > 0) continue;
        await db.transactions.add(validateTransaction({
          date,
          type: rule.type,
          amount: rule.amount,
          category: rule.category,
          note: rule.note,
          rawInput: rule.rawInput,
          createdAt: Date.now(),
          recurringId: rule.id,
        }));
        added += 1;
      }
      if (today > (rule.lastGenerated ?? '')) {
        await db.recurring.update(rule.id, { lastGenerated: today });
      }
    }
  });
  return added;
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
