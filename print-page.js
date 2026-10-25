const sheet = document.getElementById('print-sheet');
const editor = document.getElementById('memo-editor');
const memoArea = document.getElementById('memo-area');
const sizeSelect = document.getElementById('memo-font-size');
const lineHeightSelect = document.getElementById('memo-line-height');
const rowHeightSlider = document.getElementById('calendar-row-height');
const rowHeightValue = document.getElementById('calendar-row-height-value');
let savedRange = null;
let beforeInputHTML = '';
let composing = false;
let acceptedRowHeight = Number(rowHeightSlider.value);

initialize();

async function initialize() {
  try {
    const token = new URLSearchParams(location.search).get('id');
    if (!token || !/^[0-9a-f-]+$/i.test(token)) throw new Error('印刷データの識別番号が不正です。');
    const storageKey = `calendarPrint_${token}`;
    const stored = await chrome.storage.local.get(storageKey);
    const data = stored[storageKey];
    await chrome.storage.local.remove(storageKey);
    if (!data?.weeks?.length) throw new Error('印刷データが見つかりません。カレンダーからもう一度開いてください。');
    renderCalendar(data);
    sheet.hidden = false;
    bindEditor();
    requestAnimationFrame(sizeMemoArea);
  } catch (error) {
    document.querySelector('.edit-bar').hidden = true;
    const message = document.getElementById('error-message');
    message.textContent = error.message;
    message.hidden = false;
  }
}

function renderCalendar(data) {
  document.title = `${data.monthTitle} - Yahoo!カレンダー印刷`;
  document.getElementById('month-title').textContent = `📅 ${data.monthTitle}`;
  document.getElementById('print-footer').textContent = `Yahoo!カレンダー | 印刷日: ${data.printedAt}`;
  const table = document.createElement('table');
  table.className = 'cal-table';
  const head = table.createTHead().insertRow();
  ['日', '月', '火', '水', '木', '金', '土'].forEach((label, index) => {
    const cell = document.createElement('th');
    cell.className = index === 0 ? 'sun' : index === 6 ? 'sat' : 'weekday';
    cell.textContent = label;
    head.appendChild(cell);
  });
  const body = table.createTBody();
  data.weeks.forEach(week => {
    const row = body.insertRow();
    week.forEach(day => row.appendChild(createDayCell(day)));
  });
  document.getElementById('calendar-root').appendChild(table);
}

function createDayCell(day) {
  const cell = document.createElement('td');
  cell.className = ['day-cell', day.isSunday ? 'sun' : '', day.isSaturday ? 'sat' : '', day.isOtherMonth ? 'other-month' : '', day.isToday ? 'today' : ''].filter(Boolean).join(' ');
  const header = document.createElement('div');
  header.className = 'day-header';
  const number = document.createElement('span');
  number.className = 'day-num';
  number.textContent = day.dayNum;
  header.appendChild(number);
  if (day.rokuyoText) {
    const rokuyo = document.createElement('span');
    rokuyo.className = 'rokuyo';
    rokuyo.textContent = day.rokuyoText;
    header.appendChild(rokuyo);
  }
  cell.appendChild(header);
  if (day.events.length) {
    const list = document.createElement('ul');
    list.className = 'event-list';
    day.events.forEach(event => {
      const item = document.createElement('li');
      item.className = 'event-item';
      if (event.time) {
        const time = document.createElement('span');
        time.className = 'ev-time';
        time.textContent = event.time;
        item.appendChild(time);
      }
      const titleSpan = document.createElement('span');
      titleSpan.className = 'ev-title';
      titleSpan.textContent = event.title;
      item.appendChild(titleSpan);

      if (event.comment) {
        item.classList.add('has-comment');
        item.setAttribute('title', 'クリックでコメント全文を表示/非表示');

        const badge = document.createElement('span');
        badge.className = 'comment-badge';
        badge.textContent = ' 💬';
        item.appendChild(badge);

        const commentDiv = document.createElement('div');
        commentDiv.className = 'ev-comment';
        commentDiv.textContent = event.comment;
        item.appendChild(commentDiv);

        item.addEventListener('click', () => {
          item.classList.toggle('show-comment');
          sizeMemoArea(false);
        });
      }
      list.appendChild(item);
    });
    cell.appendChild(list);
  }
  return cell;
}

function sizeMemoArea(focusEditor = true) {
  memoArea.style.height = '0px';
  const gap = parseFloat(getComputedStyle(sheet).rowGap) || 0;
  const used = document.getElementById('month-title').getBoundingClientRect().height
    + document.getElementById('calendar-root').getBoundingClientRect().height
    + document.getElementById('print-footer').getBoundingClientRect().height
    + gap * 3;
  memoArea.style.height = Math.max(0, sheet.getBoundingClientRect().height - used) + 'px';
  if (focusEditor) editor.focus();
}

function bindEditor() {
  document.getElementById('print-page').addEventListener('click', () => window.print());
  document.getElementById('close-page').addEventListener('click', () => window.close());
  document.addEventListener('selectionchange', rememberSelection);
  editor.addEventListener('mouseup', rememberSelection);
  editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('compositionstart', () => { composing = true; beforeInputHTML = editor.innerHTML; });
  editor.addEventListener('compositionend', () => { composing = false; keepWithinPaper(beforeInputHTML); rememberSelection(); });
  editor.addEventListener('beforeinput', () => { if (!composing) beforeInputHTML = editor.innerHTML; });
  editor.addEventListener('input', event => {
    if (composing) return;
    const fits = keepWithinPaper(beforeInputHTML);
    if (!fits && event.inputType === 'insertFromPaste') showPasteOverflowWarning();
    rememberSelection();
  });
  document.querySelectorAll('[data-style]').forEach(button => {
    button.addEventListener('mousedown', event => {
      event.preventDefault();
      if (button.dataset.style === 'bold') {
        toggleBoldLikeWord(button);
        return;
      }
      const isActive = selectionHasStyle(button.dataset.style);
      const style = button.dataset.style === 'italic' ? { fontStyle: isActive ? 'normal' : 'italic' }
        : { textDecoration: isActive ? 'none' : 'underline' };
      applySelectedStyle(style);
      button.classList.toggle('active', !isActive);
    });
  });
  sizeSelect.addEventListener('mousedown', rememberSelection);
  sizeSelect.addEventListener('change', () => applySelectedStyle({ fontSize: sizeSelect.value }));
  lineHeightSelect.addEventListener('change', changeLineHeight);
  rowHeightSlider.addEventListener('input', previewCalendarRowHeight);
  rowHeightSlider.addEventListener('change', confirmCalendarRowHeight);

  const btnExpandComments = document.getElementById('btn-expand-comments');
  if (btnExpandComments) {
    btnExpandComments.addEventListener('click', () => {
      document.querySelectorAll('.event-item.has-comment').forEach(item => {
        item.classList.add('show-comment');
      });
      sizeMemoArea(false);
    });
  }
  const btnCollapseComments = document.getElementById('btn-collapse-comments');
  if (btnCollapseComments) {
    btnCollapseComments.addEventListener('click', () => {
      document.querySelectorAll('.event-item.has-comment').forEach(item => {
        item.classList.remove('show-comment');
      });
      sizeMemoArea(false);
    });
  }
  bindContextMenu();
}

function applyCalendarRowHeight(height) {
  const table = document.querySelector('.cal-table');
  table.style.setProperty('--calendar-row-height', `${height}mm`);
  rowHeightValue.value = `${height} mm`;
  sizeMemoArea(false);
}

function previewCalendarRowHeight() {
  applyCalendarRowHeight(Number(rowHeightSlider.value));
}

function confirmCalendarRowHeight() {
  const requestedHeight = Number(rowHeightSlider.value);
  if (contentFitsPaper()) {
    acceptedRowHeight = requestedHeight;
    return;
  }
  rowHeightSlider.value = String(acceptedRowHeight);
  applyCalendarRowHeight(acceptedRowHeight);
  alert('この枠高さではメモがA4用紙の印刷可能範囲を超えます。\nメモの文章量・文字サイズ・行間を調整してから変更してください。');
  editor.focus();
}

function changeLineHeight() {
  const previousLineHeight = editor.style.lineHeight || '1.6';
  editor.style.lineHeight = lineHeightSelect.value;
  if (contentFitsPaper()) return;
  editor.style.lineHeight = previousLineHeight;
  lineHeightSelect.value = previousLineHeight;
  alert('この行間ではメモがA4用紙の印刷可能範囲を超えます。\n文章量を減らすか、文字サイズを小さくしてから調整してください。');
  editor.focus();
}

function bindContextMenu() {
  const menu = document.getElementById('memo-context-menu');
  const copyButton = document.getElementById('context-copy');
  const pasteButton = document.getElementById('context-paste');
  editor.addEventListener('contextmenu', event => {
    event.preventDefault();
    rememberSelection();
    const selection = window.getSelection();
    copyButton.disabled = !selection.rangeCount || selection.isCollapsed;
    menu.hidden = false;
    const left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 4);
    const top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 4);
    menu.style.left = `${Math.max(4, left)}px`;
    menu.style.top = `${Math.max(4, top)}px`;
  });
  menu.addEventListener('mousedown', event => event.preventDefault());
  copyButton.addEventListener('click', copySelectedText);
  pasteButton.addEventListener('click', pasteClipboardText);
  document.addEventListener('mousedown', event => {
    if (!menu.contains(event.target)) menu.hidden = true;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') menu.hidden = true;
  });
}

async function requestClipboardPermission(permission) {
  const granted = await chrome.permissions.contains({ permissions: [permission] });
  if (granted) return true;
  return chrome.permissions.request({ permissions: [permission] });
}

async function copySelectedText() {
  const menu = document.getElementById('memo-context-menu');
  try {
    window.focus();
    editor.focus();
    if (!restoreSelection()) return;
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const selectedText = selection.toString();
    if (!document.execCommand('copy', false, null)) {
      const granted = await requestClipboardPermission('clipboardWrite');
      if (!granted) return;
      window.focus();
      editor.focus();
      restoreSelection();
      await navigator.clipboard.writeText(selectedText);
    }
  } catch (error) {
    alert(`コピーできませんでした。${error.message}`);
  } finally {
    menu.hidden = true;
    editor.focus();
  }
}

async function pasteClipboardText() {
  const menu = document.getElementById('memo-context-menu');
  try {
    const granted = await requestClipboardPermission('clipboardRead');
    if (!granted) return;
    window.focus();
    editor.focus();
    if (!restoreSelection()) {
      const initialRange = document.createRange();
      initialRange.selectNodeContents(editor);
      initialRange.collapse(false);
      savedRange = initialRange.cloneRange();
      restoreSelection();
    }
    const previousHTML = editor.innerHTML;
    const text = await readClipboardText();
    window.focus();
    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let lastNode = null;
    lines.forEach((line, index) => {
      if (index) {
        lastNode = document.createElement('br');
        fragment.appendChild(lastNode);
      }
      if (line) {
        lastNode = document.createTextNode(line);
        fragment.appendChild(lastNode);
      }
    });
    if (!lastNode) return;
    range.insertNode(fragment);
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!keepWithinPaper(previousHTML)) showPasteOverflowWarning();
    rememberSelection();
  } catch (error) {
    alert(`貼り付けできませんでした。${error.message}`);
  } finally {
    menu.hidden = true;
    editor.focus();
  }
}

function showPasteOverflowWarning() {
  alert('貼り付ける内容がA4用紙のメモ欄を超えるため、貼り付けを取り消しました。\n行間を狭くするか、文字サイズ・文章量を調整してから貼り付けてください。');
}

async function readClipboardText() {
  await waitForPageFocus();
  const receiver = document.createElement('textarea');
  receiver.setAttribute('aria-hidden', 'true');
  Object.assign(receiver.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0.01', zIndex: '-1' });
  document.body.appendChild(receiver);
  receiver.focus({ preventScroll: true });
  const pasted = document.execCommand('paste', false, null);
  const pastedText = receiver.value;
  receiver.remove();
  if (pasted && pastedText) return pastedText;

  try {
    const text = await navigator.clipboard.readText();
    if (text) return text;
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const plainText = await (await item.getType('text/plain')).text();
          if (plainText) return plainText;
        }
      }
    }
  } catch (error) {
    throw new Error(`外部クリップボードを読み取れませんでした。${error.message}`);
  }
  throw new Error('クリップボードから文字列を取得できませんでした。文字列をコピーし直してください。');
}
function waitForPageFocus() {
  return new Promise(resolve => {
    if (document.hasFocus()) {
      requestAnimationFrame(() => resolve());
      return;
    }
    const timeout = setTimeout(resolve, 1000);
    window.addEventListener('focus', () => {
      clearTimeout(timeout);
      requestAnimationFrame(() => resolve());
    }, { once: true });
  });
}
function rememberSelection() {
  const selection = window.getSelection();
  if (selection.rangeCount && editor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
}

function restoreSelection() {
  if (!savedRange) return false;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
  return true;
}

function selectionHasStyle(styleName) {
  if (!restoreSelection()) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue && range.intersectsNode(node)) textNodes.push(node);
  }
  if (!textNodes.length) return false;
  return textNodes.every(node => {
    const style = getComputedStyle(node.parentElement);
    if (styleName === 'bold') return Number.parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold';
    if (styleName === 'italic') return style.fontStyle === 'italic';
    return style.textDecorationLine.includes('underline');
  });
}

function toggleBoldLikeWord(button) {
  if (!restoreSelection()) editor.focus();
  const previousHTML = editor.innerHTML;
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('bold', false, null);
  if (!keepWithinPaper(previousHTML)) return;
  rememberSelection();
  button.classList.toggle('active', document.queryCommandState('bold'));
}
function applySelectedStyle(styles) {
  if (!restoreSelection()) return;
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const previousHTML = editor.innerHTML;
  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  Object.assign(span.style, styles);
  span.appendChild(range.extractContents());
  range.insertNode(span);
  range.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(range);
  if (keepWithinPaper(previousHTML)) savedRange = range.cloneRange();
}

function contentFitsPaper() {
  const probe = editor.cloneNode(true);
  probe.removeAttribute('contenteditable');
  probe.removeAttribute('data-placeholder');
  Object.assign(probe.style, {
    position: 'fixed', left: '-10000px', top: '0', width: `${editor.clientWidth}px`,
    height: 'auto', minHeight: '0', overflow: 'visible', visibility: 'hidden'
  });
  if (!probe.innerHTML) probe.innerHTML = '<br>';
  document.body.appendChild(probe);
  const fits = probe.scrollHeight <= editor.clientHeight + 1;
  probe.remove();
  return fits;
}

function keepWithinPaper(previousHTML) {
  if (contentFitsPaper()) return true;
  editor.innerHTML = previousHTML;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  savedRange = range.cloneRange();
  return false;
}
