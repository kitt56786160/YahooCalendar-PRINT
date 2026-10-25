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
  const monthTitle = headerTitle ? headerTitle.textContent.trim() : `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`;
  const daysByDate = {};
  document.querySelectorAll('[data-date].fc-daygrid-day').forEach(cell => {
    const date = cell.getAttribute('data-date');
    const dayLabel = cell.querySelector('.fc-daygrid-day-number');
    const rokuyo = cell.querySelector('.fc-daygrid-day-rokuyo, .fc-daygrid-day-rokuyo-inline');
    const events = [...cell.querySelectorAll('._event-title-pc_1q9lx_218, .fc-event-main p')].map(element => {
      const timeElement = element.querySelector('._event-time-inline_1q9lx_229');
      const time = timeElement ? timeElement.textContent.trim() : '';
      return { time, title: element.textContent.replace(time, '').trim(), comment: '' };
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
  return { monthTitle, weeks, printedAt: new Date().toLocaleDateString('ja-JP') };
}