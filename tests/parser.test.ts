import { describe, expect, it } from 'vitest';
import { parseTransaction } from '../src/parser';

const today = new Date(2026, 8, 19); // 2026-09-19

function ok(input: string, opts = {}) {
  const r = parseTransaction(input, { today, ...opts });
  if (!r.ok) throw new Error(`expected ok for "${input}", got ${r.reason}`);
  return r.value;
}

describe('parseTransaction — 基本格式', () => {
  it('午餐 180', () => {
    const v = ok('午餐 180');
    expect(v).toMatchObject({ date: '2026-09-19', type: 'expense', amount: 180, category: 'food', note: '午餐', confidence: 0.9 });
  });

  it('180 午餐（金額在前）', () => {
    const v = ok('180 午餐');
    expect(v).toMatchObject({ amount: 180, category: 'food', note: '午餐' });
  });

  it('全聯 685 元（有單位）', () => {
    const v = ok('全聯 685 元');
    expect(v).toMatchObject({ amount: 685, category: 'daily', note: '全聯' });
  });

  it('薪水 52,000（千分位、收入）', () => {
    const v = ok('薪水 52,000');
    expect(v).toMatchObject({ type: 'income', amount: 52000, category: 'income', note: '薪水', confidence: 0.9 });
  });

  it('不認得的品項 → other、低信心', () => {
    const v = ok('不明支出 300');
    expect(v).toMatchObject({ amount: 300, category: 'other', confidence: 0.5 });
  });
});

describe('parseTransaction — 日期', () => {
  it('昨天 Uber 245', () => {
    const v = ok('昨天 Uber 245');
    expect(v).toMatchObject({ date: '2026-09-18', amount: 245, category: 'transport', note: 'Uber' });
  });

  it('前天 房租 18500', () => {
    const v = ok('前天 房租 18500');
    expect(v).toMatchObject({ date: '2026-09-17', amount: 18500, category: 'housing' });
  });

  it('9/12 Costco 2350', () => {
    const v = ok('9/12 Costco 2350');
    expect(v).toMatchObject({ date: '2026-09-12', amount: 2350, category: 'daily', note: 'Costco' });
  });

  it('9月12日 電影 300', () => {
    const v = ok('9月12日 電影 300');
    expect(v).toMatchObject({ date: '2026-09-12', amount: 300, category: 'entertainment', note: '電影' });
  });

  it('全形數字與斜線：２／１２ 早餐 ６０', () => {
    const v = ok('２／１２ 早餐 ６０');
    expect(v).toMatchObject({ date: '2026-02-12', amount: 60, category: 'food' });
  });

  it('無效日期 2/30 不當日期，數字也不當金額', () => {
    // 2/30 無效 → 不吃掉；但 "2/30" 的 2 與 30 都在 / 旁邊，不算金額；只剩 150
    const v = ok('2/30 午餐 150');
    expect(v).toMatchObject({ date: '2026-09-19', amount: 150 });
  });
});

describe('parseTransaction — 金額干擾', () => {
  it('7-11 120：商家含數字不當金額', () => {
    const v = ok('7-11 120');
    expect(v).toMatchObject({ amount: 120, category: 'daily' });
  });

  it('咖啡 2杯 120：量詞前的數字不當金額', () => {
    const v = ok('咖啡 2杯 120');
    expect(v).toMatchObject({ amount: 120, category: 'food' });
  });

  it('多個數字時有單位者優先：3人 晚餐 900元', () => {
    const v = ok('3人 晚餐 900元');
    expect(v).toMatchObject({ amount: 900, category: 'food' });
  });
});

describe('parseTransaction — 失敗情況', () => {
  it('咖啡（無金額）→ no_amount', () => {
    expect(parseTransaction('咖啡', { today })).toEqual({ ok: false, reason: 'no_amount' });
  });

  it('空字串 → empty', () => {
    expect(parseTransaction('   ', { today })).toEqual({ ok: false, reason: 'empty' });
  });

  it('0 元 → bad_amount', () => {
    expect(parseTransaction('午餐 0 元', { today })).toEqual({ ok: false, reason: 'bad_amount' });
  });
});

describe('parseTransaction — 使用者規則', () => {
  it('userRules 優先於預設關鍵字', () => {
    // 預設「便當」是 food；使用者硬把「阿婆便當」歸到 other
    const v = ok('阿婆便當 90', { userRules: [{ keyword: '阿婆便當', category: 'other' }] });
    expect(v.category).toBe('other');
  });

  it('userRules 能認得預設表沒有的店名', () => {
    const v = ok('小美餐館 200', { userRules: [{ keyword: '小美', category: 'food' }] });
    expect(v).toMatchObject({ category: 'food', confidence: 0.9 });
  });
});
