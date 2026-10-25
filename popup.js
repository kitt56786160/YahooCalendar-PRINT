document.getElementById('printBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.url.includes('calendar.yahoo.co.jp')) {
    alert('Yahoo!カレンダーのページで使用してください。');
    return;
  }
  try {
    const [{ result: calendarData }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: extractCalendarData
    });
    if (!calendarData?.weeks?.length) throw new Error('月カレンダーを取得できませんでした。月表示に切り替えてください。');
    const token = crypto.randomUUID();
    const storageKey = `calendarPrint_${token}`;
    await chrome.storage.local.set({ [storageKey]: calendarData });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`print.html?id=${token}`) });
    window.close();
  } catch (error) {
    alert(`印刷画面を開けませんでした。\n${error.message}`);
  }
});

function extractCalendarData() {
  const headerTitle = document.querySelector('._header-title_1q9lx_37, [data-cl-params*="yyyymm"]');
<<<<<<< HEAD
  const monthTitle = headerTitle ? headerTitle.textContent.trim() : `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`;
  const daysByDate = {};
  document.querySelectorAll('[data-date].fc-daygrid-day').forEach(cell => {
    const date = cell.getAttribute('data-date');
=======
  let monthTitle = '';
  if (headerTitle) {
    monthTitle = headerTitle.textContent.trim();
  } else {
    monthTitle = new Date().getFullYear() + '年' + (new Date().getMonth() + 1) + '月';
  }

  // ==============================
  // 2. カレンダーの日付セルと予定を収集
  // ==============================
  const dayCells = document.querySelectorAll('[data-date].fc-daygrid-day');

  const eventsByDate = {};

  // ★ 予定ごとにYahoo!カレンダーで設定された色を取得
  const isTransparent = c =>
    !c || c === 'transparent' ||
    /^rgba\([^,]+,[^,]+,[^,]+,\s*0(\.0+)?\)$/.test(c) || /\/\s*0(\.0+)?\)$/.test(c);

  function getEventColors(el) {
    const root = el.closest('.fc-event, .fc-daygrid-event-harness') || el;
    const fg = getComputedStyle(el).color;

    // タイトル要素から予定要素まで遡り、最初に見つかった背景色を採用
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (!isTransparent(bg)) return { bg, fg };
      if (node === root) break;
    }

    // 背景なし（ドット表示）の予定はドットの色を左線に使う
    const dot = root.querySelector('.fc-daygrid-event-dot');
    if (dot) {
      const accent = getComputedStyle(dot).borderColor;
      if (!isTransparent(accent)) return { accent };
    }
    return null;   // 取得できなければ従来のピンク
  }

  dayCells.forEach(cell => {
    const dateStr = cell.getAttribute('data-date');
>>>>>>> 9d6b0eca2d9600b7f355b86f29995c9468bc092b
    const dayLabel = cell.querySelector('.fc-daygrid-day-number');
    const rokuyo = cell.querySelector('.fc-daygrid-day-rokuyo, .fc-daygrid-day-rokuyo-inline');
<<<<<<< HEAD
    const events = [...cell.querySelectorAll('._event-title-pc_1q9lx_218, .fc-event-main p')].map(element => {
      const timeElement = element.querySelector('._event-time-inline_1q9lx_229');
      const time = timeElement ? timeElement.textContent.trim() : '';
      return { time, title: element.textContent.replace(time, '').trim(), comment: '' };
=======
    const rokuyoText = rokuyo ? rokuyo.textContent.trim() : '';

    // ★ fc-day-sun / fc-day-sat クラスで正確に判定
    const isSunday  = cell.classList.contains('fc-day-sun');
    const isSaturday = cell.classList.contains('fc-day-sat');
    const isOtherMonth = cell.classList.contains('fc-day-other');
    const isToday = cell.classList.contains('fc-day-today');

    const eventElements = cell.querySelectorAll('._event-title-pc_1q9lx_218, .fc-event-main p');
    const events = [];
    eventElements.forEach(el => {
      const timeEl = el.querySelector('._event-time-inline_1q9lx_229');
      const timeText = timeEl ? timeEl.textContent.trim() : '';
      let title = el.textContent.replace(timeText, '').trim();
      events.push({ time: timeText, title: title, colors: getEventColors(el) });
>>>>>>> 9d6b0eca2d9600b7f355b86f29995c9468bc092b
    });
    daysByDate[date] = {
      dayNum: dayLabel ? dayLabel.textContent.trim() : '',
      rokuyoText: rokuyo ? rokuyo.textContent.trim() : '',
      isSunday: cell.classList.contains('fc-day-sun'),
      isSaturday: cell.classList.contains('fc-day-sat'),
      isOtherMonth: cell.classList.contains('fc-day-other'),
      isToday: cell.classList.contains('fc-day-today'),
      events
    };
  });

  // キャッシュされた予定データ（summary, description等）を取得してマージ
  try {
    let rawList = window.__yahooCalendarEvents;
    if (!rawList) {
      const attr = document.documentElement.getAttribute('data-calendar-events');
      if (attr) rawList = JSON.parse(attr);
    }
    if (!rawList) {
      const stored = sessionStorage.getItem('__yahooCalendarEvents');
      if (stored) rawList = JSON.parse(stored);
    }

    if (rawList) {
      let list = Array.isArray(rawList) ? rawList : (rawList.events || rawList.items || Object.values(rawList).find(Array.isArray) || []);
      const apiEventsByDate = {};
      const normalizeStr = str => (str || '').replace(/[\s\u3000]+/g, '').trim();

      list.forEach(item => {
        const title = (item.summary || item.title || item.subject || '').trim();
        const comment = (item.description || item.comment || item.memo || '').trim();
        const startVal = String(item.startTime || item.startDate || item.start || '');

        let dateKey = '';
        const mIso = startVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const mCompact = startVal.match(/^(\d{4})(\d{2})(\d{2})/);
        if (mIso) dateKey = `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
        else if (mCompact) dateKey = `${mCompact[1]}-${mCompact[2]}-${mCompact[3]}`;

        if (dateKey) {
          const addEv = d => {
            if (!apiEventsByDate[d]) apiEventsByDate[d] = [];
            apiEventsByDate[d].push({ title, comment });
          };
          addEv(dateKey);

          // 複数日にまたがる予定のサポート
          const endVal = String(item.endTime || item.endDate || item.end || '');
          let endDateKey = '';
          const mEndIso = endVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
          const mEndCompact = endVal.match(/^(\d{4})(\d{2})(\d{2})/);
          if (mEndIso) endDateKey = `${mEndIso[1]}-${mEndIso[2]}-${mEndIso[3]}`;
          else if (mEndCompact) endDateKey = `${mEndCompact[1]}-${mEndCompact[2]}-${mEndCompact[3]}`;

          if (endDateKey && endDateKey > dateKey) {
            const cur = new Date(dateKey);
            const end = new Date(endDateKey);
            cur.setDate(cur.getDate() + 1);
            let count = 0;
            while (cur <= end && count < 35) {
              addEv(cur.toISOString().slice(0, 10));
              cur.setDate(cur.getDate() + 1);
              count++;
            }
          }
        }
      });

      // DOMセル内の予定と照合してタイトル全文およびコメントをマージ
      Object.keys(daysByDate).forEach(date => {
        const dayObj = daysByDate[date];
        const apiList = apiEventsByDate[date] || [];
        dayObj.events = dayObj.events.map(domEv => {
          const normDom = normalizeStr(domEv.title);
          const matched = apiList.find(apiEv => {
            const normApi = normalizeStr(apiEv.title);
            if (!normApi || !normDom) return false;
            return normApi === normDom || normApi.startsWith(normDom) || normDom.startsWith(normApi);
          });
          if (matched) {
            return {
              time: domEv.time,
              title: matched.title || domEv.title,
              comment: matched.comment || ''
            };
          }
          return domEv;
        });
      });
    }
  } catch (err) {
    console.warn('キャッシュデータの解析をスキップしました:', err);
  }

  const dates = Object.keys(daysByDate).sort();
  const weeks = [];
  for (let index = 0; index < dates.length; index += 7) {
    weeks.push(dates.slice(index, index + 7).map(date => daysByDate[date]));
  }
<<<<<<< HEAD
  return { monthTitle, weeks, printedAt: new Date().toLocaleDateString('ja-JP') };
}
=======

  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  // ==============================
  // 4. カレンダーHTML生成
  // ==============================
  const rowCount = weeks.length;   // 通常5〜6行

  let calHTML = `
    <table class="cal-table" style="--row-count: ${rowCount};">
      <thead>
        <tr>
          ${DOW_LABELS.map((d, i) => {
            let cls = i === 0 ? 'sun' : i === 6 ? 'sat' : 'weekday';
            return `<th class="${cls}">${d}</th>`;
          }).join('')}
        </tr>
      </thead>
      <tbody>
  `;

  weeks.forEach(week => {
    calHTML += '<tr>';
    week.forEach(dateStr => {
      const d = eventsByDate[dateStr];
      if (!d) { calHTML += '<td class="day-cell"></td>'; return; }

      // ★ isSunday / isSaturday のみで色クラスを付与（平日は何もなし）
      let tdClass = 'day-cell';
      if (d.isSunday)   tdClass += ' sun';
      else if (d.isSaturday) tdClass += ' sat';
      if (d.isOtherMonth) tdClass += ' other-month';
      if (d.isToday)    tdClass += ' today';

      let eventsHTML = '';
      if (d.events.length > 0) {
        eventsHTML = '<ul class="event-list">' +
          d.events.map(ev => {
            const timeStr = ev.time ? `<span class="ev-time">${ev.time}</span>` : '';
            const c = ev.colors;
            let liAttr = '';
            if (c && c.bg) {
              liAttr = ` class="custom-color" style="background:${c.bg};color:${c.fg};border-left-color:${c.bg};"`;
            } else if (c && c.accent) {
              liAttr = ` style="border-left-color:${c.accent};"`;
            }
            return `<li${liAttr}>${timeStr}${ev.title}</li>`;
          }).join('') +
          '</ul>';
      }

      const rokuyoHTML = d.rokuyoText ? `<span class="rokuyo">${d.rokuyoText}</span>` : '';

      calHTML += `
        <td class="${tdClass}">
          <div class="day-header">
            <span class="day-num">${d.dayNum}</span>${rokuyoHTML}
          </div>
          ${eventsHTML}
        </td>
      `;
    });
    calHTML += '</tr>';
  });

  calHTML += '</tbody></table>';

  // ==============================
  // 5. 印刷ページHTML
  // ==============================
  const printHTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${monthTitle} - Yahoo!カレンダー印刷</title>
<style>
  /* ★ A4縦向き */
  @page {
    size: A4 portrait;
    margin: 10mm 10mm 10mm 10mm;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Hiragino Kaku Gothic ProN", "Meiryo", "Yu Gothic", sans-serif;
    font-size: 9pt;
    background: #fff;
    color: #222;
    /* ★ 横幅に合わせてテーブルを収める。縦は自然な高さのまま */
    width: 190mm;   /* A4縦 - 左右マージン10mm×2 */
  }

  /* ★ 印刷ボタン（印刷時は非表示） */
  .print-bar {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 10px 0 14px;
  }
  .print-bar button {
    padding: 8px 28px;
    font-size: 13px;
    font-weight: bold;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-print  { background: #cc0028; color: #fff; }
  .btn-print:hover  { background: #a8001f; }
  .btn-close  { background: #eee; color: #333; }
  .btn-close:hover  { background: #ddd; }

  h1 {
    text-align: center;
    font-size: 15pt;
    font-weight: bold;
    margin-bottom: 6px;
    color: #cc0028;
    letter-spacing: 0.1em;
  }

  /* 曜日ヘッダー */
  .cal-table thead th {
    text-align: center;
    font-size: 9pt;
    font-weight: bold;
    padding: 4px 2px;
    border: 1px solid #999;
    color: #fff;
  }
  .cal-table thead th.sun     { background: #cc0028; }
  .cal-table thead th.sat     { background: #1a44cc; }
  /* ★ 平日ヘッダーは落ち着いたグレー */
  .cal-table thead th.weekday { background: #555; }

  /* 日付セル：全週で均等な高さに固定 */
  /*
   * A4縦 印刷可能高さ = 297mm - 上下マージン10mm×2 = 277mm
   * タイトル行(h1)  約 10mm
   * 曜日ヘッダー行  約  7mm
   * 残り計         277 - 10 - 7 = 260mm
   * カレンダーを全体の 2/3 に → 260mm × 2/3 ≒ 173mm
   * 週数(行数)は JS で計算して CSS変数 --row-count にセット
   * 各セル高さ = 173mm ÷ --row-count
   */
  .cal-table {
    --row-count: 6;   /* JSで上書き */
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .cal-table tbody td {
    border: 1px solid #ccc;
    vertical-align: top;
    padding: 3px 4px;
    /* ★ 全セルを均等高さに固定 */
    height: calc(173mm / var(--row-count));
    width: calc(100% / 7);
    overflow: hidden;   /* はみ出し予定は隠す */
  }

  /* ★ 平日は白背景（何もつけない） */
  .day-cell           { background: #fff; }
  .day-cell.sun       { background: #fff3f3; }   /* 日曜：薄い赤 */
  .day-cell.sat       { background: #f0f4ff; }   /* 土曜：薄い青 */
  .day-cell.other-month { background: #f5f5f5; opacity: 0.65; }

  /* 今日の日付：赤丸 */
  .day-cell.today .day-num {
    background: #cc0028;
    color: #fff;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .day-header {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-bottom: 2px;
    border-bottom: 1px solid #eee;
    padding-bottom: 2px;
  }

  .day-num {
    font-size: 10pt;
    font-weight: bold;
    min-width: 18px;
    text-align: center;
  }
  /* ★ 日曜は赤文字、土曜は青文字、平日は黒 */
  .day-cell.sun .day-num { color: #cc0028; }
  .day-cell.sat .day-num { color: #1a44cc; }

  .rokuyo {
    font-size: 6pt;
    color: #999;
  }

  .event-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .event-list li {
    font-size: 7pt;
    line-height: 1.3;
    padding: 1px 3px;
    margin-bottom: 1px;
    background: #fff0f0;
    border-left: 2px solid #ff8888;
    border-radius: 1px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: #333;
  }

  .ev-time {
    color: #cc0028;
    font-weight: bold;
    margin-right: 2px;
    font-size: 6.5pt;
  }
  /* ★ 予定の背景色を使う場合、時刻は予定の文字色に合わせる */
  .event-list li.custom-color .ev-time { color: inherit; }

  .print-footer {
    text-align: right;
    font-size: 7pt;
    color: #bbb;
    margin-top: 5px;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* ★ 印刷時はボタンバーを非表示 */
    .print-bar { display: none !important; }
  }
</style>
</head>
<body>
  <!-- ★ 印刷・閉じるボタン -->
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">🖨️ 印刷</button>
    <button class="btn-close" onclick="window.close()">✕ 閉じる</button>
  </div>

  <h1>📅 ${monthTitle}</h1>
  ${calHTML}
  <div class="print-footer">Yahoo!カレンダー | 印刷日: ${new Date().toLocaleDateString('ja-JP')}</div>
</body>
</html>`;

  // ★ 自動printは削除。ユーザーがボタンで印刷
  const printWin = window.open('', '_blank', 'width=850,height=900');
  if (printWin) {
    printWin.document.write(printHTML);
    printWin.document.close();
  } else {
    alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
  }
}
>>>>>>> 9d6b0eca2d9600b7f355b86f29995c9468bc092b
