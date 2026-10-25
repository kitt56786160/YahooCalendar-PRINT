// Yahoo!カレンダー 拡張機能 - interceptor.js
// ページ内のXHR通信(/api/events)を監視し、予定の詳細データ(タイトル・コメント等)をキャッシュします。
(() => {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = typeof url === 'string' ? url : String(url);
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._url && this._url.includes('/api/events')) {
      this.addEventListener('load', () => {
        try {
          if (this.status === 200 && this.responseText) {
            window.__yahooCalendarEvents = JSON.parse(this.responseText);
            sessionStorage.setItem('__yahooCalendarEvents', this.responseText);
            document.documentElement.setAttribute('data-calendar-events', this.responseText);
          }
        } catch (e) {
          console.warn('カレンダーイベントのキャッシュ保存に失敗しました:', e);
        }
      });
    }
    return originalSend.apply(this, args);
  };
})();
