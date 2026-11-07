/**
 * 格式化工具模組
 * 提供各種數值、日期、顏色格式化功能
 */

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 格式化金額 - 以億/萬為單位顯示
 * @param {number} value - 金額（單位：元）
 * @returns {string}
 */
export function formatMoney(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e8) {
    return sign + (abs / 1e8).toFixed(2) + '億';
  } else if (abs >= 1e4) {
    return sign + (abs / 1e4).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '萬';
  } else if (abs >= 1000) {
    return sign + abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return sign + abs.toFixed(0);
}

/**
 * 格式化金額（已經是萬元單位）
 * @param {number} value - 金額（單位：萬元）
 * @returns {string}
 */
export function formatMoneyWan(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 10000) {
    return sign + (abs / 10000).toFixed(2) + '億';
  }
  return sign + abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '萬';
}

/**
 * 格式化百分比 - 帶正負號
 * @param {number} value - 百分比值
 * @returns {string}
 */
export function formatPercent(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(2) + '%';
}

/**
 * 格式化成交量 - 以萬股/張顯示
 * @param {number} value - 成交量（張）
 * @returns {string}
 */
export function formatVolume(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 10000) {
    return (abs / 10000).toFixed(1) + '萬張';
  }
  return abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '張';
}

/**
 * 格式化日期 - YYYY-MM-DD → MM/DD(星期)
 * @param {string} dateStr - YYYY-MM-DD 格式
 * @param {boolean} showDay - 是否顯示星期
 * @returns {string}
 */
export function formatDate(dateStr, showDay = true) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    const month = parts[1];
    const day = parts[2];
    if (showDay) {
      const d = new Date(dateStr);
      const dayName = DAY_NAMES[d.getDay()];
      return `${month}/${day}(${dayName})`;
    }
    return `${month}/${day}`;
  } catch {
    return dateStr;
  }
}

/**
 * 格式化日期簡短版 - MM/DD
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
export function formatDateShort(dateStr) {
  return formatDate(dateStr, false);
}

/**
 * 根據漲跌值取得對應顏色
 * @param {number} value - 漲跌值
 * @returns {string} CSS color
 */
export function getChangeColor(value) {
  if (value == null || isNaN(value) || value === 0) return '#94a3b8';
  return value > 0 ? '#ef4444' : '#22c55e';
}

/**
 * 根據漲跌值取得 CSS class
 * @param {number} value
 * @returns {string}
 */
export function getChangeClass(value) {
  if (value == null || isNaN(value) || value === 0) return 'text-flat';
  return value > 0 ? 'text-up' : 'text-down';
}

/**
 * 根據漲跌取得 badge class
 * @param {number} value
 * @returns {string}
 */
export function getBadgeClass(value) {
  if (value == null || isNaN(value) || value === 0) return 'badge-flat';
  return value > 0 ? 'badge-up' : 'badge-down';
}

/**
 * 漸層顏色插值（用於熱力圖）
 * @param {number} value - 當前值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {string} CSS color
 */
export function getGradientColor(value, min, max) {
  if (value == null || isNaN(value)) return '#94a3b8';
  if (min === max) return '#94a3b8';

  // Normalize to -1 to 1
  let normalized;
  if (value >= 0) {
    normalized = max > 0 ? Math.min(value / max, 1) : 0;
  } else {
    normalized = min < 0 ? Math.max(value / Math.abs(min), -1) : 0;
  }

  if (normalized > 0) {
    // Red gradient for positive (up)
    const intensity = Math.min(normalized, 1);
    const r = Math.round(40 + intensity * 199);
    const g = Math.round(20 + intensity * 48);
    const b = Math.round(30 + intensity * 38);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (normalized < 0) {
    // Green gradient for negative (down)
    const intensity = Math.min(Math.abs(normalized), 1);
    const r = Math.round(20 + intensity * 14);
    const g = Math.round(40 + intensity * 157);
    const b = Math.round(30 + intensity * 64);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return 'rgb(30, 35, 50)';
}

/**
 * 數字動畫 - 從 0 計數到目標值
 * @param {HTMLElement} element - 目標 DOM 元素
 * @param {number} endValue - 最終數值
 * @param {number} duration - 動畫時長（ms）
 * @param {Function} formatter - 格式化函數
 */
export function animateNumber(element, endValue, duration = 1000, formatter = null) {
  if (!element) return;
  if (endValue == null || isNaN(endValue)) {
    element.textContent = '—';
    return;
  }

  const startValue = 0;
  const startTime = performance.now();
  const format = formatter || ((v) => v.toFixed(0));

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = startValue + (endValue - startValue) * eased;

    element.textContent = format(currentValue);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/**
 * 格式化數字加千分位
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (value == null || isNaN(value)) return '—';
  return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化帶符號的數字
 * @param {number} value
 * @returns {string}
 */
export function formatSignedNumber(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + formatNumber(value);
}

/**
 * 產生骨架載入 HTML
 * @param {number} rows - 行數
 * @returns {string}
 */
export function skeletonRows(rows = 5) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    const w = 40 + Math.random() * 50;
    html += `<div class="skeleton skeleton-text" style="width: ${w}%; animation-delay: ${i * 100}ms"></div>`;
  }
  return html;
}

/**
 * 產生骨架卡片 HTML
 * @param {number} count - 卡片數量
 * @returns {string}
 */
export function skeletonCards(count = 4) {
  let html = '<div class="grid-stats">';
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton skeleton-card" style="animation-delay: ${i * 80}ms"></div>`;
  }
  html += '</div>';
  return html;
}
