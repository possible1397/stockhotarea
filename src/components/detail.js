/**
 * 題材詳情元件
 * 顯示單一題材的詳細資訊、趨勢圖、成分股
 */

import { appState, registerChart } from '../main.js';
import { getTrend, getStocks } from '../utils/api.js';
import {
  formatMoney,
  formatPercent,
  formatVolume,
  formatDateShort,
  formatNumber,
  formatSignedNumber,
  getChangeColor,
  getChangeClass,
  animateNumber,
  skeletonCards,
} from '../utils/formatters.js';

let sortCol = null;
let sortDir = 'desc';
let detailChartInstance = null;

/**
 * 渲染題材詳情頁面
 * @param {HTMLElement} container
 * @param {string} themeId
 */
export async function renderDetail(container, themeId) {
  if (!themeId) {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">❓</div>
        <div class="error-state-text">找不到題材</div>
        <button class="btn btn-primary" onclick="location.hash='#/'">返回首頁</button>
      </div>
    `;
    return;
  }

  // Reset sort
  sortCol = null;
  sortDir = 'desc';

  container.innerHTML = `
    <div class="back-btn anim-fade-in" id="detail-back-btn">← 返回</div>
    <div class="page-header anim-fade-in">
      <h1>載入中...</h1>
    </div>
    ${skeletonCards(4)}
    <div class="card card-no-hover" style="margin-top: var(--space-2xl);">
      <div class="skeleton skeleton-chart" style="height: 300px;"></div>
    </div>
    <div class="card card-no-hover" style="margin-top: var(--space-2xl);">
      <div class="skeleton skeleton-chart" style="height: 400px;"></div>
    </div>
  `;

  // 返回按鈕
  document.getElementById('detail-back-btn')?.addEventListener('click', () => {
    window.history.back();
  });

  try {
    const date = appState.currentDate;

    // 並行載入趨勢和個股資料
    const [trendResult, stocksResult] = await Promise.allSettled([
      getTrend(themeId, 30),
      getStocks(themeId, date),
    ]);

    const trendData = trendResult.status === 'fulfilled' ? extractArray(trendResult.value) : [];
    const stocksData = stocksResult.status === 'fulfilled' ? extractArray(stocksResult.value) : [];

    renderDetailContent(container, themeId, trendData, stocksData);
  } catch (error) {
    container.innerHTML = `
      <div class="back-btn" id="detail-back-btn-err">← 返回</div>
      <div class="error-state">
        <div class="error-state-icon">⚠️</div>
        <div class="error-state-text">載入題材詳情失敗</div>
        <div class="error-state-sub">${error.message}</div>
        <button class="btn btn-primary" onclick="location.hash='#/'">返回首頁</button>
      </div>
    `;
    document.getElementById('detail-back-btn-err')?.addEventListener('click', () => {
      window.history.back();
    });
  }
}

/**
 * 從 API 回傳中提取陣列
 */
function extractArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.data && Array.isArray(data.data)) return data.data;
  if (data.stocks && Array.isArray(data.stocks)) return data.stocks;
  if (data.trend && Array.isArray(data.trend)) return data.trend;
  return [];
}

/**
 * 渲染詳情頁內容
 */
function renderDetailContent(container, themeId, trendData, stocksData) {
  // 從趨勢資料中取最新一筆作為概要
  const latest = trendData.length > 0 ? trendData[trendData.length - 1] : null;
  const themeName = latest?.theme_name || latest?.name || themeId;
  const themeIcon = latest?.icon || '📊';

  // 計算概要統計
  const change = latest?.change_percent ?? latest?.changePercent ?? latest?.change ?? null;
  const volume = latest?.total_value ?? latest?.totalValue ?? latest?.value ?? null;
  const foreignBuy = latest?.foreign_buy ?? latest?.foreignBuy ?? null;
  const trustBuy = latest?.trust_buy ?? latest?.trustBuy ?? null;
  const dealerBuy = latest?.dealer_buy ?? latest?.dealerBuy ?? null;
  const totalInst = (foreignBuy ?? 0) + (trustBuy ?? 0) + (dealerBuy ?? 0);

  container.innerHTML = `
    <div class="back-btn anim-fade-in" id="detail-back-btn-main">← 返回</div>

    <!-- 題材標頭 -->
    <div class="detail-header anim-slide-up">
      <div class="detail-theme-icon">${themeIcon}</div>
      <div>
        <div class="detail-theme-name">${themeName}</div>
        <div class="text-secondary text-sm">資料日期：${appState.currentDate || '—'} · 成分股 ${stocksData.length} 檔</div>
      </div>
    </div>

    <!-- 統計卡片 -->
    <div class="grid-stats" id="detail-stats">
      <div class="stat-card ${change != null && change > 0 ? 'up' : change != null && change < 0 ? 'down' : ''} stagger-item">
        <div class="stat-card-icon">${change != null && change >= 0 ? '📈' : '📉'}</div>
        <div class="stat-card-label">平均漲跌幅</div>
        <div class="stat-card-value">${change != null ? formatPercent(change) : '—'}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: var(--color-primary-border);">
        <div class="stat-card-icon">💎</div>
        <div class="stat-card-label">成交金額</div>
        <div class="stat-card-value text-primary-color">${volume != null ? formatMoney(volume) : '—'}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: ${getChangeColor(foreignBuy)}33;">
        <div class="stat-card-icon">🏦</div>
        <div class="stat-card-label">外資買賣超</div>
        <div class="stat-card-value" style="color: ${getChangeColor(foreignBuy)};">${foreignBuy != null ? formatMoney(foreignBuy) : '—'}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: ${getChangeColor(trustBuy)}33;">
        <div class="stat-card-icon">🏛️</div>
        <div class="stat-card-label">投信買賣超</div>
        <div class="stat-card-value" style="color: ${getChangeColor(trustBuy)};">${trustBuy != null ? formatMoney(trustBuy) : '—'}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: ${getChangeColor(dealerBuy)}33;">
        <div class="stat-card-icon">🏢</div>
        <div class="stat-card-label">自營商買賣超</div>
        <div class="stat-card-value" style="color: ${getChangeColor(dealerBuy)};">${dealerBuy != null ? formatMoney(dealerBuy) : '—'}</div>
      </div>
      <div class="stat-card stagger-item" style="border-color: ${getChangeColor(totalInst)}33;">
        <div class="stat-card-icon">🤝</div>
        <div class="stat-card-label">三大法人合計</div>
        <div class="stat-card-value" style="color: ${getChangeColor(totalInst)};">${formatMoney(totalInst)}</div>
      </div>
    </div>

    <!-- 30日趨勢圖 -->
    <div class="card card-no-hover anim-scale-in" style="padding: var(--space-lg); margin-bottom: var(--space-2xl);">
      <div class="card-header">
        <div class="card-title">📈 30日趨勢</div>
        <div class="card-subtitle">漲跌幅 與 法人買賣超</div>
      </div>
      <div id="detail-trend-chart" class="chart-container" style="height: 300px;"></div>
    </div>

    <!-- 成分股表格 -->
    <div class="card card-no-hover anim-slide-up" style="padding: var(--space-lg);">
      <div class="card-header">
        <div class="card-title">📋 成分股明細</div>
        <div class="card-subtitle">點擊欄位標題排序</div>
      </div>
      <div id="detail-stocks-table"></div>
    </div>
  `;

  // 返回按鈕
  document.getElementById('detail-back-btn-main')?.addEventListener('click', () => {
    window.history.back();
  });

  // 渲染趨勢圖
  if (trendData.length > 0) {
    renderTrendChart(trendData);
  } else {
    const chartDom = document.getElementById('detail-trend-chart');
    if (chartDom) {
      chartDom.innerHTML = `
        <div class="empty-state" style="height: 100%;">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">暫無趨勢資料</div>
        </div>
      `;
    }
  }

  // 渲染成分股表格
  renderStocksTable(stocksData);
}

/**
 * 渲染 30 日趨勢圖
 */
function renderTrendChart(trendData) {
  const chartDom = document.getElementById('detail-trend-chart');
  if (!chartDom) return;

  if (detailChartInstance) {
    try { detailChartInstance.dispose(); } catch (e) {}
  }

  detailChartInstance = echarts.init(chartDom, null, { renderer: 'canvas' });
  registerChart(detailChartInstance);

  const dates = trendData.map((d) => d.date || d.trade_date || '');
  const changes = trendData.map((d) => d.change_percent ?? d.changePercent ?? d.change ?? 0);
  const instBuy = trendData.map((d) => {
    const f = d.foreign_buy ?? d.foreignBuy ?? 0;
    const t = d.trust_buy ?? d.trustBuy ?? 0;
    const dl = d.dealer_buy ?? d.dealerBuy ?? 0;
    return f + t + dl;
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
      axisPointer: { type: 'cross', crossStyle: { color: '#94a3b8' } },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#94a3b8', fontSize: 11 },
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
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        name: '漲跌幅(%)',
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: '{value}%',
        },
      },
      {
        type: 'value',
        name: '法人買賣超',
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: (v) => formatMoney(v),
        },
      },
    ],
    series: [
      {
        name: '漲跌幅',
        type: 'line',
        data: changes,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 2, color: '#ef4444' },
        itemStyle: { color: '#ef4444', borderColor: '#0a0e17', borderWidth: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239, 68, 68, 0.2)' },
            { offset: 1, color: 'rgba(239, 68, 68, 0.02)' },
          ]),
        },
      },
      {
        name: '法人買賣超',
        type: 'bar',
        yAxisIndex: 1,
        data: instBuy,
        itemStyle: {
          color: function (params) {
            return params.value >= 0 ? 'rgba(59, 130, 246, 0.7)' : 'rgba(139, 92, 246, 0.7)';
          },
          borderRadius: [2, 2, 0, 0],
        },
      },
    ],
    animationDuration: 600,
    animationEasing: 'cubicOut',
  };

  detailChartInstance.setOption(option);
}

/**
 * 渲染成分股表格
 */
function renderStocksTable(stocks) {
  const tableContainer = document.getElementById('detail-stocks-table');
  if (!tableContainer) return;

  if (!stocks || stocks.length === 0) {
    tableContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">暫無成分股資料</div>
      </div>
    `;
    return;
  }

  // 排序
  const sorted = sortStocks(stocks);

  const columns = [
    { key: 'stock_id', label: '代號', align: 'left', sortable: true },
    { key: 'name', label: '名稱', align: 'left', sortable: true },
    { key: 'close', label: '收盤價', align: 'right', sortable: true },
    { key: 'change_percent', label: '漲跌幅', align: 'right', sortable: true },
    { key: 'volume', label: '成交量(張)', align: 'right', sortable: true },
    { key: 'foreign_buy', label: '外資買賣超', align: 'right', sortable: true },
    { key: 'trust_buy', label: '投信買賣超', align: 'right', sortable: true },
    { key: 'dealer_buy', label: '自營商買賣超', align: 'right', sortable: true },
    { key: 'total_inst', label: '三大法人合計', align: 'right', sortable: true },
  ];

  tableContainer.innerHTML = `
    <div class="table-container" style="max-height: 600px; overflow-y: auto;">
      <table class="data-table" id="detail-data-table">
        <thead>
          <tr>
            ${columns
              .map((col) => {
                const isActive = sortCol === col.key;
                const icon = isActive ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
                return `
                  <th class="${col.align === 'right' ? 'cell-right' : ''} ${isActive ? 'sort-active' : ''}"
                      data-sort-key="${col.key}" ${col.sortable ? 'data-sortable="true"' : ''}>
                    ${col.label}
                    ${col.sortable ? `<span class="sort-icon">${icon}</span>` : ''}
                  </th>
                `;
              })
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((stock) => renderStockRow(stock)).join('')}
        </tbody>
      </table>
    </div>
  `;

  // 排序事件
  const table = document.getElementById('detail-data-table');
  table?.querySelector('thead')?.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sortable]');
    if (!th) return;

    const key = th.dataset.sortKey;
    if (sortCol === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = key;
      sortDir = 'desc';
    }

    renderStocksTable(stocks);
  });
}

/**
 * 渲染單一個股行
 */
function renderStockRow(stock) {
  const id = stock.stock_id ?? stock.stockId ?? stock.id ?? '—';
  const name = stock.name ?? stock.stock_name ?? '—';
  const close = stock.close ?? stock.price ?? null;
  const change = stock.change_percent ?? stock.changePercent ?? stock.change ?? null;
  const vol = stock.volume ?? null;
  const foreign = stock.foreign_buy ?? stock.foreignBuy ?? null;
  const trust = stock.trust_buy ?? stock.trustBuy ?? null;
  const dealer = stock.dealer_buy ?? stock.dealerBuy ?? null;
  const totalInst = (foreign ?? 0) + (trust ?? 0) + (dealer ?? 0);

  return `
    <tr>
      <td class="text-cell" style="font-weight: 500; color: var(--color-primary);">${id}</td>
      <td class="text-cell">${name}</td>
      <td class="cell-right">${close != null ? close.toFixed(2) : '—'}</td>
      <td class="cell-right">
        <span class="${change != null ? (change > 0 ? 'badge badge-up' : change < 0 ? 'badge badge-down' : 'badge badge-flat') : ''}">
          ${change != null ? formatPercent(change) : '—'}
        </span>
      </td>
      <td class="cell-right">${vol != null ? formatVolume(vol) : '—'}</td>
      <td class="cell-right" style="color: ${getChangeColor(foreign)};">${foreign != null ? formatSignedNumber(foreign) : '—'}</td>
      <td class="cell-right" style="color: ${getChangeColor(trust)};">${trust != null ? formatSignedNumber(trust) : '—'}</td>
      <td class="cell-right" style="color: ${getChangeColor(dealer)};">${dealer != null ? formatSignedNumber(dealer) : '—'}</td>
      <td class="cell-right" style="color: ${getChangeColor(totalInst)}; font-weight: 600;">${formatSignedNumber(totalInst)}</td>
    </tr>
  `;
}

/**
 * 排序個股
 */
function sortStocks(stocks) {
  if (!sortCol) return stocks;

  const sorted = [...stocks];
  sorted.sort((a, b) => {
    let va = getStockValue(a, sortCol);
    let vb = getStockValue(b, sortCol);

    // 字串排序
    if (typeof va === 'string' && typeof vb === 'string') {
      const cmp = va.localeCompare(vb, 'zh-TW');
      return sortDir === 'asc' ? cmp : -cmp;
    }

    // 數字排序
    va = va ?? -Infinity;
    vb = vb ?? -Infinity;
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  return sorted;
}

/**
 * 取得個股欄位值
 */
function getStockValue(stock, key) {
  switch (key) {
    case 'stock_id':
      return stock.stock_id ?? stock.stockId ?? stock.id ?? '';
    case 'name':
      return stock.name ?? stock.stock_name ?? '';
    case 'close':
      return stock.close ?? stock.price ?? 0;
    case 'change_percent':
      return stock.change_percent ?? stock.changePercent ?? stock.change ?? 0;
    case 'volume':
      return stock.volume ?? 0;
    case 'foreign_buy':
      return stock.foreign_buy ?? stock.foreignBuy ?? 0;
    case 'trust_buy':
      return stock.trust_buy ?? stock.trustBuy ?? 0;
    case 'dealer_buy':
      return stock.dealer_buy ?? stock.dealerBuy ?? 0;
    case 'total_inst':
      return (stock.foreign_buy ?? stock.foreignBuy ?? 0) +
             (stock.trust_buy ?? stock.trustBuy ?? 0) +
             (stock.dealer_buy ?? stock.dealerBuy ?? 0);
    default:
      return 0;
  }
}
