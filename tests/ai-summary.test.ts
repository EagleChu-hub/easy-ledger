import { describe, expect, it } from 'vitest';
import { buildPrompt, buildSummaryText, QUESTION_TEMPLATES } from '../src/ai-summary';
import { fromCSV, parseCSV, toCSV } from '../src/csv';
import { summarizeMonth } from '../src/stats';
import type { Transaction } from '../src/types';

function tx(date: string, type: 'expense' | 'income', amount: number, category: string, note = ''): Transaction {
  return { date, type, amount, category, note, rawInput: note, createdAt: 1000 };
}

const data: Transaction[] = [
  tx('2026-09-01', 'income', 52000, 'income', '薪水'),
  tx('2026-09-02', 'expense', 180, 'food', '午餐'),
  tx('2026-09-12', 'expense', 2350, 'daily', 'Costco'),
  tx('2026-08-20', 'expense', 500, 'food', '上月餐'),
];

describe('buildSummaryText', () => {
  const cur = summarizeMonth(data, '2026-09');
  const prev = summarizeMonth(data, '2026-08');
  const text = buildSummaryText(cur, prev);

  it('標題含期間與筆數', () => {
    expect(text).toContain('【記帳摘要 2026-09-01 ~ 2026-09-12，共 3 筆】');
  });
  it('總覽數字與上月', () => {
    expect(text).toContain('收入 52,000｜支出 2,530｜結餘 +49,470');
    expect(text).toContain('上月（2026-08）：收入 0｜支出 500');
  });
  it('分類用中文標籤並含差額', () => {
    expect(text).toContain('- 日用 2,350 / 0 / +2,350');
    expect(text).toContain('- 餐飲 180 / 500 / −320');
  });
  it('前幾大單筆', () => {
    expect(text).toContain('本月前 2 大單筆支出');
    expect(text).toContain('- 09/12 Costco 2,350');
  });
  it('不外洩原始輸入以外的細節：不含 rawInput 欄位名', () => {
    expect(text).not.toContain('rawInput');
  });
  it('長度控制在 1500 字內', () => {
    expect(text.length).toBeLessThan(1500);
  });
});

describe('buildPrompt', () => {
  it('空問題用第一個模板，並附規則', () => {
    const p = buildPrompt('SUMMARY', '');
    expect(p.startsWith('SUMMARY\n\n')).toBe(true);
    expect(p).toContain(QUESTION_TEMPLATES[0].prompt);
    expect(p).toContain('不要編造');
  });
  it('自訂問題', () => {
    expect(buildPrompt('S', '  為什麼九月花比較多？ ')).toContain('為什麼九月花比較多？');
  });
});

describe('CSV 來回', () => {
  it('匯出再匯入筆數與內容一致', () => {
    const csv = toCSV(data);
    expect(csv.startsWith('﻿date,type,amount')).toBe(true);
    const back = fromCSV(csv);
    expect(back).toHaveLength(4);
    expect(back[2]).toMatchObject({ date: '2026-09-12', amount: 2350, note: 'Costco' });
  });
  it('note 含逗號與引號能正確跳脫', () => {
    const rows = [tx('2026-09-01', 'expense', 100, 'food', '早餐, "蛋餅"')];
    const back = fromCSV(toCSV(rows));
    expect(back[0].note).toBe('早餐, "蛋餅"');
  });
  it('parseCSV 忽略空行', () => {
    expect(parseCSV('a,b\r\n\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('缺必要欄位 → 丟錯', () => {
    expect(() => fromCSV('date,amount\n2026-09-01,100')).toThrow(/缺少欄位：type/);
  });
  it('某列壞資料 → 丟錯並指出列號', () => {
    const bad = 'date,type,amount,category\n2026-09-01,expense,100,food\n2026-13-01,expense,abc,food';
    expect(() => fromCSV(bad)).toThrow(/第 3 列/);
  });
});
