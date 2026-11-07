/**
 * 資金流向圖表元件
 * 多題材法人買賣超趨勢分析
 */

import { appState, registerChart } from '../main.js';
import { getThemes, getTrend, getDaily } from '../utils/api.js';
import {
  formatMoney,
  formatPercent,
  formatDateShort,
  getChangeColor,
  skeletonCards,
} from '../utils/formatters.js';

let selectedThemes = [];
let currentDays = 10;
let flowChartInstance = null;

const TIME_RANGES = [
  { days: 5, label: '5日' },
  { days: 10, label: '10日' },
  { days: 20, label: '20日' },
  { days: 30, label: '30日' },
];

const INST_COLORS = {
  foreign: { name: '外資', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  trust: { name: '投信', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  dealer: { name: '自營商', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
};

/**
 * 渲染資金流向頁面
 * @param {HTMLElement} container
 */
export async function renderFlowChart(container) {
  container.innerHTML = `
    <div class="page-header anim-fade-in">
      <h1>💰 資金流向分析</h1>
      <p>追蹤法人資金在各題材的流動趨勢</p>
    </div>
    ${skeletonCards(3)}
    <div class="card card-no-hover" style="margin-top: var(--space-2xl);">
      <div class="skeleton skeleton-chart"></div>
    </div>
  `;

  try {
    // 取得題材清單
    let themes = [];
    try {
      const data = await getThemes();
      themes = Array.isArray(data) ? data : (data.themes || data.data || []);
    } catch (e) {
      // 嘗試從 daily 取得
      try {
        const daily = await getDaily(appState.currentDate);
        themes = Array.isArray(daily) ? daily : (daily.themes || daily.data || []);
      } catch (e2) {
        // no data
      }
    }

    // 預設選擇前 3 個題材
    if (themes.length > 0 && selectedThemes.length === 0) {
      selectedThemes = themes.slice(0, Math.min(3, themes.length)).map(
        (t) => t.id || t.theme_id || t.name || t.theme_name
      );
    }

    renderFlowContent(container, themes);
  } catch (error) {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">⚠️</div>
        <div class="error-state-text">載入資金流向資料失敗</div>
        <div class="error-state-sub">${error.message}</div>
        <button class="btn btn-primary" onclick="location.reload()">重新整理</button>
      </div>
    `;
  }
}

/**
 * 渲染資金流向內容
 */
function renderFlowContent(container, themes) {
  if (!themes || themes.length === 0) {
    container.innerHTML = `
      <div class="page-header anim-fade-in">
        <h1>💰 資金流向分析</h1>
        <p>追蹤法人資金在各題材的流動趨勢</p>
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
      <h1>💰 資金流向分析</h1>
      <p>追蹤法人資金在各題材的流動趨勢</p>
    </div>

    <!-- 題材選擇器 -->
    <div class="card anim-slide-up" style="margin-bottom: var(--space-2xl);">
      <div class="card-header">
        <div class="card-title">📌 選擇題材</div>
        <div class="card-subtitle">點擊切換，最多選 5 個</div>
      </div>
      <div class="theme-chip-container" id="flow-theme-chips">
        ${themes
          .map((t) => {
            const id = t.id || t.theme_id || t.name || t.theme_name;
            const name = t.name || t.theme_name || '未知';
            const icon = t.icon || '';
            const isSelected = selectedThemes.includes(id);
            return `
              <div class="chip ${isSelected ? 'chip-neutral active' : 'chip-neutral'}" data-theme-id="${id}">
                ${icon} ${name}
              </div>
            `;
          })
          .join('')}
      </div>
    </div>

    <!-- 時間範圍選擇 -->
    <div class="time-range-selector" id="flow-time-range">
      ${TIME_RANGES.map(
        (r) => `
        <button class="btn btn-ghost btn-sm ${r.days === currentDays ? 'active' : ''}" data-days="${r.days}">
          ${r.label}
        </button>
      `
      ).join('')}
    </div>

    <!-- 圖表 -->
    <div class="card card-no-hover anim-scale-in" style="padding: var(--space-lg);">
      <div class="card-header">
        <div class="card-title">📈 法人買賣超趨勢</div>
        <div class="card-subtitle">柱狀 = 每日淨買超 · 折線 = 累計金額</div>
      </div>
      <div id="flow-chart" class="chart-container" style="height: 450px;"></div>
    </div>

    <!-- 摘要表格 -->
    <div class="card card-no-hover flow-summary-table anim-slide-up">
      <div class="card-header">
        <div class="card-title">📋 區間摘要</div>
      </div>
      <div id="flow-summary-content">
        <div class="loading-spinner"></div>
      </div>
    </div>
  `;

  // 題材 chip 點擊事件
  const chipContainer = document.getElementById('flow-theme-chips');
  chipContainer?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    const themeId = chip.dataset.themeId;
    const idx = selectedThemes.indexOf(themeId);

    if (idx >= 0) {
      selectedThemes.splice(idx, 1);
      chip.classList.remove('active');
    } else if (selectedThemes.length < 5) {
      selectedThemes.push(themeId);
      chip.classList.add('active');
    }

    loadAndRenderChart(themes);
  });

  // 時間範圍選擇事件
  const timeRange = document.getElementById('flow-time-range');
  timeRange?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-days]');
    if (!btn) return;

    const days = parseInt(btn.dataset.days, 10);
    if (days === currentDays) return;

    currentDays = days;
    timeRange.querySelectorAll('.btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    loadAndRenderChart(themes);
  });

  // 載入圖表
  loadAndRenderChart(themes);
}

/**
 * 載入資料並渲染圖表
 */
async function loadAndRenderChart(allThemes) {
  const chartDom = document.getElementById('flow-chart');
  const summaryDom = document.getElementById('flow-summary-content');

  if (!chartDom) return;

  // 如果沒有選擇題材
  if (selectedThemes.length === 0) {
    if (flowChartInstance) {
      flowChartInstance.dispose();
      flowChartInstance = null;
    }
    chartDom.innerHTML = `
      <div class="empty-state" style="height: 100%;">
        <div class="empty-state-icon">👆</div>
        <div class="empty-state-text">請選擇至少一個題材</div>
      </div>
    `;
    if (summaryDom) summaryDom.innerHTML = '<div class="text-secondary text-sm" style="text-align: center; padding: 24px;">尚未選擇題材</div>';
    return;
  }

  // 載入趨勢資料
  const trendResults = [];

  for (const themeId of selectedThemes) {
    try {
      const trend = await getTrend(themeId, currentDays);
      const themeMeta = allThemes.find(
        (t) => (t.id || t.theme_id || t.name || t.theme_name) === themeId
      );
      trendResults.push({
        themeId,
        name: themeMeta?.name || themeMeta?.theme_name || themeId,
        icon: themeMeta?.icon || '',
        data: Array.isArray(trend) ? trend : (trend.data || trend.trend || []),
      });
    } catch (e) {
      console.warn(`無法取得 ${themeId} 的趨勢資料`, e);
    }
  }

  renderFlowChartEcharts(chartDom, trendResults);
  renderFlowSummary(summaryDom, trendResults);
}

/**
 * 渲染 ECharts 流向圖表
 */
function renderFlowChartEcharts(chartDom, trendResults) {
  // 如果沒有資料
  if (trendResults.length === 0 || trendResults.every((t) => t.data.length === 0)) {
    chartDom.innerHTML = `
      <div class="empty-state" style="height: 100%;">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">暫無趨勢資料</div>
      </div>
    `;
    return;
  }

  chartDom.innerHTML = '';

  if (flowChartInstance) {
    try { flowChartInstance.dispose(); } catch (e) {}
  }

  flowChartInstance = echarts.init(chartDom, null, { renderer: 'canvas' });
  registerChart(flowChartInstance);

  // 整合所有日期
  const allDates = new Set();
  trendResults.forEach((t) => {
    t.data.forEach((d) => {
      const date = d.date || d.trade_date;
      if (date) allDates.add(date);
    });
  });
  const dates = [...allDates].sort();

  // 主題色陣列
  const themeColors = ['#3b82f6', '#f59e0b', '#ef4444', '#22c55e', '#8b5cf6'];

  // 構建系列
  const barSeries = [];
  const lineSeries = [];

  trendResults.forEach((theme, idx) => {
    const color = themeColors[idx % themeColors.length];
    const dataMap = new Map();
    theme.data.forEach((d) => {
      const date = d.date || d.trade_date;
      dataMap.set(date, d);
    });

    // 每日淨買超 bar
    const barData = dates.map((date) => {
      const d = dataMap.get(date);
      if (!d) return 0;
      const foreign = d.foreign_buy ?? d.foreignBuy ?? 0;
      const trust = d.trust_buy ?? d.trustBuy ?? 0;
      const dealer = d.dealer_buy ?? d.dealerBuy ?? 0;
      return foreign + trust + dealer;
    });

    barSeries.push({
      name: `${theme.icon} ${theme.name}`,
      type: 'bar',
      stack: 'daily',
      data: barData,
      itemStyle: {
        color: color,
        opacity: 0.75,
        borderRadius: [2, 2, 0, 0],
      },
      emphasis: {
        itemStyle: { opacity: 1 },
      },
    });

    // 累計折線
    let cumulative = 0;
    const lineData = dates.map((date) => {
      const d = dataMap.get(date);
      if (d) {
        const foreign = d.foreign_buy ?? d.foreignBuy ?? 0;
        const trust = d.trust_buy ?? d.trustBuy ?? 0;
        const dealer = d.dealer_buy ?? d.dealerBuy ?? 0;
        cumulative += foreign + trust + dealer;
      }
      return cumulative;
    });

    lineSeries.push({
      name: `${theme.icon} ${theme.name} (累計)`,
      type: 'line',
      yAxisIndex: 1,
      data: lineData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 2,
        color: color,
      },
      itemStyle: {
        color: color,
        borderColor: '#0a0e17',
        borderWidth: 2,
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: color.replace(')', ', 0.2)').replace('rgb', 'rgba') },
          { offset: 1, color: color.replace(')', ', 0.02)').replace('rgb', 'rgba') },
        ]),
      },
    });
  });

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.96)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
      borderWidth: 1,
      padding: [12, 16],
      textStyle: {
        color: '#e2e8f0',
        fontSize: 12,
        fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
      },
      axisPointer: {
        type: 'cross',
        crossStyle: { color: '#94a3b8' },
      },
      formatter: function (params) {
        if (!params || params.length === 0) return '';
        let html = `<div style="font-weight:600; margin-bottom:8px;">${params[0].axisValue}</div>`;
        params.forEach((p) => {
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>`;
          html += `<div style="display:flex;justify-content:space-between;gap:20px;padding:2px 0;">
            <span>${dot}${p.seriesName}</span>
            <span style="font-weight:600;font-family:'Inter',monospace;">${formatMoney(p.value)}</span>
          </div>`;
        });
        return html;
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: {
        color: '#94a3b8',
        fontSize: 11,
        fontFamily: "'Noto Sans TC', sans-serif",
      },
      pageTextStyle: { color: '#94a3b8' },
      pageIconColor: '#3b82f6',
      pageIconInactiveColor: '#64748b',
    },
    grid: {
      left: '3%',
      right: '3%',
      top: '10%',
      bottom: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates.map(formatDateShort),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        fontFamily: "'Inter', sans-serif",
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '每日淨買超',
        nameTextStyle: { color: '#64748b', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          formatter: (v) => formatMoney(v),
        },
      },
      {
        type: 'value',
        name: '累計金額',
        nameTextStyle: { color: '#64748b', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          formatter: (v) => formatMoney(v),
        },
      },
    ],
    series: [...barSeries, ...lineSeries],
    animationDuration: 800,
    animationEasing: 'cubicOut',
  };

  flowChartInstance.setOption(option);
}

/**
 * 渲染流向摘要表格
 */
function renderFlowSummary(summaryDom, trendResults) {
  if (!summaryDom) return;

  if (trendResults.length === 0) {
    summaryDom.innerHTML = '<div class="text-secondary text-sm" style="text-align: center; padding: 24px;">暫無資料</div>';
    return;
  }

  // 計算每個題材的區間合計
  const summaries = trendResults.map((theme) => {
    let totalForeign = 0, totalTrust = 0, totalDealer = 0;

    theme.data.forEach((d) => {
      totalForeign += d.foreign_buy ?? d.foreignBuy ?? 0;
      totalTrust += d.trust_buy ?? d.trustBuy ?? 0;
      totalDealer += d.dealer_buy ?? d.dealerBuy ?? 0;
    });

    return {
      name: theme.name,
      icon: theme.icon,
      foreign: totalForeign,
      trust: totalTrust,
      dealer: totalDealer,
      total: totalForeign + totalTrust + totalDealer,
      days: theme.data.length,
    };
  });

  summaryDom.innerHTML = `
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>題材</th>
            <th class="cell-right">外資合計</th>
            <th class="cell-right">投信合計</th>
            <th class="cell-right">自營商合計</th>
            <th class="cell-right">三大法人合計</th>
            <th class="cell-center">交易日數</th>
          </tr>
        </thead>
        <tbody>
          ${summaries
            .map(
              (s) => `
            <tr>
              <td class="text-cell">${s.icon} ${s.name}</td>
              <td class="cell-right" style="color: ${getChangeColor(s.foreign)};">${formatMoney(s.foreign)}</td>
              <td class="cell-right" style="color: ${getChangeColor(s.trust)};">${formatMoney(s.trust)}</td>
              <td class="cell-right" style="color: ${getChangeColor(s.dealer)};">${formatMoney(s.dealer)}</td>
              <td class="cell-right" style="color: ${getChangeColor(s.total)}; font-weight: 600;">${formatMoney(s.total)}</td>
              <td class="cell-center">${s.days}日</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}
