// 記一筆：輸入 → 一句話解析預覽 → 存起來（存檔鍵固定在鍵盤上方）
import { categoryLabel, findCategory } from '../categories';
import { addRecurring, addTransaction, applyDueRecurring, deleteTransaction, listAll, listUserRules, upsertUserRule } from '../db';
import { parseTransaction, type ParsedTransaction } from '../parser';
import { describeRule, friendlyOccurrence, nextOccurrence, parseRecurring, type RecurringDraft } from '../recurring';
import { formatTWD } from '../stats';
import { getCategories, h, toast, todayStr } from './common';

const QUICKS = ['午餐 120', '咖啡 65', '通勤 30', '晚餐 180', '超市'];

function shiftDay(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function friendlyDate(iso: string): string {
  const today = todayStr();
  if (iso === today) return '今天';
  if (iso === shiftDay(today, -1)) return '昨天';
  if (iso === shiftDay(today, -2)) return '前天';
  if (iso === shiftDay(today, 1)) return '明天';
  if (iso === shiftDay(today, 2)) return '後天';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export async function renderRecord(root: HTMLElement): Promise<void> {
  const categories = await getCategories();
  const pickable = categories.filter((c) => c.key !== 'income');
  let userRules = await listUserRules();
  let parsed: ParsedTransaction | undefined;
  let recurring: RecurringDraft | undefined; // 有值 = 這句是週期規則
  let picked: string | null = null;
  let typeVal: 'expense' | 'income' = 'expense';

  // ---- 輸入卡：整個 App 的核心，字級最大、一進畫面就 focus ----
  const input = h('input', {
    id: 'record-input',
    type: 'text',
    className: 'compose-input',
    placeholder: '午餐 180',
    autocomplete: 'off',
    autofocus: true,
    enterkeyhint: 'done',
  });
  const quickRow = h('div', { className: 'quick-row' }, ...QUICKS.map((q) =>
    h('button', { type: 'button', className: 'quick', onClick: () => { input.value = q; picked = null; runParse(); input.focus(); } }, q)));
  const errorBox = h('div', { className: 'error', hidden: true });

  // ---- 一句話預覽（不是四欄表單；虛線字可點著改）----
  const dateInput = h('input', { type: 'date' });
  const dateText = h('span', {}, '今天');
  const dateToken = h('label', { className: 'token token-date' }, dateText, dateInput);
  const recurToken = h('span', { className: 'token token-recur', hidden: true }, '🔁 每月 1 號');
  const verb = h('span', { className: 'sep' }, '花了');
  const catToken = h('button', { type: 'button', className: 'token' }, '？分類');
  const noteInput = h('input', { type: 'text', className: 'token token-note', placeholder: '品項' });
  const amountInput = h('input', { type: 'number', className: 'amount-input', inputmode: 'numeric', min: '1', step: '1' });
  const typeBtn = h('button', { type: 'button', className: 'type-toggle' }, '支出 · 元');
  const amountBlock = h('div', { className: 'amount-block' }, amountInput, typeBtn);
  const catGrid = h('div', { className: 'cat-grid', hidden: true });
  const hint = h('p', { className: 'hint' });
  const flag = h('div', { className: 'preview-flag' }, h('span', {}, '✋'), h('span', {}, '這筆要你選一下分類'));

  const preview = h('div', { className: 'preview', hidden: true },
    flag,
    h('div', { className: 'preview-body' },
      h('div', { className: 'preview-top' },
        h('div', { className: 'sentence' }, recurToken, dateToken, ' ', verb, ' ', catToken, h('span', { className: 'sep' }, '，記為'), ' ', noteInput),
        amountBlock,
      ),
      catGrid,
      hint,
    ),
  );

  for (const c of pickable) {
    catGrid.append(h('button', {
      type: 'button',
      className: 'cat-btn',
      'data-key': c.key,
      onClick: () => { picked = c.key; catGrid.hidden = true; paint(); },
    }, h('span', { className: 'e' }, c.emoji), h('span', { className: 'l' }, c.label)));
  }
  catToken.addEventListener('click', () => { catGrid.hidden = !catGrid.hidden; });
  typeBtn.addEventListener('click', () => { typeVal = typeVal === 'expense' ? 'income' : 'expense'; paint(); });
  dateInput.addEventListener('change', () => { dateText.textContent = friendlyDate(dateInput.value); });
  noteInput.addEventListener('input', sizeNote);
  amountInput.addEventListener('input', paintSaveBtn);

  function sizeNote(): void {
    noteInput.style.width = `${Math.max(3, Math.min(9, noteInput.value.length + 1))}em`;
  }

  // ---- 存檔列：固定在分頁列上方，鍵盤升起時就落在鍵盤正上方 ----
  const saveBtn = h('button', { type: 'button', className: 'btn primary block savebar-btn', onClick: () => void save() }, '打一句就能記帳');
  const dock = document.getElementById('dock')!;
  dock.replaceChildren(h('div', { className: 'dock-inner' }, saveBtn));
  document.body.classList.add('has-dock');

  function currentCategory(): string {
    return picked ?? parsed?.category ?? '';
  }

  // 低信心：解析器不確定分類，且使用者還沒選 → 唯一需要動手的時刻
  function isLow(): boolean {
    return !!parsed && parsed.confidence < 0.9 && picked === null && typeVal === 'expense';
  }

  function paintSaveBtn(): void {
    const low = isLow();
    const ready = !!parsed && !low && Number(amountInput.value) > 0;
    saveBtn.disabled = !ready;
    saveBtn.classList.toggle('locked', low);
    saveBtn.textContent = !parsed ? '打一句就能記帳' : low ? '選好分類才能存' : recurring ? '建立週期規則' : '存起來';
  }

  function nextDateText(): string {
    if (!recurring) return '';
    return friendlyOccurrence(nextOccurrence(recurring, todayStr()));
  }

  function paint(): void {
    if (!parsed) { preview.hidden = true; paintSaveBtn(); return; }
    const low = isLow();
    preview.classList.toggle('low', low);
    verb.textContent = typeVal === 'income' ? '收到' : '花了';
    typeBtn.textContent = `${typeVal === 'income' ? '收入' : '支出'} · 元`;
    amountBlock.classList.toggle('is-income', typeVal === 'income');

    // 低信心且還沒選：解析器只是暫填「其他」，chip 要顯示「？分類」而不是「其他」
    const key = typeVal === 'income' ? 'income' : low ? '' : currentCategory();
    const cat = key ? findCategory(key, categories) : undefined;
    catToken.textContent = cat ? `${cat.emoji} ${cat.label}` : '？分類';
    catToken.classList.toggle('needs', !cat);

    if (low) catGrid.hidden = false;
    for (const b of Array.from(catGrid.children) as HTMLElement[]) {
      b.classList.toggle('selected', b.dataset.key === key);
    }

    // 週期模式：句首顯示「🔁 每月 1 號」，日期 token 換成「起」
    recurToken.hidden = !recurring;
    dateToken.hidden = !!recurring;
    if (recurring) recurToken.textContent = `🔁 ${describeRule(recurring)}`;

    hint.textContent = low
      ? '選了之後我會記住這個詞對應的分類，下次自動帶。'
      : recurring
        ? `這是週期規則，每次到日子會自動記一筆。下次：${nextDateText()}`
        : '虛線的字可以直接點著改。';
    preview.hidden = false;
    paintSaveBtn();
  }

  function showParseError(reason: string): void {
    parsed = undefined;
    recurring = undefined;
    picked = null;
    preview.hidden = true;
    paintSaveBtn();
    if (reason === 'empty') { errorBox.hidden = true; return; }
    errorBox.textContent = reason === 'no_amount'
      ? '沒找到金額。請像這樣：「午餐 180」'
      : '金額看起來不對（要大於 0）。';
    errorBox.hidden = false;
  }

  function runParse(): void {
    // 先試週期句：「每月 1 號 房租 18500」「每週一 健身 300」
    const rec = parseRecurring(input.value, { categories, userRules });
    if (rec.ok) {
      recurring = rec.draft;
      parsed = {
        date: todayStr(),
        type: rec.draft.type,
        amount: rec.draft.amount,
        category: rec.draft.category,
        note: rec.draft.note,
        confidence: rec.draft.confidence,
        rawInput: input.value,
      };
    } else if (rec.reason !== 'not_recurring') {
      showParseError(rec.reason);
      return;
    } else {
      recurring = undefined;
      const r = parseTransaction(input.value, { categories, userRules });
      if (!r.ok) { showParseError(r.reason); return; }
      parsed = r.value;
    }
    errorBox.hidden = true;
    typeVal = parsed.type;
    dateInput.value = parsed.date;
    dateText.textContent = friendlyDate(parsed.date);
    amountInput.value = String(parsed.amount);
    noteInput.value = parsed.note;
    sizeNote();
    catGrid.hidden = true;
    paint();
  }

  async function save(): Promise<void> {
    if (!parsed || saveBtn.disabled) return;
    const amount = Number(amountInput.value);
    const category = typeVal === 'income' ? 'income' : currentCategory();
    const note = noteInput.value.trim();
    try {
      const cat = findCategory(category, categories);
      if (recurring) {
        const { confidence: _c, ...draft } = recurring;
        await addRecurring({ ...draft, type: typeVal, amount, category, note });
        const n = await applyDueRecurring(); // 今天就是發生日的話，立刻記一筆
        const next = nextDateText();
        toast(`已建立 🔁 ${describeRule(recurring)} ${note || cat?.label} ${formatTWD(amount)}${n > 0 ? '，今天已記一筆' : `，下次 ${next}`}`, 3500);
      } else {
        await addTransaction({
          date: dateInput.value,
          type: typeVal,
          amount,
          category,
          note,
          rawInput: parsed.rawInput,
        });
        toast(`已記錄 ${cat?.emoji ?? ''} ${note || cat?.label} ${formatTWD(amount)} 元`);
      }
      // 使用者改了分類 → 記住這個備註對應的分類，下次自動套用
      if (category !== parsed.category && note && typeVal === 'expense') {
        await upsertUserRule(note, category);
        userRules = await listUserRules();
      }
      input.value = '';
      parsed = undefined;
      recurring = undefined;
      picked = null;
      typeVal = 'expense';
      preview.hidden = true;
      preview.classList.remove('low');
      catGrid.hidden = true;
      paintSaveBtn();
      input.focus();
      window.dispatchEvent(new Event('ledger:changed'));
      await renderRecent();
    } catch (e) {
      errorBox.textContent = (e as Error).message;
      errorBox.hidden = false;
    }
  }

  // ---- 最近 ----
  const recentBox = h('div');
  async function renderRecent(): Promise<void> {
    const recent = (await listAll()).slice(0, 5);
    recentBox.replaceChildren(
      h('h2', {}, '最近'),
      recent.length === 0
        ? h('p', { className: 'empty' }, '還沒有紀錄。在上面打一筆試試看。')
        : h('ul', { className: 'tx-list' }, ...recent.map((t) => h('li', { className: 'tx-item' },
            h('div', { className: 'tx-main' },
              h('span', { className: 'tx-note' }, `${findCategory(t.category, categories)?.emoji ?? ''} ${t.note || categoryLabel(t.category, categories)}`),
              h('span', { className: 'tx-meta' }, `${t.recurringId != null ? '🔁 ' : ''}${friendlyDate(t.date)} · ${categoryLabel(t.category, categories)}`),
            ),
            h('div', { className: 'tx-actions' },
              h('span', { className: `amount ${t.type}` }, `${t.type === 'income' ? '+' : '−'}${formatTWD(t.amount)}`),
              h('button', { className: 'btn', type: 'button', 'aria-label': '刪除', onClick: async () => {
                if (t.id == null) return;
                await deleteTransaction(t.id);
                toast('已刪除');
                window.dispatchEvent(new Event('ledger:changed'));
                await renderRecent();
              } }, '刪'),
            ),
          ))),
    );
  }

  input.addEventListener('input', () => { picked = null; runParse(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (parsed) void save();
      else runParse();
    }
  });

  // ---- 語音：用瀏覽器內建的 Web Speech API（Chrome/Safari 有，Firefox 沒有），不經任何自家伺服器 ----
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  const micBtn = h('button', { type: 'button', className: 'mic-btn', title: '按一下用說的' }, SR ? '🎤 用說的' : '🎤 用鍵盤的麥克風');
  let rec: any = null;
  micBtn.addEventListener('click', () => {
    if (!SR) { toast('這個瀏覽器不支援語音，請點輸入框後用鍵盤上的麥克風', 3500); input.focus(); return; }
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'zh-TW';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    micBtn.textContent = '🎤 聽著…（再按一下停）';
    micBtn.classList.add('listening');
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      input.value = text.trim();
      picked = null;
      runParse();
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('麥克風被擋住了：請到瀏覽器設定允許這個網站使用麥克風', 4000);
      else if (e.error === 'no-speech') toast('沒聽到聲音，再試一次', 2500);
      else if (e.error !== 'aborted') toast(`語音出錯：${e.error}`, 3000);
    };
    rec.onend = () => {
      rec = null;
      micBtn.textContent = '🎤 用說的';
      micBtn.classList.remove('listening');
      if (input.value) input.focus();
    };
    try { rec.start(); } catch { rec = null; micBtn.textContent = '🎤 用說的'; toast('語音啟動失敗，請改用鍵盤上的麥克風', 3000); }
  });

  root.replaceChildren(
    h('div', { className: 'card' },
      h('div', { className: 'compose-head' },
        h('span', { className: 'eyebrow' }, '說一句或打一句'),
        micBtn,
      ),
      input,
      h('div', { className: 'compose-rule' }),
      quickRow,
      errorBox,
    ),
    preview,
    h('div', { className: 'card' }, recentBox),
  );
  sizeNote();
  paintSaveBtn();
  await renderRecent();
}
