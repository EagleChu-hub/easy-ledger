// 設定：自訂分類、學到的規則、CSV 匯出／匯入、清除、隱私說明
import { categoryLabel } from '../categories';
import { fromCSV, toCSV } from '../csv';
import { bulkImport, clearAll, countAll, deleteUserRule, getSetting, listAll, listUserRules, setSetting } from '../db';
import { getCategories, h, toast, type CustomCategory } from './common';

const APP_VERSION = '0.1.0';

export async function renderSettings(root: HTMLElement): Promise<void> {
  const categories = await getCategories();
  const rules = await listUserRules();
  const custom = await getSetting<CustomCategory[]>('customCategories', []);
  const total = await countAll();

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
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `easy-ledger-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    if (!confirm(`確定要刪掉全部 ${total} 筆紀錄與學到的規則嗎？這無法復原。建議先匯出 CSV。`)) return;
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
