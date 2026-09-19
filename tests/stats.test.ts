import { describe, expect, it } from 'vitest';
import { compareCategories, formatSigned, shiftMonth, summarizeMonth } from '../src/stats';
import { validateTransaction, ValidationError, type Transaction } from '../src/types';

function tx(date: string, type: 'expense' | 'income', amount: number, category: string, note = ''): Transaction {
  return { date, type, amount, category, note, rawInput: '', createdAt: 0 };
}

const data: Transaction[] = [
  tx('2026-09-01', 'income', 52000, 'income', '薪水'),
  tx('2026-09-02', 'expense', 180, 'food', '午餐'),
  tx('2026-09-03', 'expense', 245, 'transport', 'Uber'),
  tx('2026-09-12', 'expense', 2350, 'daily', 'Costco'),
  tx('2026-09-15', 'expense', 320, 'food', '晚餐'),
  tx('2026-08-20', 'expense', 500, 'food', '上月餐'),
  tx('2026-08-21', 'expense', 900, 'entertainment', '上月電影'),
];

describe('summarizeMonth', () => {
  it('只算指定月份，收入/支出/結餘正確', () => {
    const s = summarizeMonth(data, '2026-09');
    expect(s.count).toBe(5);
    expect(s.income).toBe(52000);
    expect(s.expense).toBe(180 + 245 + 2350 + 320);
    expect(s.balance).toBe(52000 - 3095);
    expect(s.firstDate).toBe('2026-09-01');
    expect(s.lastDate).toBe('2026-09-15');
  });

  it('分類彙總只含支出、金額大到小', () => {
    const s = summarizeMonth(data, '2026-09');
    expect(s.byCategory.map((c) => c.category)).toEqual(['daily', 'food', 'transport']);
    expect(s.byCategory[1]).toEqual({ category: 'food', amount: 500, count: 2 });
  });

  it('topExpenses 取前 N 筆', () => {
    const s = summarizeMonth(data, '2026-09', 2);
    expect(s.topExpenses.map((t) => t.amount)).toEqual([2350, 320]);
  });

  it('空月份回零', () => {
    const s = summarizeMonth(data, '2026-01');
    expect(s).toMatchObject({ count: 0, income: 0, expense: 0, balance: 0, byCategory: [], topExpenses: [] });
  });
});

describe('compareCategories', () => {
  it('列出兩月聯集並算差額', () => {
    const cur = summarizeMonth(data, '2026-09');
    const prev = summarizeMonth(data, '2026-08');
    const cmp = compareCategories(cur, prev);
    const food = cmp.find((c) => c.category === 'food');
    expect(food).toEqual({ category: 'food', current: 500, previous: 500, diff: 0 });
    const ent = cmp.find((c) => c.category === 'entertainment');
    expect(ent).toEqual({ category: 'entertainment', current: 0, previous: 900, diff: -900 });
    expect(cmp[0].category).toBe('daily');
  });
});

describe('shiftMonth / formatSigned', () => {
  it('跨年往前', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
  });
  it('正負號', () => {
    expect(formatSigned(1180)).toBe('+1,180');
    expect(formatSigned(-450)).toBe('−450');
    expect(formatSigned(0)).toBe('0');
  });
});

describe('validateTransaction — 壞資料要被擋', () => {
  const good = tx('2026-09-19', 'expense', 100, 'food', '測試');

  it('好資料通過', () => {
    expect(validateTransaction(good)).toMatchObject({ amount: 100 });
  });
  it('amount 是字串 → 擋', () => {
    expect(() => validateTransaction({ ...good, amount: '100' })).toThrow(ValidationError);
  });
  it('amount 是小數 → 擋', () => {
    expect(() => validateTransaction({ ...good, amount: 99.5 })).toThrow(/整數/);
  });
  it('amount 為 0 或負 → 擋', () => {
    expect(() => validateTransaction({ ...good, amount: 0 })).toThrow(/介於/);
    expect(() => validateTransaction({ ...good, amount: -5 })).toThrow(/介於/);
  });
  it('date 格式錯 → 擋', () => {
    expect(() => validateTransaction({ ...good, date: '2026/09/19' })).toThrow(/YYYY-MM-DD/);
    expect(() => validateTransaction({ ...good, date: '2026-02-30' })).toThrow(/有效日期/);
  });
  it('type 亂填 → 擋', () => {
    expect(() => validateTransaction({ ...good, type: 'transfer' })).toThrow(/expense 或 income/);
  });
  it('category 空白 → 擋', () => {
    expect(() => validateTransaction({ ...good, category: '  ' })).toThrow(/不可為空/);
  });
});
