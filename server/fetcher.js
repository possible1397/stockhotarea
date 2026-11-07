// =============================================================================
// server/fetcher.js - Data fetching module for TWSE and TPEx market data
// Handles all HTTP requests to Taiwan stock exchange APIs with throttling,
// retry logic, and data normalization
// =============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TWSE_DELAY_MS = 3000;   // TWSE blocks frequent requests
const TPEX_DELAY_MS = 1000;   // TPEx is more lenient
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Strip commas from a numeric string and parse to number.
 * Returns 0 if the value is not parseable.
 * Example: "1,234,567" → 1234567, "--" → 0
 */
function parseNum(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Format a Date or 'YYYY-MM-DD' string into 'YYYYMMDD' for TWSE API params.
 */
function toTWSEDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

/**
 * Format a 'YYYY-MM-DD' string into 'YYY/MM/DD' (ROC calendar) for TPEx API.
 * Example: '2026-06-07' → '115/06/07'
 */
function toROCDate(dateStr) {
  const [yyyy, mm, dd] = dateStr.split('-');
  const rocYear = parseInt(yyyy, 10) - 1911;
  return `${rocYear}/${mm}/${dd}`;
}

/**
 * Fetch a URL with retry logic and exponential backoff.
 * Returns the Response object on success.
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, text/csv, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    ...options.headers,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (err) {
      const isLast = attempt === retries;
      console.warn(
        `  [FETCH] Attempt ${attempt}/${retries} failed for ${url}: ${err.message}`
      );
      if (isLast) throw err;
      // Exponential backoff: 2s, 4s, 8s …
      const backoff = Math.pow(2, attempt) * 1000;
      console.log(`  [FETCH] Retrying in ${backoff / 1000}s …`);
      await sleep(backoff);
    }
  }
}

// =============================================================================
// TWSE (上市) Data Sources
// =============================================================================

/**
 * Fetch all listed-stock daily close data via TWSE STOCK_DAY_ALL (CSV OpenData).
 * Returns a Map<stockCode, { name, open, high, low, close, change, volume, tradeValue, transactions }>
 */
export async function fetchTWSEAllStocks() {
  console.log('  [TWSE] Fetching all-stock daily close (STOCK_DAY_ALL) …');

  const url = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data';
  const response = await fetchWithRetry(url);
  const csvText = await response.text();

  const stocks = new Map();
  const lines = csvText.split('\n');

  // First line is header: 證券代號,證券名稱,成交股數,成交金額,開盤價,最高價,最低價,收盤價,漲跌價差,成交筆數
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV fields may be quoted; use a simple split since the data rarely contains commas inside fields
    // The numeric fields use plain numbers in the open_data CSV (no commas)
    const cols = line.split(',');
    if (cols.length < 10) continue;

    const code = cols[0].replace(/"/g, '').trim();
    const name = cols[1].replace(/"/g, '').trim();

    // Skip non-stock entries (ETF codes that are too long, warrants, etc.)
    if (!code || code.length > 6) continue;

    stocks.set(code, {
      name,
      volume: parseNum(cols[2]),       // 成交股數
      tradeValue: parseNum(cols[3]),   // 成交金額
      open: parseNum(cols[4]),         // 開盤價
      high: parseNum(cols[5]),         // 最高價
      low: parseNum(cols[6]),          // 最低價
      close: parseNum(cols[7]),        // 收盤價
      change: parseNum(cols[8]),       // 漲跌價差
      transactions: parseNum(cols[9]), // 成交筆數
    });
  }

  console.log(`  [TWSE] Parsed ${stocks.size} listed stocks from CSV`);
  return stocks;
}

/**
 * Fetch institutional investor (三大法人) buy/sell data from TWSE T86.
 * Returns a Map<stockCode, { foreignNet, trustNet, dealerNet, totalNet, foreignBuy, foreignSell, trustBuy, trustSell }>
 */
export async function fetchTWSEInstitutional(dateStr) {
  const yyyymmdd = toTWSEDate(dateStr);
  console.log(`  [TWSE] Fetching institutional data (T86) for ${yyyymmdd} …`);

  const url = `https://www.twse.com.tw/fund/T86?response=json&date=${yyyymmdd}&selectType=ALLBUT0999`;
  const response = await fetchWithRetry(url);
  const json = await response.json();

  const result = new Map();

  // TWSE returns { stat: 'OK', data: [[...], ...], fields: [...] } on success
  if (json.stat !== 'OK') {
    console.warn(`  [TWSE] T86 stat = "${json.stat}" — likely no data for this date`);
    return result;
  }

  const data = json.data || [];
  for (const row of data) {
    // row fields (in order of the T86 response):
    // [0] 證券代號, [1] 證券名稱,
    // [2] 外陸資買進股數(不含外資自營商), [3] 外陸資賣出股數(不含外資自營商),
    // [4] 外陸資買賣超股數(不含外資自營商),
    // [5] 外資自營商買進股數, [6] 外資自營商賣出股數, [7] 外資自營商買賣超股數,
    // [8] 投信買進股數, [9] 投信賣出股數, [10] 投信買賣超股數,
    // [11] 自營商買進股數(自行買賣), [12] 自營商賣出股數(自行買賣), [13] 自營商買賣超股數(自行買賣),
    // [14] 自營商買進股數(避險), [15] 自營商賣出股數(避險), [16] 自營商買賣超股數(避險),
    // [17] 自營商買賣超股數, [18] 三大法人買賣超股數
    const code = String(row[0]).trim();
    if (!code) continue;

    result.set(code, {
      foreignBuy:  parseNum(row[2]),
      foreignSell: parseNum(row[3]),
      foreignNet:  parseNum(row[4]),
      trustBuy:    parseNum(row[8]),
      trustSell:   parseNum(row[9]),
      trustNet:    parseNum(row[10]),
      dealerNet:   parseNum(row[17]),
      totalNet:    parseNum(row[18]),
    });
  }

  console.log(`  [TWSE] Parsed institutional data for ${result.size} stocks`);
  return result;
}

/**
 * Fetch all-stock daily data from MI_INDEX endpoint.
 * This provides an alternative/supplemental source with more detail.
 * Returns a Map<stockCode, { name, volume, transactions, tradeValue, open, high, low, close, change, changeSign }>
 */
export async function fetchTWSEMIIndex(dateStr) {
  const yyyymmdd = toTWSEDate(dateStr);
  console.log(`  [TWSE] Fetching MI_INDEX data for ${yyyymmdd} …`);

  const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${yyyymmdd}&type=ALLBUT0999`;
  const response = await fetchWithRetry(url);
  const json = await response.json();

  const result = new Map();

  if (json.stat !== 'OK') {
    console.warn(`  [TWSE] MI_INDEX stat = "${json.stat}" — likely no data for this date`);
    return result;
  }

  // MI_INDEX returns multiple tables. The individual stock data is typically
  // in the last element of the tables array (tables[8] or the one with title containing "每日收盤行情")
  const tables = json.tables || [];
  let stockTable = null;

  for (const table of tables) {
    const title = table.title || '';
    if (title.includes('每日收盤行情')) {
      stockTable = table;
      break;
    }
  }

  // Fallback: use the last table if we can't find by title
  if (!stockTable && tables.length > 0) {
    stockTable = tables[tables.length - 1];
  }

  if (!stockTable || !stockTable.data) {
    console.warn('  [TWSE] MI_INDEX: could not locate stock data table');
    return result;
  }

  for (const row of stockTable.data) {
    // Fields: 證券代號, 證券名稱, 成交股數, 成交筆數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌(+/-), 漲跌價差
    const code = String(row[0]).trim();
    const name = String(row[1]).trim();
    if (!code || code.length > 6) continue;

    const changeSign = String(row[9]).trim();
    const changeValue = parseNum(row[10]);

    result.set(code, {
      name,
      volume:       parseNum(row[2]),
      transactions: parseNum(row[3]),
      tradeValue:   parseNum(row[4]),
      open:         parseNum(row[5]),
      high:         parseNum(row[6]),
      low:          parseNum(row[7]),
      close:        parseNum(row[8]),
      change:       changeSign.includes('-') ? -changeValue : changeValue,
    });
  }

  console.log(`  [TWSE] MI_INDEX parsed ${result.size} stocks`);
  return result;
}

// =============================================================================
// TPEx (上櫃) Data Sources
// =============================================================================

/**
 * Fetch OTC (上櫃) stock quotes from TPEx OpenAPI.
 * Returns a Map<stockCode, { name, open, high, low, close, change, volume, tradeValue, transactions }>
 */
export async function fetchTPExQuotes() {
  console.log('  [TPEx] Fetching OTC mainboard quotes …');

  const url = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';
  const response = await fetchWithRetry(url);
  const data = await response.json();

  const result = new Map();

  if (!Array.isArray(data)) {
    console.warn('  [TPEx] Unexpected response format for quotes');
    return result;
  }

  for (const item of data) {
    // OpenAPI field names (Chinese keys):
    // SecuritiesCompanyCode (證券代號), CompanyName (公司簡稱),
    // Close (收盤價), Open (開盤價), High (最高價), Low (最低價),
    // TradingShares (成交股數), TransactionAmount (成交金額),
    // Change (漲跌價差), Transaction (成交筆數)
    const code = String(item.SecuritiesCompanyCode || '').trim();
    if (!code || code.length > 6) continue;

    result.set(code, {
      name:         String(item.CompanyName || '').trim(),
      close:        parseNum(item.Close),
      open:         parseNum(item.Open),
      high:         parseNum(item.High),
      low:          parseNum(item.Low),
      change:       parseNum(item.Change),
      volume:       parseNum(item.TradingShares),
      tradeValue:   parseNum(item.TransactionAmount),
      transactions: parseNum(item.Transaction),
    });
  }

  console.log(`  [TPEx] Parsed ${result.size} OTC stocks`);
  return result;
}

/**
 * Fetch OTC (上櫃) institutional investor data from TPEx OpenAPI.
 * Returns a Map<stockCode, { foreignNet, trustNet, dealerNet, totalNet, foreignBuy, foreignSell, trustBuy, trustSell }>
 */
export async function fetchTPExInstitutional() {
  console.log('  [TPEx] Fetching OTC institutional data …');

  const url = 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading';
  const response = await fetchWithRetry(url);
  const data = await response.json();

  const result = new Map();

  if (!Array.isArray(data)) {
    console.warn('  [TPEx] Unexpected response format for institutional data');
    return result;
  }

  for (const item of data) {
    // Field names may vary; common keys from OpenAPI:
    // SecuritiesCompanyCode, ForeignInvestorsBuy, ForeignInvestorsSell, ForeignInvestorsNetBuySell,
    // InvestmentTrustBuy, InvestmentTrustSell, InvestmentTrustNetBuySell,
    // DealerNetBuySell, TotalNetBuySell
    const code = String(item.SecuritiesCompanyCode || '').trim();
    if (!code || code.length > 6) continue;

    result.set(code, {
      foreignBuy:  parseNum(item.ForeignInvestorsBuy),
      foreignSell: parseNum(item.ForeignInvestorsSell),
      foreignNet:  parseNum(item.ForeignInvestorsNetBuySell),
      trustBuy:    parseNum(item.InvestmentTrustBuy),
      trustSell:   parseNum(item.InvestmentTrustSell),
      trustNet:    parseNum(item.InvestmentTrustNetBuySell),
      dealerNet:   parseNum(item.DealerNetBuySell),
      totalNet:    parseNum(item.TotalNetBuySell),
    });
  }

  console.log(`  [TPEx] Parsed institutional data for ${result.size} OTC stocks`);
  return result;
}

// =============================================================================
// Main orchestrator
// =============================================================================

/**
 * Fetch all market data for a given date from both TWSE and TPEx.
 *
 * @param {string} dateStr - Date in 'YYYY-MM-DD' format
 * @returns {Object} - Stock data keyed by stock code, each value contains
 *   price data + institutional data merged together.
 */
export async function fetchDailyData(dateStr) {
  console.log(`\n[FETCHER] Starting daily data fetch for ${dateStr}`);
  const startTime = Date.now();

  const allStocks = {};

  // ---- Step 1: TWSE all-stock daily close (CSV) ----
  let twseStocks = new Map();
  try {
    twseStocks = await fetchTWSEAllStocks();
  } catch (err) {
    console.error(`  [FETCHER] TWSE STOCK_DAY_ALL failed: ${err.message}`);
  }

  // Merge TWSE price data
  for (const [code, data] of twseStocks) {
    allStocks[code] = { ...data, market: 'TWSE' };
  }

  // ---- Step 2: TWSE institutional data (T86) — throttle ----
  await sleep(TWSE_DELAY_MS);
  let twseInst = new Map();
  try {
    twseInst = await fetchTWSEInstitutional(dateStr);
  } catch (err) {
    console.error(`  [FETCHER] TWSE T86 failed: ${err.message}`);
  }

  // Merge institutional data
  for (const [code, inst] of twseInst) {
    if (allStocks[code]) {
      Object.assign(allStocks[code], inst);
    } else {
      allStocks[code] = { ...inst, market: 'TWSE' };
    }
  }

  // ---- Step 3: TWSE MI_INDEX (supplemental) — throttle ----
  await sleep(TWSE_DELAY_MS);
  let miData = new Map();
  try {
    miData = await fetchTWSEMIIndex(dateStr);
  } catch (err) {
    console.error(`  [FETCHER] TWSE MI_INDEX failed: ${err.message}`);
  }

  // MI_INDEX can fill in gaps or update data for stocks missing from CSV
  for (const [code, data] of miData) {
    if (!allStocks[code]) {
      allStocks[code] = { ...data, market: 'TWSE' };
    } else if (!allStocks[code].close && data.close) {
      // Fill in missing price data while preserving existing institutional data
      const existing = allStocks[code];
      allStocks[code] = { ...data, ...existing, close: data.close, open: data.open, high: data.high, low: data.low, volume: data.volume, tradeValue: data.tradeValue, change: data.change };
    }
  }

  // ---- Step 4: TPEx OTC quotes — throttle ----
  await sleep(TPEX_DELAY_MS);
  let otcQuotes = new Map();
  try {
    otcQuotes = await fetchTPExQuotes();
  } catch (err) {
    console.error(`  [FETCHER] TPEx quotes failed: ${err.message}`);
  }

  for (const [code, data] of otcQuotes) {
    if (!allStocks[code]) {
      allStocks[code] = { ...data, market: 'TPEx' };
    }
    // Don't overwrite TWSE data if stock exists in both (rare)
  }

  // ---- Step 5: TPEx institutional — throttle ----
  await sleep(TPEX_DELAY_MS);
  let otcInst = new Map();
  try {
    otcInst = await fetchTPExInstitutional();
  } catch (err) {
    console.error(`  [FETCHER] TPEx institutional failed: ${err.message}`);
  }

  for (const [code, inst] of otcInst) {
    if (allStocks[code]) {
      // Only merge institutional if not already populated from TWSE
      if (allStocks[code].foreignNet == null) {
        Object.assign(allStocks[code], inst);
      }
    } else {
      allStocks[code] = { ...inst, market: 'TPEx' };
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[FETCHER] Completed: ${Object.keys(allStocks).length} stocks fetched in ${elapsed}s\n`);

  return allStocks;
}
