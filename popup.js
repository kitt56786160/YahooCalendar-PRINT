document.getElementById('printBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.url.includes('calendar.yahoo.co.jp')) {
    alert('Yahoo!カレンダーのページで使用してください。');
    return;
  }
  try {
    const [{ result: calendarData }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: extractCalendarData
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
      return { time, title: element.textContent.replace(time, '').trim() };
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
  const dates = Object.keys(daysByDate).sort();
  const weeks = [];
  for (let index = 0; index < dates.length; index += 7) {
    weeks.push(dates.slice(index, index + 7).map(date => daysByDate[date]));
  }
  return { monthTitle, weeks, printedAt: new Date().toLocaleDateString('ja-JP') };
}