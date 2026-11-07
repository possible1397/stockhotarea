/**
 * API 客戶端模組
 * 封裝所有後端 API 呼叫，帶有記憶體快取
 */

/** 快取 Map：key → { data, timestamp } */
const cache = new Map();

/** 快取存活時間（毫秒）：5 分鐘 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 通用 JSON 請求封裝
 * @param {string} url - API 路徑
 * @param {object} options - fetch options
 * @returns {Promise<any>}
 */
export async function fetchJSON(url, options = {}) {
  const cacheKey = options.method === 'POST' ? null : url;

  // 檢查快取
  if (cacheKey && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    cache.delete(cacheKey);
  }

  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const data = await response.json();

    // 寫入快取
    if (cacheKey) {
      cache.set(cacheKey, { data, timestamp: Date.now() });
    }

    return data;
  } catch (error) {
    console.error(`API 請求失敗: ${url}`, error);
    throw error;
  }
}

/**
 * 清除快取
 * @param {string} [prefix] - 可選前綴，清除符合的快取
 */
export function clearCache(prefix) {
  if (prefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

/**
 * 取得所有題材列表
 * @returns {Promise<Array>}
 */
export function getThemes() {
  return fetchJSON('/api/themes');
}

/**
 * 取得總覽資料
 * @returns {Promise<Object>}
 */
export function getOverview() {
  return fetchJSON('/api/overview');
}

/**
 * 取得指定日期的每日資料
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export function getDaily(date) {
  return fetchJSON(`/api/daily/${date}`);
}

/**
 * 取得題材趨勢資料
 * @param {string} themeId - 題材ID
 * @param {number} [days=30] - 天數
 * @returns {Promise<Object>}
 */
export function getTrend(themeId, days = 30) {
  return fetchJSON(`/api/trend/${themeId}?days=${days}`);
}

/**
 * 取得排行榜資料
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export function getRanking(date) {
  return fetchJSON(`/api/ranking/${date}`);
}

/**
 * 取得熱力圖資料
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export function getHeatmapData(date) {
  return fetchJSON(`/api/heatmap/${date}`);
}

/**
 * 取得題材內的個股資料
 * @param {string} themeId - 題材ID
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export function getStocks(themeId, date) {
  return fetchJSON(`/api/stocks/${themeId}/${date}`);
}

/**
 * 取得可用日期列表
 * @returns {Promise<Array<string>>}
 */
export function getDates() {
  return fetchJSON('/api/dates');
}

/**
 * 觸發資料抓取
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export function triggerFetch(date) {
  return fetchJSON(`/api/fetch/${date}`, { method: 'POST' });
}
