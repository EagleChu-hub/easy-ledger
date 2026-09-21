// 各畫面共用的小工具：建 DOM、toast、取得分類（含使用者自訂）
import { DEFAULT_CATEGORIES, type Category } from '../categories';
import { getSetting } from '../db';

type Attrs = Record<string, string | boolean | number | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'className') {
      el.className = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

let toastTimer: number | undefined;
export function toast(msg: string, ms = 2200): void {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
}

// 字體大小：只放大文字（rem），版面間距不動；存在 settings 表 fontScale
export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_DEFAULT = 1;
export function applyFontScale(scale: number): void {
  const s = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Number(scale) || FONT_SCALE_DEFAULT));
  document.documentElement.style.setProperty('--fs', `${16 * s}px`);
}

export interface CustomCategory { key: string; label: string }

// 預設分類 + 使用者自訂分類（自訂的沒有關鍵字，靠 userRules 對應）
export async function getCategories(): Promise<Category[]> {
  const custom = await getSetting<CustomCategory[]>('customCategories', []);
  const extra: Category[] = custom.map((c) => ({ key: c.key, label: c.label, emoji: '🏷️', keywords: [] }));
  // 「收入」永遠排最後
  const base = DEFAULT_CATEGORIES.filter((c) => c.key !== 'income');
  const income = DEFAULT_CATEGORIES.find((c) => c.key === 'income')!;
  return [...base, ...extra, income];
}

export function categorySelect(categories: Category[], value: string, attrs: Attrs = {}): HTMLSelectElement {
  const sel = h('select', attrs);
  for (const c of categories) {
    const opt = h('option', { value: c.key }, `${c.emoji} ${c.label}`);
    if (c.key === value) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
