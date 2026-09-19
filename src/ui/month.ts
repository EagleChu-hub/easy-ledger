// 本月：收支總覽、分類占比、與上月比、交易列表（可改/刪）
import { categoryLabel, findCategory } from '../categories';
import { deleteTransaction, listByMonth, updateTransaction, upsertUserRule } from '../db';
import { compareCategories, formatSigned, formatTWD, shiftMonth, summarizeMonth } from '../stats';
import type { Transaction } from '../types';
import { categorySelect, currentMonth, getCategories, h, toast } from './common';

let viewMonth = currentMonth();

export async function renderMonth(root: HTMLElement): Promise<void> {
  const categories = await getCategories();

  async function draw(): Promise<void> {
    const [cur, prev] = await Promise.all([listByMonth(viewMonth), listByMonth(shiftMonth(viewMonth, -1))]);
    const s = summarizeMonth(cur, viewMonth);
    const p = summarizeMonth(prev, shiftMonth(viewMonth, -1));
    const cmp = compareCategories(s, p);
    const maxCat = s.byCategory[0]?.amount ?? 0;

    const nav = h('div', { className: 'month-nav' },
      h('button', { className: 'btn', type: 'button', onClick: () => { viewMonth = shiftMonth(viewMonth, -1); void draw(); } }, '‹ 上月'),
      h('strong', {}, viewMonth.replace('-', ' 年 ') + ' 月'),
      h('button', { className: 'btn', type: 'button', onClick: () => { viewMonth = shiftMonth(viewMonth, 1); void draw(); } }, '下月 ›'),
    );

    const overview = h('div', { className: 'card' },
      h('div', { className: 'grid-2' },
        h('div', { className: 'stat' }, h('span', { className: 'k' }, '收入'), h('span', { className: 'amount big income' }, formatTWD(s.income))),
        h('div', { className: 'stat' }, h('span', { className: 'k' }, '支出'), h('span', { className: 'amount big' }, formatTWD(s.expense))),
      ),
      h('div', { className: 'hr' }),
      h('div', { className: 'balance-row' },
        h('span', { className: 'muted small' }, '結餘'),
        h('strong', { className: `amount ${s.balance >= 0 ? 'income' : 'expense'}`, style: 'font-size:20px' }, formatSigned(s.balance)),
      ),
      h('p', { className: 'hint' }, `共 ${s.count} 筆 · 上月支出 ${formatTWD(p.expense)}（${formatSigned(s.expense - p.expense)}）`),
    );

    const bars = h('div', { className: 'card' },
      h('h2', {}, '支出分類 · 與上月比'),
      s.byCategory.length === 0
        ? h('p', { className: 'empty' }, '這個月還沒有支出')
        : h('div', { className: 'bar-list' }, ...cmp.filter((c) => c.current > 0).map((c) => {
            const cat = findCategory(c.category, categories);
            return h('div', { className: 'bar-item' },
              h('div', { className: 'bar-head' },
                h('span', {}, `${cat?.emoji ?? ''} ${categoryLabel(c.category, categories)}`),
                h('span', { className: 'bar-nums' },
                  h('span', { className: 'amount' }, formatTWD(c.current)),
                  h('span', { className: `diff ${c.diff > 0 ? 'up' : c.diff < 0 ? 'down' : ''}` }, formatSigned(c.diff)),
                ),
              ),
              h('div', { className: 'bar-track' },
                h('div', { className: 'bar-fill', style: `width:${maxCat ? Math.round((c.current / maxCat) * 100) : 0}%` })),
            );
          })),
    );

    const list = h('div', { className: 'card' },
      h('h2', {}, '交易明細'),
      cur.length === 0
        ? h('p', { className: 'empty' }, '沒有紀錄')
        : h('ul', { className: 'tx-list' }, ...cur.map((t) => txItem(t))),
    );

    root.replaceChildren(nav, overview, bars, list);
  }

  function txItem(t: Transaction): HTMLElement {
    const li = h('li', { className: 'tx-item' });
    const view = () => li.replaceChildren(
      h('div', { className: 'tx-main' },
        h('span', { className: 'tx-note' }, `${findCategory(t.category, categories)?.emoji ?? ''} ${t.note || categoryLabel(t.category, categories)}`),
        h('span', { className: 'tx-meta' }, `${t.recurringId != null ? '🔁 ' : ''}${t.date} · ${categoryLabel(t.category, categories)}`),
      ),
      h('div', { className: 'tx-actions' },
        h('span', { className: `amount ${t.type}` }, `${t.type === 'income' ? '+' : '−'}${formatTWD(t.amount)}`),
        h('button', { className: 'btn', type: 'button', 'aria-label': '編輯', onClick: edit }, '改'),
        h('button', { className: 'btn', type: 'button', 'aria-label': '刪除', onClick: async () => {
          if (t.id == null) return;
          if (!confirm(`刪除「${t.note || categoryLabel(t.category, categories)} ${formatTWD(t.amount)}」？`)) return;
          await deleteTransaction(t.id);
          toast('已刪除');
          window.dispatchEvent(new Event('ledger:changed'));
          await draw();
        } }, '刪'),
      ),
    );
    const edit = () => {
      const dateInput = h('input', { type: 'date', value: t.date });
      const amountInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', step: '1', value: String(t.amount) });
      const catSel = categorySelect(categories, t.category);
      const noteInput = h('input', { type: 'text', value: t.note });
      li.replaceChildren(
        h('div', { className: 'tx-edit' },
          h('div', { className: 'grid-2' },
            h('div', {}, h('label', {}, '日期'), dateInput),
            h('div', {}, h('label', {}, '金額'), amountInput),
            h('div', {}, h('label', {}, '分類'), catSel),
            h('div', {}, h('label', {}, '備註'), noteInput),
          ),
          h('div', { className: 'btn-row' },
            h('button', { className: 'btn primary', type: 'button', onClick: async () => {
              if (t.id == null) return;
              try {
                const newCat = catSel.value;
                await updateTransaction(t.id, {
                  date: dateInput.value,
                  amount: Number(amountInput.value),
                  category: newCat,
                  note: noteInput.value.trim(),
                });
                if (newCat !== t.category && noteInput.value.trim() && t.type === 'expense') {
                  await upsertUserRule(noteInput.value.trim(), newCat);
                }
                toast('已更新');
                window.dispatchEvent(new Event('ledger:changed'));
                await draw();
              } catch (e) {
                toast((e as Error).message, 3500);
              }
            } }, '儲存'),
            h('button', { className: 'btn', type: 'button', onClick: view }, '取消'),
          ),
        ),
      );
    };
    view();
    return li;
  }

  await draw();
}
