/**
 * 題材排行榜元件
 * 按不同維度排序顯示所有題材
 */

import { appState, registerChart } from '../main.js';
import { getRanking, getDaily } from '../utils/api.js';
import {
  formatMoney,
  formatPercent,
  getChangeColor,
  getChangeClass,
  skeletonCards,
  formatNumber,
  animateNumber,
} from '../utils/formatters.js';

const TABS = [
  { key: 'change', label: '漲跌幅', icon: '📊' },
  { key: 'volume', label: '成交金額', icon: '💰' },
  { key: 'foreign', label: '外資買超', icon: '🏦' },
  { key: 'trust', label: '投信買超', icon: '🏛️' },
  { key: 'total_inst', label: '三大法人', icon: '🤝' },
];

let currentTab = 'change';

/**
 * 渲染排行榜頁面
 * @param {HTMLElement} container
 */
export async function renderRanking(container) {
  container.innerHTML = `
    <div class="page-header anim-fade-in">
      <h1>🏆 題材排行榜</h1>
      <p>依各維度排序的題材排行</p>
    </div>
    ${skeletonCards(5)}
    <div class="card card-no-hover" style="margin-top: var(--space-2xl);">
      <div class="skeleton skeleton-chart"></div>
    </div>
  `;

  try {
    const date = appState.currentDate;
    let data = null;

    try {
      data = await getDaily(date);
    } catch (e) {
      try {
        data = await getRanking(date);
      } catch (e2) {
        // both failed
      }
    }

    const themes = extractThemeList(data);
    renderRankingContent(container, themes);
  } catch (error) {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">⚠️</div>
        <div class="error-state-text">載入排行榜失敗</div>
        <div class="error-state-sub">${error.message}</div>
        <button class="btn btn-primary" onclick="location.reload()">重新整理</button>
      </div>
    `;
  }
}

/**
 * 從 API 回傳中提取題材列表
 */
function extractThemeList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.themes && Array.isArray(data.themes)) return data.themes;
  if (data.data && Array.isArray(data.data)) return data.data;
  if (data.ranking && Array.isArray(data.ranking)) return data.ranking;
  return [];
}

/**
 * 渲染排行榜內容
 */
function renderRankingContent(container, themes) {
  if (!themes || themes.length === 0) {
    container.innerHTML = `
      <div class="page-header anim-fade-in">
        <h1>🏆 題材排行榜</h1>
        <p>依各維度排序的題材排行</p>
      </div>
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">暫無資料</div>
        <div class="empty-state-sub">請先選擇日期並抓取資料</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-header anim-fade-in">
      <h1>🏆 題材排行榜</h1>
      <p>依各維度排序的題材排行 · 共 ${themes.length} 個題材</p>
    </div>

    <!-- Tab 選擇器 -->
    <div class="tab-selector" id="ranking-tabs">
      ${TABS.map(
        (tab) => `
        <div class="tab-item ${tab.key === currentTab ? 'active' : ''}" data-tab="${tab.key}">
          ${tab.icon} ${tab.label}
        </div>
      `
      ).join('')}
    </div>

    <!-- 排行榜列表 -->
    <div class="card card-no-hover anim-scale-in" style="padding: var(--space-lg);">
      <div id="ranking-list-container" class="ranking-list"></div>
    </div>
  `;

  // Tab 切換事件
  const tabContainer = document.getElementById('ranking-tabs');
  tabContainer?.addEventListener('click', (e) => {
    const tabItem = e.target.closest('.tab-item');
    if (!tabItem) return;

    const tabKey = tabItem.dataset.tab;
    if (tabKey === currentTab) return;

    currentTab = tabKey;

    // 更新 active 狀態
    tabContainer.querySelectorAll('.tab-item').forEach((t) => t.classList.remove('active'));
    tabItem.classList.add('active');

    // 重新排序並渲染列表
    renderRankingList(themes);
  });

  // 初始渲染列表
  renderRankingList(themes);
}

/**
 * 渲染排行列表
 */
function renderRankingList(themes) {
  const listContainer = document.getElementById('ranking-list-container');
  if (!listContainer) return;

  // 排序
  const sorted = sortThemes(themes, currentTab);

  // 找出最大值做比例尺
  const values = sorted.map((t) => Math.abs(getValueByTab(t, currentTab)));
  const maxVal = Math.max(...values, 1);

  let html = '';
  sorted.forEach((theme, index) => {
    const rank = index + 1;
    const name = theme.name || theme.theme_name || '未知';
    const icon = theme.icon || '';
    const themeId = theme.id || theme.theme_id || name;
    const value = getValueByTab(theme, currentTab);
    const barWidth = Math.max((Math.abs(value) / maxVal) * 100, 2);
    const isPositive = value >= 0;

    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const barClass = currentTab === 'volume' ? 'bar-neutral' : (isPositive ? 'bar-up' : 'bar-down');
    const valueColor = currentTab === 'volume' ? 'var(--color-primary)' : getChangeColor(value);
    const formattedValue = formatValueByTab(value, currentTab);

    html += `
      <div class="ranking-item stagger-item" data-theme-id="${themeId}" style="animation-delay: ${index * 40}ms;">
        <div class="rank-number ${rankClass}">${rank}</div>
        <div class="ranking-name">
          <span class="theme-icon">${icon}</span>
          <span>${name}</span>
        </div>
        <div class="ranking-bar-container">
          <div class="ranking-bar ${barClass}" style="width: ${barWidth}%;"></div>
        </div>
        <div class="ranking-value" style="color: ${valueColor};">${formattedValue}</div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  // 為排行項目加上點擊事件
  listContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.ranking-item');
    if (!item) return;
    const themeId = item.dataset.themeId;
    if (themeId) {
      window.location.hash = `#/detail/${encodeURIComponent(themeId)}`;
    }
  });

  // 觸發動畫 - 延遲設定寬度
  requestAnimationFrame(() => {
    const bars = listContainer.querySelectorAll('.ranking-bar');
    bars.forEach((bar) => {
      const targetWidth = bar.style.width;
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        bar.style.width = targetWidth;
      });
    });
  });
}

/**
 * 根據 tab 排序題材
 */
function sortThemes(themes, tab) {
  const sorted = [...themes];
  sorted.sort((a, b) => {
    const va = getValueByTab(a, tab);
    const vb = getValueByTab(b, tab);

    // 成交量和正面指標降序
    if (tab === 'volume') return vb - va;

    // 其他按絕對值 / 數值降序
    return vb - va;
  });
  return sorted;
}

/**
 * 根據 tab 取得對應數值
 */
function getValueByTab(theme, tab) {
  switch (tab) {
    case 'change':
      return theme.avgChangePercent ?? theme.change_percent ?? theme.changePercent ?? theme.change ?? 0;
    case 'volume':
      return theme.totalTradeValue ?? theme.total_value ?? theme.totalValue ?? theme.value ?? theme.volume ?? 0;
    case 'foreign':
      return theme.institutional?.foreignNet ?? theme.foreign_buy ?? theme.foreignBuy ?? 0;
    case 'trust':
      return theme.institutional?.trustNet ?? theme.trust_buy ?? theme.trustBuy ?? 0;
    case 'total_inst':
      return theme.institutional?.totalNet ??
             ((theme.institutional?.foreignNet ?? theme.foreign_buy ?? theme.foreignBuy ?? 0) +
              (theme.institutional?.trustNet ?? theme.trust_buy ?? theme.trustBuy ?? 0) +
              (theme.institutional?.dealerNet ?? theme.dealer_buy ?? theme.dealerBuy ?? 0));
    default:
      return 0;
  }
}

/**
 * 根據 tab 格式化數值
 */
function formatValueByTab(value, tab) {
  switch (tab) {
    case 'change':
      return formatPercent(value);
    case 'volume':
      return formatMoney(value);
    case 'foreign':
    case 'trust':
    case 'total_inst':
      return formatMoney(value);
    default:
      return formatNumber(value);
  }
}
