// CSV 匯出／匯入。欄位固定，匯入時每筆都經 validateTransaction。
import { validateTransaction, type Transaction } from './types';

export const CSV_HEADER = ['date', 'type', 'amount', 'category', 'note', 'rawInput', 'createdAt'] as const;

function escapeCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Transaction[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const t of rows) {
    lines.push(CSV_HEADER.map((k) => escapeCell(t[k])).join(','));
  }
  // BOM 讓 Excel 直接開也能正確顯示中文
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// 簡單但完整的 CSV 解析：支援引號、引號內逗號與換行、"" 跳脫
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// 回傳已驗證的交易；任何一列壞掉就丟錯（含列號），整批不收
export function fromCSV(text: string): Transaction[] {
  const rows = parseCSV(text);
  if (rows.length === 0) throw new Error('CSV 是空的');
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  for (const required of ['date', 'type', 'amount', 'category']) {
    if (idx(required) < 0) throw new Error(`CSV 缺少欄位：${required}`);
  }
  const out: Transaction[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (name: string) => (idx(name) >= 0 ? (row[idx(name)] ?? '').trim() : '');
    const amountStr = get('amount').replace(/,/g, '');
    const createdAtStr = get('createdAt');
    const candidate = {
      date: get('date'),
      type: get('type'),
      amount: amountStr === '' ? NaN : Number(amountStr),
      category: get('category'),
      note: get('note'),
      rawInput: get('rawInput'),
      createdAt: createdAtStr === '' ? Date.now() : Number(createdAtStr),
    };
    try {
      out.push(validateTransaction(candidate));
    } catch (e) {
      throw new Error(`第 ${r + 1} 列：${(e as Error).message}`);
    }
  }
  return out;
}
