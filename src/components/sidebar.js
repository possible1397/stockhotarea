/**
 * Sidebar 元件
 * 包含導覽選單、日期選擇器、市場概要
 */

import { appState } from '../main.js';
import { getDates, triggerFetch } from '../utils/api.js';

const NAV_ITEMS = [
  { icon: '🏠', text: '總覽', hash: '#/', page: 'dashboard' },
  { icon: '💰', text: '資金流向', hash: '#/flow', page: 'flow' },
  { icon: '🏆', text: '題材排行', hash: '#/ranking', page: 'ranking' },
];

/**
 * 渲染 Sidebar
 */
export function renderSidebar() {
  const sidebar = document.getElementById('sidebar');

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <span class="sidebar-logo-icon">📊</span>
      <span class="sidebar-logo-text">台股熱區</span>
    </div>

    <nav class="sidebar-nav">
      <div class="sidebar-section-label">導覽</div>
      ${NAV_ITEMS.map(
        (item) => `
        <a href="${item.hash}" class="nav-item" data-page="${item.page}">
          <span class="nav-item-icon">${item.icon}</span>
          <span class="nav-item-text">${item.text}</span>
        </a>
      `
      ).join('')}
    </nav>

    <div class="sidebar-divider"></div>

    <div class="sidebar-date-section">
      <label>📅 資料日期</label>
      <input
        type="date"
        id="sidebar-date-input"
        class="date-input"
        value="${appState.currentDate || ''}"
      />
      <button class="fetch-btn" id="sidebar-fetch-btn">
        🔄 抓取資料
      </button>
    </div>

    <div class="sidebar-divider"></div>

    <div class="sidebar-market-summary">
      <div class="market-summary-label">📈 市場概況</div>
      <div class="market-summary-item">
        <span class="label">加權指數</span>
        <span class="value" id="sidebar-taiex" style="color: var(--text-primary);">—</span>
      </div>
      <div class="market-summary-item">
        <span class="label">成交量</span>
        <span class="value" id="sidebar-volume" style="color: var(--text-secondary);">—</span>
      </div>
      <div class="market-summary-item">
        <span class="label">漲跌</span>
        <span class="value" id="sidebar-change" style="color: var(--color-flat);">—</span>
      </div>
    </div>
  `;

  // 初始化 active 狀態
  const route = parseCurrentRoute();
  updateSidebarActive(route);

  // 日期選擇器事件
  const dateInput = document.getElementById('sidebar-date-input');
  dateInput?.addEventListener('change', (e) => {
    const newDate = e.target.value;
    if (newDate) {
      window.dispatchEvent(new CustomEvent('dateChange', { detail: { date: newDate } }));
    }
  });

  // 抓取資料按鈕
  const fetchBtn = document.getElementById('sidebar-fetch-btn');
  fetchBtn?.addEventListener('click', async () => {
    const date = dateInput?.value || appState.currentDate;
    if (!date) return;

    fetchBtn.disabled = true;
    fetchBtn.textContent = '⏳ 抓取中...';

    try {
      await triggerFetch(date);
      fetchBtn.textContent = '✅ 完成！';

      // 重新載入頁面資料
      setTimeout(() => {
        fetchBtn.textContent = '🔄 抓取資料';
        fetchBtn.disabled = false;
        window.dispatchEvent(new CustomEvent('dateChange', { detail: { date } }));
      }, 1500);
    } catch (err) {
      fetchBtn.textContent = '❌ 失敗';
      setTimeout(() => {
        fetchBtn.textContent = '🔄 抓取資料';
        fetchBtn.disabled = false;
      }, 2000);
    }
  });

  // 點擊 sidebar 外部關閉（行動版）
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !e.target.closest('#mobile-menu-toggle')
    ) {
      sidebar.classList.remove('open');
    }
  });
}

/**
 * 解析當前路由
 */
function parseCurrentRoute() {
  const hash = window.location.hash || '#/';
  if (hash.startsWith('#/flow')) return 'flow';
  if (hash.startsWith('#/ranking')) return 'ranking';
  if (hash.startsWith('#/detail')) return 'detail';
  return 'dashboard';
}

/**
 * 更新 Sidebar 的 active 狀態
 * @param {string} page - 當前頁面
 */
export function updateSidebarActive(page) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    const itemPage = item.dataset.page;
    if (itemPage === page) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * 更新市場概況數據
 * @param {object} data - { index, volume, change }
 */
export function updateMarketSummary(data) {
  if (!data) return;

  const taiexEl = document.getElementById('sidebar-taiex');
  const volumeEl = document.getElementById('sidebar-volume');
  const changeEl = document.getElementById('sidebar-change');

  if (taiexEl && data.index != null) {
    taiexEl.textContent = data.index.toLocaleString();
  }
  if (volumeEl && data.volume != null) {
    const vol = data.volume >= 1e8
      ? (data.volume / 1e8).toFixed(0) + '億'
      : (data.volume / 1e4).toFixed(0) + '萬';
    volumeEl.textContent = vol;
  }
  if (changeEl && data.change != null) {
    const sign = data.change > 0 ? '+' : '';
    changeEl.textContent = sign + data.change.toFixed(2);
    changeEl.style.color = data.change > 0 ? 'var(--color-up)' : data.change < 0 ? 'var(--color-down)' : 'var(--color-flat)';
  }
}
