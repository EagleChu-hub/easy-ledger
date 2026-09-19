import { describe, expect, it } from 'vitest';
import { describeRule, nextOccurrence, occurrencesBetween, parseRecurring } from '../src/recurring';
import { validateRecurringRule, ValidationError } from '../src/types';

describe('parseRecurring', () => {
  it('每月 1 號 房租 18500', () => {
    const r = parseRecurring('每月 1 號 房租 18500');
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft).toMatchObject({ freq: 'monthly', dayOfMonth: 1, amount: 18500, category: 'housing', note: '房租', type: 'expense', confidence: 0.9 });
  });
  it('每月1號（無空格）', () => {
    const r = parseRecurring('每月1號房租18500');
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft).toMatchObject({ freq: 'monthly', dayOfMonth: 1, amount: 18500 });
  });
  it('每週一 健身 300', () => {
    const r = parseRecurring('每週一 健身 300');
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft).toMatchObject({ freq: 'weekly', dayOfWeek: 1, amount: 300, category: 'entertainment', note: '健身' });
  });
  it('每星期天 / 每禮拜日 → dayOfWeek 0', () => {
    for (const s of ['每星期天 教會 100', '每禮拜日 教會 100']) {
      const r = parseRecurring(s);
      if (!r.ok) throw new Error(r.reason);
      expect(r.draft.dayOfWeek).toBe(0);
    }
  });
  it('每天 咖啡 65', () => {
    const r = parseRecurring('每天 咖啡 65');
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft).toMatchObject({ freq: 'daily', amount: 65, category: 'food', note: '咖啡' });
  });
  it('每年 3月15日 保險 12000', () => {
    const r = parseRecurring('每年 3月15日 保險 12000');
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft).toMatchObject({ freq: 'yearly', month: 3, day: 15, amount: 12000, category: 'medical' });
  });
  it('每月底 信用卡 5000 → dayOfMonth 31', () => {
    const r = parseRecurring('每月底 信用卡 5000');
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft).toMatchObject({ freq: 'monthly', dayOfMonth: 31, amount: 5000 });
  });
  it('每月 5 號 薪水 52000 → 收入', () => {
    const r = parseRecurring('每月 5 號 薪水 52000');
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft).toMatchObject({ type: 'income', category: 'income' });
  });
  it('不是週期句 → not_recurring', () => {
    expect(parseRecurring('午餐 180')).toEqual({ ok: false, reason: 'not_recurring' });
    expect(parseRecurring('上週三 午餐 180')).toEqual({ ok: false, reason: 'not_recurring' });
  });
  it('週期句但沒金額 → no_amount', () => {
    expect(parseRecurring('每月 1 號 房租')).toEqual({ ok: false, reason: 'no_amount' });
  });
  it('每月 32 號 不合法 → 不當週期', () => {
    expect(parseRecurring('每月 32 號 房租 100').ok).toBe(false);
  });
});

describe('nextOccurrence', () => {
  it('daily：就是當天', () => {
    expect(nextOccurrence({ freq: 'daily' }, '2026-09-20')).toBe('2026-09-20');
  });
  it('weekly：2026-09-16（週三）起的下個週一 → 09-21', () => {
    expect(nextOccurrence({ freq: 'weekly', dayOfWeek: 1 }, '2026-09-16')).toBe('2026-09-21');
  });
  it('weekly：起算日就是那個星期幾 → 當天', () => {
    expect(nextOccurrence({ freq: 'weekly', dayOfWeek: 3 }, '2026-09-16')).toBe('2026-09-16');
  });
  it('monthly 1：09-20 起 → 10-01', () => {
    expect(nextOccurrence({ freq: 'monthly', dayOfMonth: 1 }, '2026-09-20')).toBe('2026-10-01');
  });
  it('monthly 31：02-10 起 → 02-28（夾到月底）', () => {
    expect(nextOccurrence({ freq: 'monthly', dayOfMonth: 31 }, '2026-02-10')).toBe('2026-02-28');
  });
  it('monthly 31：01-31 起 → 01-31（含當天）', () => {
    expect(nextOccurrence({ freq: 'monthly', dayOfMonth: 31 }, '2026-01-31')).toBe('2026-01-31');
  });
  it('monthly 15：12-20 起 → 跨年 01-15', () => {
    expect(nextOccurrence({ freq: 'monthly', dayOfMonth: 15 }, '2026-12-20')).toBe('2027-01-15');
  });
  it('yearly 3/15：2026-09-20 起 → 2027-03-15', () => {
    expect(nextOccurrence({ freq: 'yearly', month: 3, day: 15 }, '2026-09-20')).toBe('2027-03-15');
  });
  it('yearly 2/29：非閏年夾到 2/28', () => {
    expect(nextOccurrence({ freq: 'yearly', month: 2, day: 29 }, '2026-01-01')).toBe('2026-02-28');
  });
});

describe('occurrencesBetween（補算）', () => {
  it('monthly 1：07-15 → 09-20 補出 08-01、09-01', () => {
    expect(occurrencesBetween({ freq: 'monthly', dayOfMonth: 1 }, '2026-07-15', '2026-09-20')).toEqual(['2026-08-01', '2026-09-01']);
  });
  it('weekly 一：09-01 → 09-20 補出 09-07、09-14', () => {
    expect(occurrencesBetween({ freq: 'weekly', dayOfWeek: 1 }, '2026-09-01', '2026-09-20')).toEqual(['2026-09-07', '2026-09-14']);
  });
  it('daily：09-18 → 09-20 三筆', () => {
    expect(occurrencesBetween({ freq: 'daily' }, '2026-09-18', '2026-09-20')).toHaveLength(3);
  });
  it('起 > 迄 → 空', () => {
    expect(occurrencesBetween({ freq: 'daily' }, '2026-09-21', '2026-09-20')).toEqual([]);
  });
  it('上限防呆：daily 十年只回 limit 筆', () => {
    expect(occurrencesBetween({ freq: 'daily' }, '2016-01-01', '2026-01-01', 400)).toHaveLength(400);
  });
});

describe('describeRule', () => {
  it('文字描述', () => {
    expect(describeRule({ freq: 'daily' })).toBe('每天');
    expect(describeRule({ freq: 'weekly', dayOfWeek: 1 })).toBe('每週一');
    expect(describeRule({ freq: 'monthly', dayOfMonth: 1 })).toBe('每月 1 號');
    expect(describeRule({ freq: 'monthly', dayOfMonth: 31 })).toBe('每月底');
    expect(describeRule({ freq: 'yearly', month: 3, day: 15 })).toBe('每年 3/15');
  });
});

describe('validateRecurringRule — 壞資料要被擋', () => {
  const good = { freq: 'monthly', dayOfMonth: 1, type: 'expense', amount: 18500, category: 'housing', note: '房租', rawInput: '', active: true, startDate: '2026-09-20', createdAt: 1 };
  it('好資料通過', () => {
    expect(validateRecurringRule(good)).toMatchObject({ freq: 'monthly', dayOfMonth: 1 });
  });
  it('freq 亂填', () => {
    expect(() => validateRecurringRule({ ...good, freq: 'hourly' })).toThrow(ValidationError);
  });
  it('dayOfMonth 0 / 32 / 40', () => {
    for (const d of [0, 32, 40]) expect(() => validateRecurringRule({ ...good, dayOfMonth: d })).toThrow(/dayOfMonth/);
  });
  it('weekly 沒 dayOfWeek', () => {
    expect(() => validateRecurringRule({ ...good, freq: 'weekly' })).toThrow(/dayOfWeek/);
  });
  it('amount 是字串', () => {
    expect(() => validateRecurringRule({ ...good, amount: '18500' })).toThrow(/amount/);
  });
  it('startDate 格式錯', () => {
    expect(() => validateRecurringRule({ ...good, startDate: '2026/09/20' })).toThrow(/startDate/);
  });
});
