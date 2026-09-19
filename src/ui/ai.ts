// 問 AI：產生摘要 + 提示詞，分享到使用者自己的 AI App（或複製）
import { buildPrompt, buildSummaryText, QUESTION_TEMPLATES } from '../ai-summary';
import { listByMonth } from '../db';
import { shiftMonth, summarizeMonth } from '../stats';
import { currentMonth, getCategories, h, toast } from './common';

export async function renderAI(root: HTMLElement): Promise<void> {
  const categories = await getCategories();
  const month = currentMonth();
  const [cur, prev] = await Promise.all([listByMonth(month), listByMonth(shiftMonth(month, -1))]);
  const summary = summarizeMonth(cur, month);
  const previous = summarizeMonth(prev, shiftMonth(month, -1));
  const summaryText = buildSummaryText(summary, previous, categories);

  const custom = h('textarea', { placeholder: '或自己打一個問題，例如：為什麼這個月結餘比較少？' });
  const output = h('pre', { className: 'summary-text' });
  const charCount = h('span', {});
  const choice = h('div', { className: 'choice' });
  let selectedKey = QUESTION_TEMPLATES[0].key;

  for (const q of QUESTION_TEMPLATES) {
    const radio = h('input', { type: 'radio', name: 'q', value: q.key, onChange: () => { selectedKey = q.key; custom.value = ''; refresh(); } });
    if (q.key === selectedKey) radio.checked = true;
    choice.append(h('label', {}, radio, q.label));
  }

  function currentPrompt(): string {
    const q = custom.value.trim() || QUESTION_TEMPLATES.find((t) => t.key === selectedKey)?.prompt || '';
    return buildPrompt(summaryText, q);
  }
  function refresh(): void {
    const text = currentPrompt();
    output.textContent = text;
    charCount.textContent = `整段可長按選取，共 ${text.length} 字`;
  }
  custom.addEventListener('input', refresh);

  const canShare = typeof navigator.share === 'function';

  async function share(): Promise<void> {
    const text = currentPrompt();
    if (canShare) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copy();
  }
  // 先試 Clipboard API；被擋（舊瀏覽器、內嵌 WebView）就退回選取＋execCommand
  function legacyCopy(text: string): boolean {
    const ta = h('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;opacity:0;pointer-events:none' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  async function copy(): Promise<void> {
    const text = currentPrompt();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
    if (ok) toast('已複製，貼到你的 ChatGPT / Gemini / Claude 就行');
    else {
      // 兩種都不行：把預覽整段選起來，讓使用者直接長按複製
      const range = document.createRange();
      range.selectNodeContents(output);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      toast('這個瀏覽器不讓我複製，已幫你選好文字，請手動複製', 4000);
    }
  }

  root.replaceChildren(
    h('div', { className: 'card' },
      h('h2', {}, '怎麼運作'),
      h('ol', { className: 'steps' },
        h('li', {}, 'App 把本月數字整理成一段文字，不含每一筆明細'),
        h('li', {}, canShare ? '按「分享」，選你手機上的 ChatGPT、Gemini 或 Claude' : '按「複製」，貼到你常用的 AI'),
        h('li', {}, '本 App 收不到任何回答，也不收費'),
      ),
    ),
    h('div', { className: 'card' },
      h('h2', {}, '想問什麼'),
      choice,
      h('div', { style: 'margin-top:11px' }, custom),
      h('div', { className: 'btn-row' },
        canShare
          ? h('button', { className: 'btn primary', type: 'button', onClick: share }, '📤 分享到我的 AI')
          : null,
        h('button', { className: canShare ? 'btn' : 'btn primary', type: 'button', onClick: copy }, '📋 複製'),
      ),
    ),
    // 預覽＝「一段可以複製貼上的文字」：等寬字、虛線紙條框、常駐複製鍵
    h('div', { className: 'summary-block' },
      h('div', { className: 'summary-head' },
        h('span', { className: 't' }, h('span', {}, '📋'), h('span', {}, summary.count === 0 ? '本月還沒有紀錄' : '將貼出的文字')),
        h('button', { className: 'btn primary tiny', type: 'button', onClick: copy }, '複製'),
      ),
      output,
      h('div', { className: 'summary-foot' }, charCount),
    ),
  );
  refresh();
}
