/**
 * 熱力圖 / TreeMap 元件
 * 總覽儀表板主頁面 - 顯示題材熱力圖與統計摘要
 */

import { appState, registerChart } from '../main.js';
import { getDaily, getOverview } from '../utils/api.js';
import {
  formatMoney,
  formatPercent,
  formatVolume,
  formatNumber,
  getChangeColor,
  getChangeClass,
  animateNumber,
  skeletonCards,
} from '../utils/formatters.js';

/**
 * 渲染熱力圖頁面
 * @param {HTMLElement} container - #page-content
 */
export async function renderHeatmap(container) {
  // 顯示載入狀態
  container.innerHTML = `
    <div class="page-header anim-fade-in">
      <h1>📊 總覽儀表板</h1>
      <p>台股各題材板塊資金動向一覽</p>
    </div>
    ${skeletonCards(5)}
    <div class="card card-no-hover" style="margin-top: var(--space-2xl);">
      <div class="skeleton skeleton-chart"></div>
    </div>
  `;

  try {
    const date = appState.currentDate;
    let data = null;

    // 嘗試取得總覽資料
    try {
      data = await getOverview();
    } catch (e) {
      // fallback 嘗試 daily
      try {
        data = await getDaily(date);
      } catch (e2) {
        // both failed
      }
    }

    renderContent(container, data);
  } catch (error) {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">⚠️</div>
        <div class="error-state-text">載入資料失敗</div>
        <div class="error-state-sub">${error.message}</div>
        <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 16px;">重新整理</button>
      </div>
    `;
  }
}

/**
 * 渲染頁面內容
 */
function renderContent(container, data) {
  // 解析資料
  const themes = extractThemes(data);

  if (!themes || themes.length === 0) {
    container.innerHTML = `
      <div class="page-header anim-fade-in">
        <h1>📊 總覽儀表板</h1>
        <p>台股各題材板塊資金動向一覽</p>
      </div>
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">暫無資料</div>
        <div class="empty-state-sub">請先透過左側選單選擇日期並抓取資料</div>
      </div>
    `;
    return;
  }

  // 計算統計數據
  const stats = calcStats(themes);

  container.innerHTML = `
    <div class="page-header anim-fade-in">
      <h1>📊 總覽儀表板</h1>
      <p>台股各題材板塊資金動向一覽 · ${appState.currentDate || ''}</p>
    </div>

    <!-- 統計卡片 -->
    <div class="grid-stats" id="heatmap-stats">
      <div class="stat-card up stagger-item">
        <div class="stat-card-icon">📈</div>
        <div class="stat-card-label">上漲題材</div>
        <div class="stat-card-value" id="stat-up-count">${stats.upCount}</div>
      </div>
      <div class="stat-card down stagger-item">
        <div class="stat-card-icon">📉</div>
        <div class="stat-card-label">下跌題材</div>
        <div class="stat-card-value" id="stat-down-count">${stats.downCount}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: var(--color-up-border);">
        <div class="stat-card-icon">🔥</div>
        <div class="stat-card-label">最強題材</div>
        <div class="stat-card-value text-up" style="font-size: 1rem; font-family: var(--font-sans);" id="stat-strongest">${stats.strongest.name || '—'}</div>
        <div class="stat-card-change text-up">${stats.strongest.change != null ? formatPercent(stats.strongest.change) : '—'}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: var(--color-down-border);">
        <div class="stat-card-icon">❄️</div>
        <div class="stat-card-label">最弱題材</div>
        <div class="stat-card-value text-down" style="font-size: 1rem; font-family: var(--font-sans);" id="stat-weakest">${stats.weakest.name || '—'}</div>
        <div class="stat-card-change text-down">${stats.weakest.change != null ? formatPercent(stats.weakest.change) : '—'}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: var(--color-primary-border);">
        <div class="stat-card-icon">💎</div>
        <div class="stat-card-label">總成交金額</div>
        <div class="stat-card-value text-primary-color" id="stat-total-volume">${formatMoney(stats.totalValue)}</div>
      </div>
    </div>

    <!-- TreeMap 熱力圖 -->
    <div class="card card-no-hover anim-scale-in" style="padding: var(--space-lg);">
      <div class="card-header">
        <div class="card-title">🗺️ 題材熱力圖</div>
        <div class="card-subtitle">面積 = 成交金額 · 顏色 = 漲跌幅</div>
      </div>
      <div id="treemap-chart" class="chart-container" style="height: 520px;"></div>
    </div>
  `;

  // 渲染 TreeMap
  renderTreemap(themes);

  // 動畫數字
  const upEl = document.getElementById('stat-up-count');
  const downEl = document.getElementById('stat-down-count');
  if (upEl) animateNumber(upEl, stats.upCount, 800, (v) => Math.round(v).toString());
  if (downEl) animateNumber(downEl, stats.downCount, 800, (v) => Math.round(v).toString());
}

/**
 * 從 API 回應中提取題材列表
 */
function extractThemes(data) {
  if (!data) return [];

  // 如果是陣列格式
  if (Array.isArray(data)) return data;

  // 如果有 themes 屬性
  if (data.themes && Array.isArray(data.themes)) return data.themes;

  // 如果有 data 屬性
  if (data.data && Array.isArray(data.data)) return data.data;

  // 如果有 heatmap 屬性
  if (data.heatmap && Array.isArray(data.heatmap)) return data.heatmap;

  return [];
}

/**
 * 計算統計數據
 */
function calcStats(themes) {
  let upCount = 0;
  let downCount = 0;
  let totalValue = 0;
  let strongest = { name: '—', change: 0 };
  let weakest = { name: '—', change: 0 };

  themes.forEach((t) => {
    const change = t.avgChangePercent ?? t.change_percent ?? t.changePercent ?? t.change ?? 0;
    const value = t.totalTradeValue ?? t.total_value ?? t.totalValue ?? t.value ?? t.volume ?? 0;

    if (change > 0) upCount++;
    else if (change < 0) downCount++;

    totalValue += value;

    if (change > (strongest.change ?? -Infinity)) {
      strongest = { name: t.name || t.theme_name || '—', change };
    }
    if (change < (weakest.change ?? Infinity)) {
      weakest = { name: t.name || t.theme_name || '—', change };
    }
  });

  return { upCount, downCount, totalValue, strongest, weakest };
}

/**
 * 渲染 ECharts TreeMap
 */
function renderTreemap(themes) {
  const chartDom = document.getElementById('treemap-chart');
  if (!chartDom) return;

  const chart = echarts.init(chartDom, null, { renderer: 'canvas' });
  registerChart(chart);

  // 準備資料
  const changes = themes.map((t) => t.avgChangePercent ?? t.change_percent ?? t.changePercent ?? t.change ?? 0);
  const maxChange = Math.max(...changes.map(Math.abs), 1);

  const treeData = themes.map((t) => {
    const change = t.avgChangePercent ?? t.change_percent ?? t.changePercent ?? t.change ?? 0;
    const value = Math.max(t.totalTradeValue ?? t.total_value ?? t.totalValue ?? t.value ?? t.volume ?? 1, 1);
    const name = t.name || t.theme_name || '未知';
    const icon = t.icon || '';
    const themeId = t.id || t.theme_id || name;

    return {
      name: icon ? `${icon} ${name}` : name,
      value: value,
      change: change,
      themeId: themeId,
      rawName: name,
      foreignBuy: t.institutional?.foreignNet ?? t.foreign_buy ?? t.foreignBuy ?? null,
      trustBuy: t.institutional?.trustNet ?? t.trust_buy ?? t.trustBuy ?? null,
      dealerBuy: t.institutional?.dealerNet ?? t.dealer_buy ?? t.dealerBuy ?? null,
      totalVolume: t.totalVolume ?? t.total_volume ?? value,
      itemStyle: {
        color: getTreemapColor(change, maxChange),
        borderColor: 'rgba(10, 14, 23, 0.8)',
        borderWidth: 2,
        gapWidth: 2,
      },
    };
  });

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.96)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
      borderWidth: 1,
      padding: [12, 16],
      textStyle: {
        color: '#e2e8f0',
        fontSize: 13,
        fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
      },
      formatter: function (params) {
        const d = params.data;
        if (!d) return '';
        const changeColor = d.change > 0 ? '#ef4444' : d.change < 0 ? '#22c55e' : '#94a3b8';
        const sign = d.change > 0 ? '+' : '';

        let html = `
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">${d.name}</div>
          <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
            <span style="color: #94a3b8;">漲跌幅</span>
            <span style="font-weight: 600; color: ${changeColor}; font-family: 'Inter', monospace;">${sign}${d.change.toFixed(2)}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
            <span style="color: #94a3b8;">成交金額</span>
            <span style="font-weight: 600; font-family: 'Inter', monospace;">${formatMoney(d.value)}</span>
          </div>
        `;

        if (d.foreignBuy != null) {
          const fColor = d.foreignBuy > 0 ? '#ef4444' : d.foreignBuy < 0 ? '#22c55e' : '#94a3b8';
          html += `
            <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
              <span style="color: #94a3b8;">外資買賣超</span>
              <span style="font-weight: 600; color: ${fColor}; font-family: 'Inter', monospace;">${formatMoney(d.foreignBuy)}</span>
            </div>
          `;
        }
        if (d.trustBuy != null) {
          const tColor = d.trustBuy > 0 ? '#ef4444' : d.trustBuy < 0 ? '#22c55e' : '#94a3b8';
          html += `
            <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
              <span style="color: #94a3b8;">投信買賣超</span>
              <span style="font-weight: 600; color: ${tColor}; font-family: 'Inter', monospace;">${formatMoney(d.trustBuy)}</span>
            </div>
          `;
        }
        if (d.dealerBuy != null) {
          const dColor = d.dealerBuy > 0 ? '#ef4444' : d.dealerBuy < 0 ? '#22c55e' : '#94a3b8';
          html += `
            <div style="display: flex; justify-content: space-between; gap: 24px;">
              <span style="color: #94a3b8;">自營商買賣超</span>
              <span style="font-weight: 600; color: ${dColor}; font-family: 'Inter', monospace;">${formatMoney(d.dealerBuy)}</span>
            </div>
          `;
        }

        return html;
      },
    },
    series: [
      {
        type: 'treemap',
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: 'link',
        breadcrumb: { show: false },
        squareRatio: 0.75,
        label: {
          show: true,
          formatter: function (params) {
            const d = params.data;
            if (!d) return '';
            const sign = d.change > 0 ? '+' : '';
            return `{name|${d.name}}\n{change|${sign}${d.change.toFixed(2)}%}`;
          },
          rich: {
            name: {
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              lineHeight: 22,
              fontFamily: "'Noto Sans TC', sans-serif",
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowBlur: 4,
            },
            change: {
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(255, 255, 255, 0.85)',
              fontFamily: "'Inter', monospace",
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowBlur: 3,
            },
          },
          verticalAlign: 'middle',
          align: 'center',
        },
        upperLabel: { show: false },
        itemStyle: {
          borderColor: 'rgba(10, 14, 23, 0.6)',
          borderWidth: 2,
          gapWidth: 2,
        },
        emphasis: {
          itemStyle: {
            borderColor: 'rgba(255, 255, 255, 0.3)',
            borderWidth: 2,
            shadowBlur: 20,
            shadowColor: 'rgba(59, 130, 246, 0.3)',
          },
          label: {
            show: true,
          },
        },
        levels: [
          {
            itemStyle: {
              borderColor: 'rgba(10, 14, 23, 0.8)',
              borderWidth: 3,
              gapWidth: 3,
            },
          },
        ],
        animationDuration: 800,
        animationEasing: 'cubicOut',
        data: treeData,
      },
    ],
  };

  chart.setOption(option);

  // 點擊事件 → 導航到詳情頁
  chart.on('click', (params) => {
    if (params.data && params.data.themeId) {
      window.location.hash = `#/detail/${encodeURIComponent(params.data.themeId)}`;
    }
  });
}

/**
 * 根據漲跌幅計算 TreeMap 色塊顏色
 */
function getTreemapColor(change, maxChange) {
  if (change === 0) return 'rgba(50, 55, 70, 0.9)';

  const normalized = Math.min(Math.abs(change) / maxChange, 1);
  // 使用非線性映射讓小幅漲跌也有顏色差異
  const intensity = Math.pow(normalized, 0.6);

  if (change > 0) {
    // 紅色漸層（台股漲 = 紅）
    const r = Math.round(60 + intensity * 179);
    const g = Math.round(25 + intensity * 20);
    const b = Math.round(30 + intensity * 15);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // 綠色漸層（台股跌 = 綠）
    const r = Math.round(20 + intensity * 10);
    const g = Math.round(50 + intensity * 147);
    const b = Math.round(35 + intensity * 59);
    return `rgb(${r}, ${g}, ${b})`;
  }
}
