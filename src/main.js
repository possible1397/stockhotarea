/**
 * 應用程式進入點
 * Hash-based 路由與全域狀態管理
 */

import { renderSidebar, updateSidebarActive } from './components/sidebar.js';
import { renderHeatmap } from './components/heatmap.js';
import { renderFlowChart } from './components/flowChart.js';
import { renderRanking } from './components/ranking.js';
import { renderDetail } from './components/detail.js';
import { getDates, getOverview } from './utils/api.js';
import { formatDate } from './utils/formatters.js';

/** 全域應用程式狀態 */
export const appState = {
  currentDate: null,
  availableDates: [],
  overview: null,
  currentRoute: null,
  echartsInstances: [],
};

/** 記錄並銷毀 ECharts 實例 */
export function registerChart(instance) {
  if (instance) {
    appState.echartsInstances.push(instance);
  }
}

function disposeAllCharts() {
  appState.echartsInstances.forEach((chart) => {
    try {
      if (chart && !chart.isDisposed()) {
        chart.dispose();
      }
    } catch (e) {
      // ignore
    }
  });
  appState.echartsInstances = [];
}

/** 解析 hash 路由 */
function parseRoute() {
  const hash = window.location.hash || '#/';
  const parts = hash.slice(1).split('/').filter(Boolean);

  if (parts.length === 0) return { page: 'dashboard', params: {} };
  if (parts[0] === 'flow') return { page: 'flow', params: {} };
  if (parts[0] === 'ranking') return { page: 'ranking', params: {} };
  if (parts[0] === 'detail' && parts[1]) return { page: 'detail', params: { themeId: decodeURIComponent(parts[1]) } };
  return { page: 'dashboard', params: {} };
}

/** 頁面標題對應 */
const PAGE_TITLES = {
  dashboard: { title: '總覽儀表板', breadcrumb: '首頁' },
  flow: { title: '資金流向分析', breadcrumb: '首頁 / 資金流向' },
  ranking: { title: '題材排行榜', breadcrumb: '首頁 / 排行榜' },
  detail: { title: '題材詳情', breadcrumb: '首頁 / 題材詳情' },
};

/** 渲染頂部導航列 */
function renderTopBar(route) {
  const topBar = document.getElementById('top-bar');
  const meta = PAGE_TITLES[route.page] || PAGE_TITLES.dashboard;
  const dateDisplay = appState.currentDate ? formatDate(appState.currentDate) : '—';

  topBar.innerHTML = `
    <div class="topbar-left">
      <button class="mobile-menu-btn" id="mobile-menu-toggle">☰</button>
      <div>
        <div class="topbar-title">${meta.title}</div>
        <div class="topbar-breadcrumb">${meta.breadcrumb}</div>
      </div>
    </div>
    <div class="topbar-right">
      <div class="topbar-stat">
        <span class="stat-label">📅 資料日期</span>
        <span class="stat-value">${dateDisplay}</span>
      </div>
    </div>
  `;

  // 行動版選單按鈕
  const menuBtn = document.getElementById('mobile-menu-toggle');
  menuBtn?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
  });
}

/** 路由處理 */
async function handleRoute() {
  const route = parseRoute();
  appState.currentRoute = route;

  // 銷毀舊的 ECharts 實例
  disposeAllCharts();

  const container = document.getElementById('page-content');
  container.innerHTML = '';

  // 更新 sidebar 狀態
  updateSidebarActive(route.page);

  // 更新頂部列
  renderTopBar(route);

  // 關閉行動版 sidebar
  document.getElementById('sidebar')?.classList.remove('open');

  // 渲染對應頁面
  switch (route.page) {
    case 'dashboard':
      await renderHeatmap(container);
      break;
    case 'flow':
      await renderFlowChart(container);
      break;
    case 'ranking':
      await renderRanking(container);
      break;
    case 'detail':
      await renderDetail(container, route.params.themeId);
      break;
    default:
      await renderHeatmap(container);
  }
}

/** 初始化應用程式 */
async function init() {
  // 渲染 sidebar
  renderSidebar();

  // 取得可用日期
  try {
    const resp = await getDates();
    const dates = resp?.dates || [];
    if (Array.isArray(dates) && dates.length > 0) {
      appState.availableDates = dates;
      appState.currentDate = resp.latest || dates[dates.length - 1]; // 最新日期
    } else {
      // 如果沒有日期資料，使用今天
      appState.currentDate = new Date().toISOString().slice(0, 10);
    }
  } catch (e) {
    console.warn('無法取得日期列表，使用預設日期', e);
    appState.currentDate = new Date().toISOString().slice(0, 10);
  }

  // 更新 sidebar 日期選擇器
  const dateInput = document.getElementById('sidebar-date-input');
  if (dateInput) {
    dateInput.value = appState.currentDate;
  }

  // 監聽日期變更事件
  window.addEventListener('dateChange', (e) => {
    if (e.detail && e.detail.date) {
      appState.currentDate = e.detail.date;
      // 重新載入當前頁面
      handleRoute();
    }
  });

  // 監聽 hash 變化
  window.addEventListener('hashchange', handleRoute);

  // 監聯視窗大小變化，重新調整 ECharts
  window.addEventListener('resize', () => {
    appState.echartsInstances.forEach((chart) => {
      try {
        if (chart && !chart.isDisposed()) {
          chart.resize();
        }
      } catch (e) {
        // ignore
      }
    });
  });

  // 初次路由
  await handleRoute();
}

// 啟動
init().catch(console.error);
