// 設定：自訂分類、學到的規則、CSV 匯出／匯入、清除、隱私說明
import { categoryLabel } from '../categories';
import { fromCSV, toCSV } from '../csv';
import { bulkImport, bulkImportRecurring, clearAll, countAll, deleteRecurring, deleteUserRule, getSetting, listAll, listRecurring, listUserRules, setSetting, updateRecurring } from '../db';
import { describeRule, friendlyOccurrence, nextOccurrence } from '../recurring';
import { formatTWD } from '../stats';
import type { RecurringRule } from '../types';
import { categorySelect, getCategories, h, toast, todayStr, type CustomCategory } from './common';

const APP_VERSION = '0.3.2';

function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  const categories = await getCategories();
  const rules = await listUserRules();
  const recurring = await listRecurring();
  const custom = await getSetting<CustomCategory[]>('customCategories', []);
  const total = await countAll();

  // ---- 週期規則 ----
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  // 就地編輯：保留規則 id 與補記進度，只改內容
  function ruleItem(r: RecurringRule): HTMLElement {
    const li = h('li', { className: 'tx-item', style: r.active ? '' : 'opacity:.55' });
    const view = () => {
      const cat = categories.find((c) => c.key === r.category);
      const next = r.active ? friendlyOccurrence(nextOccurrence(r, todayStr())) : '已暫停';
      li.replaceChildren(
        h('div', { className: 'tx-main' },
          h('span', { className: 'tx-note' }, `🔁 ${describeRule(r)} · ${cat?.emoji ?? ''} ${r.note || cat?.label || r.category}`),
          h('span', { className: 'tx-meta' }, `${r.type === 'income' ? '+' : '−'}${formatTWD(r.amount)} · 下次 ${next}`),
        ),
        h('div', { className: 'tx-actions' },
          h('button', { className: 'btn', type: 'button', 'aria-label': '編輯', onClick: edit }, '改'),
          h('button', { className: 'btn', type: 'button', onClick: async () => {
            if (r.id == null) return;
            await updateRecurring(r.id, { active: !r.active });
            toast(r.active ? '已暫停' : '已啟用');
            await renderSettings(root);
          } }, r.active ? '暫停' : '啟用'),
          h('button', { className: 'btn', type: 'button', 'aria-label': '刪除', onClick: async () => {
            if (r.id == null) return;
            if (!confirm(`刪除規則「${describeRule(r)} ${r.note} ${formatTWD(r.amount)}」？已經記進去的筆數會留著。`)) return;
            await deleteRecurring(r.id);
            toast('已刪除規則');
            await renderSettings(root);
          } }, '刪'),
        ),
      );
    };
    const edit = () => {
      const freqSel = h('select');
      for (const [v, label] of [['daily', '每天'], ['weekly', '每週'], ['monthly', '每月'], ['yearly', '每年']] as const) {
        const o = h('option', { value: v }, label);
        if (v === r.freq) o.selected = true;
        freqSel.append(o);
      }
      const dowSel = h('select');
      WEEKDAYS.forEach((w, i) => { const o = h('option', { value: String(i) }, `週${w}`); if (i === (r.dayOfWeek ?? 1)) o.selected = true; dowSel.append(o); });
      const domInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '31', step: '1', value: String(r.dayOfMonth ?? 1) });
      const monthInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '12', step: '1', value: String(r.month ?? 1) });
      const dayInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '31', step: '1', value: String(r.day ?? 1) });
      const typeSel = h('select');
      typeSel.append(h('option', { value: 'expense' }, '支出'), h('option', { value: 'income' }, '收入'));
      typeSel.value = r.type;
      const amountInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', step: '1', value: String(r.amount) });
      const catSel = categorySelect(categories, r.category);
      const noteInput = h('input', { type: 'text', value: r.note });

      const whenBox = h('div');
      const paintWhen = () => {
        const f = freqSel.value;
        whenBox.replaceChildren(
          f === 'weekly' ? h('div', {}, h('label', {}, '星期幾'), dowSel)
          : f === 'monthly' ? h('div', {}, h('label', {}, '每月幾號（31 = 月底）'), domInput)
          : f === 'yearly' ? h('div', { className: 'grid-2' }, h('div', {}, h('label', {}, '月'), monthInput), h('div', {}, h('label', {}, '日'), dayInput))
          : h('p', { className: 'hint', style: 'margin:0' }, '每天都記一筆'),
        );
      };
      freqSel.addEventListener('change', paintWhen);
      paintWhen();

      li.replaceChildren(
        h('div', { className: 'tx-edit' },
          h('div', { className: 'grid-2' },
            h('div', {}, h('label', {}, '週期'), freqSel),
            whenBox,
            h('div', {}, h('label', {}, '收支'), typeSel),
            h('div', {}, h('label', {}, '金額'), amountInput),
            h('div', {}, h('label', {}, '分類'), catSel),
            h('div', {}, h('label', {}, '備註'), noteInput),
          ),
          h('div', { className: 'btn-row' },
            h('button', { className: 'btn primary', type: 'button', onClick: async () => {
              if (r.id == null) return;
              const freq = freqSel.value as RecurringRule['freq'];
              // 換週期時把不相干的欄位清掉，validateRecurringRule 只認對應欄位
              const patch: Partial<RecurringRule> = {
                freq,
                dayOfWeek: freq === 'weekly' ? Number(dowSel.value) : undefined,
                dayOfMonth: freq === 'monthly' ? Number(domInput.value) : undefined,
                month: freq === 'yearly' ? Number(monthInput.value) : undefined,
                day: freq === 'yearly' ? Number(dayInput.value) : undefined,
                type: typeSel.value as RecurringRule['type'],
                amount: Number(amountInput.value),
                category: catSel.value,
                note: noteInput.value.trim(),
              };
              try {
                await updateRecurring(r.id, patch);
                toast('已更新規則');
                await renderSettings(root);
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

  const recurringList = recurring.length === 0
    ? h('p', { className: 'muted small', style: 'margin:0' }, '在「記一筆」打「每月 1 號 房租 18500」「每週一 健身 300」「每天 咖啡 65」就會建立。')
    : h('ul', { className: 'tx-list' }, ...recurring.map(ruleItem));

  function exportRules(): void {
    if (recurring.length === 0) { toast('沒有規則可匯出'); return; }
    const rows = recurring.map(({ id: _id, ...r }) => r);
    downloadText(`easy-ledger-rules-${todayStr()}.json`, JSON.stringify(rows, null, 2), 'application/json');
    toast(`已匯出 ${rows.length} 條規則`);
  }

  const rulesFileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  rulesFileInput.addEventListener('change', async () => {
    const f = rulesFileInput.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data)) throw new Error('JSON 最外層必須是陣列');
      if (!confirm(`要匯入 ${data.length} 條規則嗎？（會加在現有規則後面）`)) return;
      const n = await bulkImportRecurring(data);
      toast(`已匯入 ${n} 條規則`);
      await renderSettings(root);
    } catch (e) {
      alert(`匯入失敗：${(e as Error).message}`);
    } finally {
      rulesFileInput.value = '';
    }
  });

  // ---- 自訂分類 ----
  const newCatInput = h('input', { type: 'text', placeholder: '例如：寵物', maxlength: '10' });
  const customList = h('div', { className: 'chip-list' });
  function drawCustom(list: CustomCategory[]): void {
    customList.replaceChildren(...list.map((c) => h('span', { className: 'chip' }, `🏷️ ${c.label}`,
      h('button', { type: 'button', title: '移除', onClick: async () => {
        const next = list.filter((x) => x.key !== c.key);
        await setSetting('customCategories', next);
        toast('已移除分類（既有紀錄會顯示原 key）');
        drawCustom(next);
      } }, '✕'))));
    if (list.length === 0) customList.append(h('span', { className: 'muted small' }, '還沒有自訂分類'));
  }
  drawCustom(custom);

  async function addCustom(): Promise<void> {
    const label = newCatInput.value.trim();
    if (!label) return;
    const list = await getSetting<CustomCategory[]>('customCategories', []);
    if (list.some((c) => c.label === label) || categories.some((c) => c.label === label)) {
      toast('已經有這個分類了');
      return;
    }
    const key = `custom_${Date.now().toString(36)}`;
    const next = [...list, { key, label }];
    await setSetting('customCategories', next);
    newCatInput.value = '';
    toast(`已新增分類「${label}」`);
    drawCustom(next);
  }

  // ---- 匯出 / 匯入 ----
  async function exportCSV(): Promise<void> {
    const rows = await listAll();
    if (rows.length === 0) { toast('沒有資料可匯出'); return; }
    downloadText(`easy-ledger-${todayStr()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
    toast(`已匯出 ${rows.length} 筆`);
  }

  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const rows = fromCSV(text);
      if (!confirm(`要匯入 ${rows.length} 筆嗎？（會加在現有資料後面，不會覆蓋）`)) return;
      const n = await bulkImport(rows);
      toast(`已匯入 ${n} 筆`);
      window.dispatchEvent(new Event('ledger:changed'));
      await renderSettings(root);
    } catch (e) {
      alert(`匯入失敗：${(e as Error).message}`);
    } finally {
      fileInput.value = '';
    }
  });

  async function wipe(): Promise<void> {
    if (!confirm(`確定要刪掉全部 ${total} 筆紀錄、${recurring.length} 條週期規則與學到的分類規則嗎？這無法復原。建議先匯出 CSV 與規則 JSON。`)) return;
    if (!confirm('再確認一次：真的要清空？')) return;
    await clearAll();
    toast('已清空');
    window.dispatchEvent(new Event('ledger:changed'));
    await renderSettings(root);
  }

  root.replaceChildren(
    h('div', { className: 'card' },
      h('h2', {}, '你的資料在哪裡'),
      h('p', { className: 'small', style: 'margin:0;line-height:1.75' },
        '所有紀錄只存在這台裝置的瀏覽器裡，不會上傳。換手機或清除瀏覽器資料，紀錄就沒了 — ',
        h('strong', { style: 'color:var(--primary)' }, '請定期匯出 CSV 備份。'),
      ),
      h('p', { className: 'muted small', style: 'margin:10px 0 0;font-family:var(--mono)' }, `${total} 筆紀錄 · 版本 ${APP_VERSION}`),
    ),
    h('div', { className: 'card' },
      h('h2', {}, '備份與還原'),
      h('div', { className: 'btn-row', style: 'margin-top:0' },
        h('button', { className: 'btn primary', type: 'button', onClick: exportCSV }, '⬇️ 匯出 CSV'),
        h('button', { className: 'btn', type: 'button', onClick: () => fileInput.click() }, '⬆️ 匯入 CSV'),
      ),
      fileInput,
      h('p', { className: 'hint' }, 'CSV 可用 Excel / Google 試算表打開。匯入時每一筆都會檢查格式，有錯整批不收。'),
    ),
    h('div', { className: 'card' },
      h('h2', {}, `週期規則 · ${recurring.length}`),
      recurringList,
      h('div', { className: 'btn-row' },
        h('button', { className: 'btn', type: 'button', onClick: exportRules }, '⬇️ 匯出規則 JSON'),
        h('button', { className: 'btn', type: 'button', onClick: () => rulesFileInput.click() }, '⬆️ 匯入規則 JSON'),
      ),
      rulesFileInput,
      h('p', { className: 'hint' }, '每次開啟 App 會自動把到期的規則記進去，兩個月沒開也會補齊。要改規則按「改」。規則不在 CSV 裡，換手機請另外匯出 JSON。'),
    ),
    h('div', { className: 'card' },
      h('h2', {}, '自訂分類'),
      customList,
      h('div', { className: 'row', style: 'margin-top:11px' },
        newCatInput,
        h('button', { className: 'btn', type: 'button', style: 'flex:0 0 auto', onClick: addCustom }, '新增'),
      ),
    ),
    h('div', { className: 'card' },
      h('h2', {}, `學到的分類規則 · ${rules.length}`),
      rules.length === 0
        ? h('p', { className: 'muted small', style: 'margin:0' }, '當你手動改過分類，這裡會記住「備註 → 分類」，下次自動套用。')
        : h('div', { className: 'chip-list' }, ...rules.map((r) => h('span', { className: 'chip mono' },
            `${r.keyword} → ${categoryLabel(r.category, categories)}`,
            h('button', { type: 'button', title: '刪除規則', onClick: async () => {
              if (r.id == null) return;
              await deleteUserRule(r.id);
              toast('已刪除規則');
              await renderSettings(root);
            } }, '✕'),
          ))),
    ),
    h('div', { className: 'card danger' },
      h('h2', {}, '危險區'),
      h('button', { className: 'btn danger block', type: 'button', onClick: wipe }, '🗑️ 清除全部資料'),
    ),
  );
}
