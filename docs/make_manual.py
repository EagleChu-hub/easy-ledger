# -*- coding: utf-8 -*-
"""輕鬆記帳 使用說明書（給人看的 PDF）。

    python docs/make_manual.py                 # 產到 ~/Downloads/輕鬆記帳_使用說明書.pdf
    python docs/make_manual.py <輸出路徑>

依賴 PyMuPDF 與 ~/.claude/skills/human-pdf-docs/scripts/story_pdf.py（Windows 正黑體）。
"""
import os
import re
import shutil
import sys
import tempfile
import time
import unicodedata
from html import unescape

import fitz

sys.path.insert(0, os.path.join(os.path.expanduser('~'), '.claude', 'skills', 'human-pdf-docs', 'scripts'))
import story_pdf  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser('~'), 'Downloads', '輕鬆記帳_使用說明書.pdf')
URL = 'https://eaglechu-hub.github.io/easy-ledger/'

CSS = """
@font-face { font-family: jh;  src: url(msjh.ttc); }
@font-face { font-family: jhb; src: url(msjhbd.ttc); }
* { font-family: jh; }
b, th { font-family: jhb; }
body { font-size: 11.5pt; line-height: 1.6; }

h1 { font-size: 21pt; text-align: center; color: #FFFFFF;
     background-color: #17324D; padding: 10pt 0; margin: 0; letter-spacing: 4pt; }
.sub { text-align: center; font-size: 10pt; color: #FFFFFF;
       background-color: #2C5378; padding: 5pt 0 6pt 0; margin: 0 0 10pt 0; }
h2 { font-size: 14pt; color: #FFFFFF; background-color: #17324D;
     padding: 5pt 9pt; margin: 14pt 0 7pt 0; }
h3 { font-size: 12.5pt; color: #17324D; margin: 10pt 0 4pt 0;
     border-bottom: 1.2pt solid #17324D; padding-bottom: 2pt; }

p { margin: 0 0 6pt 0; text-align: left; }
.big { font-size: 13pt; }
.sm { font-size: 9.5pt; color: #444444; }
.ind { margin-left: 22pt; }

.flow { background-color: #1B5E20; color: #FFFFFF; font-size: 13pt;
        text-align: center; padding: 8pt 4pt; margin: 0 0 9pt 0; letter-spacing: 1pt; }

.red { background-color: #FDECEA; border: 1.6pt solid #B3261E; padding: 8pt 10pt; margin: 8pt 0; }
.yel { background-color: #FFF6D5; border: 1.1pt solid #B58900; padding: 7pt 10pt; margin: 7pt 0; }
.grn { background-color: #E8F5E9; border: 1.1pt solid #1B5E20; padding: 7pt 10pt; margin: 7pt 0; }
.gry { background-color: #EFEFEF; border: 0.8pt solid #999999; padding: 7pt 10pt; margin: 7pt 0; }
.rt { color: #B3261E; }
.gt { color: #1B5E20; }
.bt { color: #17324D; }

p.ck { margin: 0 0 7pt 0; text-align: left; font-size: 12pt; }
.cb { font-size: 14pt; }

table.t { width: 100%; border-collapse: collapse; margin: 5pt 0 8pt 0; font-size: 10.5pt; }
table.t th { border: 0.8pt solid #17324D; padding: 5pt 6pt;
             background-color: #17324D; color: #FFFFFF; text-align: center; }
table.t td { border: 0.8pt solid #666666; padding: 5pt 7pt;
             text-align: center; vertical-align: top; }
table.t td.l { text-align: left; }
td.ok   { background-color: #E8F5E9; }
td.bad  { background-color: #FDECEA; }
td.warn { background-color: #FFF6D5; }
.mono { font-family: jhb; color: #17324D; }

.foot { margin-top: 12pt; font-size: 9pt; color: #555555;
        border-top: 0.8pt solid #999999; padding-top: 4pt; }
.pgbrk { page-break-before: always; height: 0; margin: 0; padding: 0; }
"""

HTML = """
<h1>輕鬆記帳　使用說明書</h1>
<p class="sub">打一句話就記好帳　│　資料只在你自己的手機　│　完全免費</p>

<p class="flow">① 打開網頁 → ② 加到主畫面 → ③ 打一句話記帳 → ④ 看本月 → ⑤ 問 AI</p>

<div class="grn"><p class="big" style="margin:0"><b class="gt">★ 這個 App 在做什麼？</b><br/>
你花了錢或收到錢，就用<b>一句話</b>告訴它，例如「午餐 180」。<br/>
它會幫你記下來、算好這個月花了多少，還能把數字整理好讓你拿去問 AI。</p></div>

<div class="red"><p style="margin:0"><b class="rt">最重要的一件事：你的資料只存在這支手機裡。</b><br/>
沒有人看得到，也不會上傳到任何地方。<b>但是</b>換手機、或把瀏覽器資料清掉，紀錄就會不見。
所以每個月要做一次「備份」（第 6 步教你）。</p></div>

<h2>第 1 步：打開它，放到手機桌面</h2>
<p>用手機的瀏覽器打開這個網址：</p>
<p class="big ind"><b class="mono">%(url)s</b></p>

<table class="t">
<tr><th width="22%%">你的手機</th><th>怎麼放到桌面（只要做一次）</th></tr>
<tr><td><b>iPhone</b></td><td class="l">用 <b>Safari</b> 打開 → 按下面中間的「分享」按鈕（一個方框加向上箭頭）→ 往下找「<b>加入主畫面</b>」→ 按「新增」</td></tr>
<tr><td><b>Android</b></td><td class="l">用 <b>Chrome</b> 打開 → 按右上角的「⋮」→ 選「<b>安裝應用程式</b>」或「<b>加到主畫面</b>」</td></tr>
</table>
<p class="sm">做完之後桌面會多一個「輕鬆記帳」的圖示，以後直接點它，像一般 App 一樣。沒有網路也能用。</p>

<div class="pgbrk"></div>
<h2>第 2 步：記一筆（最常用！）</h2>
<p>打開 App 就是「記一筆」畫面。在最上面的大框框裡，<b>打字或用說的</b>：</p>
<p class="ind sm">（用說的：按框框右上角的「<b>🎤 用說的</b>」，第一次瀏覽器會問「要不要讓它用麥克風」，按<b>允許</b>。
講完它會自己停。如果按鈕寫「用鍵盤的麥克風」，就點一下框框，用手機鍵盤上的麥克風講）</p>

<table class="t">
<tr><th width="40%%">你可以這樣打</th><th>它會記成</th></tr>
<tr><td class="l"><b class="mono">午餐&nbsp;180</b></td><td class="l">今天、餐飲、午餐、180 元</td></tr>
<tr><td class="l"><b class="mono">昨天&nbsp;Uber 245</b></td><td class="l">昨天、交通、Uber、245 元</td></tr>
<tr><td class="l"><b class="mono">全聯&nbsp;685&nbsp;元</b></td><td class="l">今天、日用、全聯、685 元</td></tr>
<tr><td class="l"><b class="mono">薪水&nbsp;52000</b></td><td class="l">今天、收入、薪水、52,000 元</td></tr>
<tr><td class="l"><b class="mono">上週三&nbsp;電影&nbsp;300</b></td><td class="l">上個星期三、娛樂、電影、300 元</td></tr>
</table>

<p>打完之後，下面會出現一句話，像這樣：</p>
<div class="gry"><p style="margin:0"><b>今天&nbsp;花了&nbsp;🍜&nbsp;餐飲，記為&nbsp;午餐&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;180</b><br/>
<span class="sm">有虛線的字都可以點一下直接改（改日期、改分類、改名字）。</span></p></div>
<p>看一眼沒問題，按最下面綠色的大按鈕「<b>存起來</b>」就完成了。</p>

<div class="yel"><p style="margin:0"><b>如果框框變成黃色、寫著「✋ 這筆要你選一下分類」</b><br/>
表示它不知道這是哪一類（例如你打了「小美 200」，它不認識小美）。<br/>
下面會跳出八個分類按鈕，<b>點一個</b>就好。它會記住：下次再打「小美」就自動歸到那一類。</p></div>

<h3>可以用的日期詞</h3>
<table class="t">
<tr><th width="30%%">你想記哪一天</th><th>就這樣打</th></tr>
<tr><td>今天</td><td class="l">什麼都不用加，例如「午餐 180」</td></tr>
<tr><td>過去幾天</td><td class="l">昨天、前天、大前天、3天前</td></tr>
<tr><td>未來幾天</td><td class="l">明天、後天、大後天、2天後</td></tr>
<tr><td>某個星期幾</td><td class="l">週三、星期五、上週三、下週二、上上週一、這週五</td></tr>
<tr><td>某個日期</td><td class="l">9/12、9月12日、上個月 5 號、下個月 1 號</td></tr>
</table>
<p class="sm">「週三」沒有加「上」「下」的時候，是指<b>最近的那個星期三</b>（包含今天）。「下週二」這種還沒到的日子也可以先記，會直接算進那個月。</p>

<div class="pgbrk"></div>
<h2>第 3 步：每次都一樣的錢，設一次就好</h2>
<p>有些錢<b>每個月都一樣</b>，像房租、電話費、薪水。這種不用每次打。</p>
<p>你只要打一句「<b>每</b>」開頭的話，設定<b>一次</b>，以後時間一到它就<b>自己幫你記</b>。
就像鬧鐘：設好之後，時間到了它自己會響。</p>

<table class="t">
<tr><th width="42%%">你打（跟平常一樣，在「記一筆」打）</th><th>它以後會</th></tr>
<tr><td class="l"><b class="mono">每月&nbsp;1&nbsp;號&nbsp;房租&nbsp;18500</b></td><td class="l">每個月的 1 號，自己記一筆「房租 18500」</td></tr>
<tr><td class="l"><b class="mono">每月底&nbsp;信用卡&nbsp;5000</b></td><td class="l">每個月的最後一天，自己記</td></tr>
<tr><td class="l"><b class="mono">每週一&nbsp;健身&nbsp;300</b></td><td class="l">每個星期一，自己記</td></tr>
<tr><td class="l"><b class="mono">每天&nbsp;咖啡&nbsp;65</b></td><td class="l">每天都記</td></tr>
<tr><td class="l"><b class="mono">每年&nbsp;3月15日&nbsp;保險&nbsp;12000</b></td><td class="l">每年的 3 月 15 日，自己記</td></tr>
<tr><td class="l"><b class="mono">每月&nbsp;5&nbsp;號&nbsp;薪水&nbsp;52000</b></td><td class="l">每個月的 5 號，自己記一筆「收到的錢」</td></tr>
</table>

<p>打完之後，句子前面會出現 <b>🔁</b> 這個記號（意思是「會一直重複」），
下面還會寫「下次：幾月幾號」。按最下面的綠色大按鈕，就設好了。</p>

<div class="grn"><p style="margin:0"><b class="gt">★ 很久沒開也沒關係</b><br/>
就算你一個月都沒打開 App，下次打開，它會把還沒記的<b>全部補上</b>，而且<b>不會多記</b>。<br/>
它自己記的那幾筆，前面都會有 🔁。</p></div>

<h3>設好了，想改、想先停一下、或不要了</h3>
<p>到「<b>設定</b>」頁，往下找到寫著「<b>週期規則</b>」的那一格（「週期規則」就是你剛剛設的「每…」）。
每一條旁邊有三個按鈕：</p>
<p class="ck"><span class="cb">□</span>　<b>改</b>：房租漲了、換日子，按「改」直接把數字改掉，再按「儲存」</p>
<p class="ck"><span class="cb">□</span>　<b>暫停</b>：先不要自己記（例如這幾個月不去健身）。想再開始，按「啟用」</p>
<p class="ck"><span class="cb">□</span>　<b>刪</b>：以後都不要了。<span class="sm">（之前已經記進去的那幾筆會留著，不會不見）</span></p>

<div class="pgbrk"></div>
<h2>第 4 步：看這個月花了多少</h2>
<p>點下面的「<b>本月</b>」：</p>
<p class="ck"><span class="cb">□</span>　最上面：收入、支出、剩多少</p>
<p class="ck"><span class="cb">□</span>　中間：每一類花多少，長條越長花越多，旁邊括號是<b>跟上個月比</b>多了或少了</p>
<p class="ck"><span class="cb">□</span>　下面：每一筆的清單，可以按「改」或「刪」</p>
<p class="ck"><span class="cb">□</span>　按「‹ 上月」「下月 ›」可以看別的月份</p>
<p class="sm">畫面最上面右邊會一直顯示「幾月已花 多少」，不管在哪一頁都看得到。</p>

<h2>第 5 步：問 AI「我這個月錢都花去哪了？」</h2>
<p class="flow">① 點「問 AI」 → ② 選一個問題 → ③ 按「分享」選你的 AI → ④ 看回答</p>
<p>這個 App 自己<b>沒有 AI</b>，也不會跟你收錢。它只是把你這個月的數字整理成一段文字，
然後幫你送到<b>你手機裡已經有的</b> ChatGPT、Gemini 或 Claude。</p>
<p class="ck"><span class="cb">□</span>　有四個現成的問題可以點：本月摘要、哪類花最多、找出奇怪的消費、下個月怎麼省</p>
<p class="ck"><span class="cb">□</span>　也可以自己打一個問題</p>
<p class="ck"><span class="cb">□</span>　手機上按「分享到我的 AI」會跳出分享選單，選 ChatGPT／Gemini／Claude 就好</p>
<p class="ck"><span class="cb">□</span>　電腦上沒有分享按鈕，按「複製」，再貼到 AI 的聊天視窗</p>
<div class="yel"><p style="margin:0"><b>送出去的只有「總數」</b>（例如「餐飲 8,420 元，比上月多 1,180」），
<b>不會</b>把你每一筆的細節送出去。</p></div>

<h2>第 6 步：備份（每個月做一次，很重要）</h2>
<div class="red"><p style="margin:0"><b class="rt">為什麼要備份？</b><br/>
因為資料只在這支手機裡。手機壞了、換新手機、不小心清掉瀏覽器資料，紀錄就全部沒了，
<b>誰都救不回來</b>。備份很簡單，30 秒就好。</p></div>

<h3>怎麼備份</h3>
<p>到「<b>設定</b>」頁：</p>
<p class="ck"><span class="cb">□</span>　按「<b>⬇️ 匯出 CSV</b>」→ 會存一個檔案到手機（檔名像 easy-ledger-2026-09-20.csv）</p>
<p class="ck"><span class="cb">□</span>　如果你有設第 3 步那種「每…」的，再按「<b>⬇️ 匯出規則 JSON</b>」，這是另一個檔案</p>
<p class="ck"><span class="cb">□</span>　把這兩個檔案傳到 LINE 給自己、或存到 Google 雲端、iCloud 都可以</p>

<h3>換新手機怎麼把資料搬回來</h3>
<p class="ck"><span class="cb">□</span>　在新手機打開 App（第 1 步）</p>
<p class="ck"><span class="cb">□</span>　到「設定」→ 按「<b>⬆️ 匯入 CSV</b>」→ 選你備份的那個 .csv 檔</p>
<p class="ck"><span class="cb">□</span>　有規則的話再按「<b>⬆️ 匯入規則 JSON</b>」→ 選 .json 檔</p>
<p class="sm">匯入時它會一筆一筆檢查，如果檔案有壞掉，會告訴你是第幾列，而且一筆都不會亂寫進去。</p>

<h2>常見問題</h2>
<table class="t">
<tr><th width="38%%">問題</th><th>答案</th></tr>
<tr><td class="l">它把分類猜錯了怎麼辦？</td><td class="l">存之前點分類那個字改掉；或存了之後到「本月」按「改」。改過一次它就會記住。</td></tr>
<tr><td class="l">我打「咖啡」它說沒找到金額</td><td class="l">一定要有數字。打「咖啡 65」。</td></tr>
<tr><td class="l">它自己記的房租，我只想刪掉這一次</td><td class="l">到「本月」找到那一筆，按「刪」。只會刪這一次，下個月還是會自己記。</td></tr>
<tr><td class="l">以後都不要它自己記房租了</td><td class="l">到「設定」→ 找到「週期規則」→ 按「暫停」或「刪」。</td></tr>
<tr><td class="l">字太小，看不清楚</td><td class="l">到「<b>設定</b>」最上面「字體大小」，把圓點往右拖，字就變大。它會記住。</td></tr>
<tr><td class="l">要付錢嗎？要註冊嗎？</td><td class="l"><b class="gt">都不用。</b>沒有帳號、沒有付費、沒有廣告。</td></tr>
<tr><td class="l">別人看得到我的帳嗎？</td><td class="l">看不到。資料沒有離開你的手機。</td></tr>
<tr><td class="l">可以給家人朋友用嗎？</td><td class="l">可以，把網址傳給他就好。他的資料在他的手機，跟你的不會混在一起。</td></tr>
<tr><td class="l">為什麼沒有網路也能開？</td><td class="l">因為放到桌面之後，整個 App 已經存在手機裡了。</td></tr>
</table>

<div class="grn"><p style="margin:0"><b class="gt">★ 記得就好的三件事</b><br/>
1. 花錢就打一句「東西&nbsp;多少錢」。<br/>
2. 每個月都一樣的錢，打「每月&nbsp;幾號&nbsp;東西&nbsp;多少錢」，設一次就好。<br/>
3. 每個月「設定 → 匯出 CSV」備份一次。</p></div>

<p class="foot">輕鬆記帳 easy-ledger v0.3　│　%(url)s　│　原始碼：github.com/EagleChu-hub/easy-ledger</p>
""" % {'url': URL}

CJK = r'⺀-鿿＀-￯　-〿'
tidy = lambda h: re.sub(r'(?<=[%s])\s+(?=[%s])' % (CJK, CJK), '', h)  # noqa: E731
N = lambda x: re.sub(r'\s+', '', unicodedata.normalize('NFKC', x))  # noqa: E731


H2_FILL = (0x17 / 255, 0x32 / 255, 0x4D / 255)


def strip_stray_bars(path, max_h=12.0):
    """清頁中的底色外洩：fitz.Story 會把前幾頁 h2 標題的底色在後面頁面同座標重播成
    一段段矮色塊（3–12pt 高、寬度不定），正好蓋住文字。真正的 h2 條至少 20pt 高且包住
    自己的字，所以「h2 顏色 + 高度 ≤ 12pt + 沒包住任何文字」就是外洩。回傳清掉的色塊數。"""
    doc = fitz.open(path)
    removed = 0
    try:
        for page in doc:
            spans = [fitz.Rect(s['bbox']) for b in page.get_text('dict')['blocks']
                     for ln in b.get('lines', []) for s in ln.get('spans', []) if s['text'].strip()]
            stray = []
            for g in page.get_drawings():
                r = fitz.Rect(g['rect'])
                f = g.get('fill')
                if f is None or r.height > max_h or r.height < 3:
                    continue
                if max(abs(a - b) for a, b in zip(f, H2_FILL)) > 0.02:
                    continue
                if any(r.contains(s) for s in spans):
                    continue
                stray.append(r)
            for r in stray:
                page.add_redact_annot(r + (-1, -1, 1, 1))
            if stray:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                                      graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                                      text=fitz.PDF_REDACT_TEXT_NONE)
                removed += len(stray)
        if removed:
            doc.saveIncr()
    finally:
        doc.close()
    return removed


def build(html, css, out, max_pages=12):
    n, brk = story_pdf.render_atomic(tidy(html), css, out, max_pages=max_pages)
    story_pdf.strip_trailing_fills(out)
    bleed = story_pdf.strip_bleed_fills(out)
    # redaction 只移除「完全被蓋住」的形狀，長條被部分蓋住時會切剩一段，所以要跑到清不出東西為止
    total = 0
    for _ in range(8):
        n_stray = strip_stray_bars(out)
        total += n_stray
        if n_stray == 0:
            break
    print('  清除頁中外洩色塊：%d' % total)
    before = os.path.getsize(out)
    d = fitz.open(out)
    d.subset_fonts()
    fd, tmp = tempfile.mkstemp(suffix='.pdf')
    os.close(fd)
    d.save(tmp, garbage=4, deflate=True, clean=True)
    d.close()
    last = None
    for _ in range(10):
        try:
            shutil.copyfile(tmp, out)
            last = None
            break
        except PermissionError as e:
            last = e
            time.sleep(2.0)
    try:
        os.remove(tmp)
    except OSError:
        pass
    if last is not None:
        raise RuntimeError('目標檔遭鎖定，請關閉已開啟該 PDF 的程式：%s' % last)
    print('%s（%d頁，%.2fMB→%.2fMB，自動避頁 %d 處，清除頁首外洩 %d 頁）'
          % (os.path.basename(out), n, before / 1e6, os.path.getsize(out) / 1e6, brk, bleed))
    return n


def verify(html, out, must=(), ban=(), png_dir=None):
    d = fitz.open(out)
    pages = [N(p.get_text()) for p in d]
    flat = ''.join(pages)

    def page_of(s):
        hit = [i for i, t in enumerate(pages) if s and s in t]
        return hit[0] if len(hit) == 1 else None

    split = []
    for i, m in enumerate(re.finditer(r'<table[^>]*>.*?</table>', html, re.S)):
        rows = [N(unescape(re.sub(r'<[^>]+>', '', r))) for r in re.split(r'<tr[^>]*>', m.group(0))[1:]]
        rows = [r for r in rows if len(r) >= 4]
        if len(rows) < 2:
            continue
        # 逐列找頁碼；同一表格的列落在兩頁以上就是跨頁
        hit = set()
        for r in rows:
            key = r[:16]
            for pno, t in enumerate(pages):
                if key in t:
                    hit.add(pno)
                    break
        if len(hit) > 1:
            split.append((i, sorted(p + 1 for p in hit)))

    bleed = []
    for pno in range(1, len(d)):
        p = d[pno]
        sp = [fitz.Rect(s['bbox']) for b_ in p.get_text('dict')['blocks']
              for ln in b_.get('lines', []) for s in ln.get('spans', []) if s['text'].strip()]
        if not sp:
            continue
        top = min(s.y0 for s in sp)
        stray = [fitz.Rect(g['rect']) for g in p.get_drawings()
                 if g.get('fill') and fitz.Rect(g['rect']).width >= p.rect.width * 0.5
                 and fitz.Rect(g['rect']).height <= 24
                 and fitz.Rect(g['rect']).y0 <= top + 6
                 and not any(fitz.Rect(g['rect']).contains(s) for s in sp)]
        if len(stray) >= 2:
            bleed.append(pno + 1)

    print('  1) 跨頁表格：', split or '無')
    print('  2) 頁首外洩：', bleed or '無')
    print('  3) 禁字　　：', [b for b in ban if N(b) in flat] or '無')
    print('  4) 必備語句：', [m for m in must if N(m) not in flat] or '無缺漏')
    png_dir = png_dir or os.path.dirname(os.path.abspath(out))
    for i in range(len(d)):
        png = os.path.join(png_dir, '_manual_p%d.png' % (i + 1))
        d[i].get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(png)
    print('  5) 目視　　：已存 %d 頁 PNG 到 %s' % (len(d), png_dir))
    d.close()


if __name__ == '__main__':
    build(HTML, CSS, OUT)
    png_dir = os.environ.get('MANUAL_PNG_DIR')
    verify(HTML, OUT,
           must=['加入主畫面', '存起來', '每月 1 號 房租 18500', '匯出 CSV', '匯入規則 JSON', URL],
           ban=['TODO', 'localhost', 'API key'],
           png_dir=png_dir)
