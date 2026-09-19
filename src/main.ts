import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { applyDueRecurring, listByMonth } from './db';
import { formatTWD, summarizeMonth } from './stats';
import { renderAI } from './ui/ai';
import { renderMonth } from './ui/month';
import { renderRecord } from './ui/record';
import { renderSettings } from './ui/settings';
import { currentMonth, toast } from './ui/common';

type Tab = 'record' | 'month' | 'ai' | 'settings';

const PAGES: Record<Tab, { title: string; render: (root: HTMLElement) => Promise<void> }> = {
  record: { title: '記一筆', render: renderRecord },
  month: { title: '本月', render: renderMonth },
  ai: { title: '問 AI', render: renderAI },
  settings: { title: '設定', render: renderSettings },
};

const MONTH_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

function currentTab(): Tab {
  const hash = location.hash.replace('#', '') as Tab;
  return hash in PAGES ? hash : 'record';
}

// 頂欄右側：本月已花，任何畫面都看得到
async function paintTopbarMeta(): Promise<void> {
  const el = document.getElementById('topbar-meta');
  if (!el) return;
  const month = currentMonth();
  const s = summarizeMonth(await listByMonth(month), month);
  const name = MONTH_NAMES[Number(month.slice(5)) - 1] ?? '';
  el.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: `${name}月已花` }),
    Object.assign(document.createElement('b'), { textContent: formatTWD(s.expense) }),
  );
}

async function route(): Promise<void> {
  const tab = currentTab();
  const view = document.getElementById('view')!;
  const dock = document.getElementById('dock')!;
  const title = document.getElementById('page-title')!;
  title.textContent = PAGES[tab].title;
  document.querySelectorAll<HTMLAnchorElement>('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
  view.replaceChildren();
  dock.replaceChildren();
  document.body.classList.remove('has-dock');
  try {
    await PAGES[tab].render(view);
  } catch (e) {
    view.replaceChildren(Object.assign(document.createElement('p'), { className: 'error', textContent: `畫面載入失敗：${(e as Error).message}` }));
    console.error(e);
  }
  void paintTopbarMeta();
  window.scrollTo(0, 0);
}

// 啟動與回到前景時，把週期規則補記到今天
async function runRecurring(): Promise<void> {
  try {
    const n = await applyDueRecurring();
    if (n > 0) {
      toast(`已自動記入 ${n} 筆週期收支`, 3000);
      window.dispatchEvent(new Event('ledger:changed'));
      if (currentTab() !== 'record') void route(); // 本月／設定頁要重畫
    }
  } catch (e) {
    console.error('applyDueRecurring failed', e);
  }
}

window.addEventListener('hashchange', () => { void route(); });
window.addEventListener('ledger:changed', () => { void paintTopbarMeta(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void runRecurring(); });
void (async () => { await runRecurring(); await route(); })();

// PWA：有新版本時自動更新
registerSW({ immediate: true });
