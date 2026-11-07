// =============================================================================
// server/aggregator.js - Theme aggregation and data persistence
// Groups raw stock data by theme, computes aggregate metrics, and handles
// reading/writing daily JSON files to disk
// =============================================================================

import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve paths relative to this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DAILY_DIR = path.resolve(DATA_DIR, 'daily');
const THEMES_FILE = path.resolve(DATA_DIR, 'themes.json');

// ---------------------------------------------------------------------------
// Load themes definition
// ---------------------------------------------------------------------------
let themesCache = null;

/**
 * Load and cache the themes configuration from data/themes.json.
 * @returns {Array} Array of theme objects
 */
export async function loadThemes() {
  if (themesCache) return themesCache;

  const raw = await fs.readFile(THEMES_FILE, 'utf-8');
  const parsed = JSON.parse(raw);
  themesCache = parsed.themes || [];
  return themesCache;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate raw stock data by theme definitions.
 *
 * @param {Object} rawStockData - Stock data keyed by stock code
 *   Each value has: { close, change, volume, tradeValue, foreignNet, trustNet, dealerNet, totalNet, ... }
 * @param {Object|null} previousDayData - Previous day's raw stock data (for volume comparison)
 * @returns {Array} Array of theme aggregation objects
 */
export function aggregateByTheme(rawStockData, previousDayData) {
  if (!themesCache) {
    // Synchronously read themes if not yet cached (fallback)
    try {
      const raw = readFileSync(THEMES_FILE, 'utf-8');
      themesCache = JSON.parse(raw).themes || [];
    } catch {
      console.error('[AGGREGATOR] Cannot load themes.json');
      return [];
    }
  }

  const themes = themesCache;
  const results = [];

  for (const theme of themes) {
    const stockResults = [];
    let totalChangePercent = 0;
    let validPriceCount = 0;
    let totalVolume = 0;
    let totalTradeValue = 0;
    let prevTotalVolume = 0;

    // Institutional totals
    let foreignBuyTotal = 0;
    let foreignSellTotal = 0;
    let foreignNetTotal = 0;
    let trustBuyTotal = 0;
    let trustSellTotal = 0;
    let trustNetTotal = 0;
    let dealerNetTotal = 0;
    let totalNetTotal = 0;

    for (const { code, name } of theme.stocks) {
      const stock = rawStockData[code];
      if (!stock) continue;

      // Calculate change percentage
      const close = stock.close || 0;
      const change = stock.change || 0;
      let changePercent = 0;

      if (close !== 0 && change !== 0) {
        // change% = change / (close - change) * 100
        const prevClose = close - change;
        if (prevClose !== 0) {
          changePercent = (change / prevClose) * 100;
        }
      }

      if (close > 0) {
        totalChangePercent += changePercent;
        validPriceCount++;
      }

      totalVolume += stock.volume || 0;
      totalTradeValue += stock.tradeValue || 0;

      // Institutional
      foreignBuyTotal  += stock.foreignBuy  || 0;
      foreignSellTotal += stock.foreignSell || 0;
      foreignNetTotal  += stock.foreignNet  || 0;
      trustBuyTotal    += stock.trustBuy    || 0;
      trustSellTotal   += stock.trustSell   || 0;
      trustNetTotal    += stock.trustNet    || 0;
      dealerNetTotal   += stock.dealerNet   || 0;
      totalNetTotal    += stock.totalNet    || 0;

      // Previous day volume for comparison
      if (previousDayData && previousDayData[code]) {
        prevTotalVolume += previousDayData[code].volume || 0;
      }

      stockResults.push({
        code,
        name: stock.name || name,
        close,
        change,
        changePercent: round2(changePercent),
        volume: stock.volume || 0,
        tradeValue: stock.tradeValue || 0,
        foreignNet: stock.foreignNet || 0,
        trustNet: stock.trustNet || 0,
        dealerNet: stock.dealerNet || 0,
        totalNet: stock.totalNet || 0,
      });
    }

    // Average change percent across stocks with valid prices
    const avgChangePercent = validPriceCount > 0
      ? round2(totalChangePercent / validPriceCount)
      : 0;

    // Volume change percentage vs previous day
    let volumeChangePercent = 0;
    if (prevTotalVolume > 0) {
      volumeChangePercent = round2(((totalVolume - prevTotalVolume) / prevTotalVolume) * 100);
    }

    results.push({
      id: theme.id,
      name: theme.name,
      icon: theme.icon,
      color: theme.color,
      stockCount: theme.stocks.length,
      matchedStocks: stockResults.length,

      // Price metrics
      avgChangePercent,

      // Volume metrics
      totalVolume,
      totalTradeValue,
      volumeChangePercent,

      // Institutional flow
      institutional: {
        foreignBuy: foreignBuyTotal,
        foreignSell: foreignSellTotal,
        foreignNet: foreignNetTotal,
        trustBuy: trustBuyTotal,
        trustSell: trustSellTotal,
        trustNet: trustNetTotal,
        dealerNet: dealerNetTotal,
        totalNet: totalNetTotal,
      },

      // Individual stock breakdown
      stocks: stockResults,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Data persistence
// ---------------------------------------------------------------------------

/**
 * Ensure the daily data directory exists.
 */
async function ensureDailyDir() {
  await fs.mkdir(DAILY_DIR, { recursive: true });
}

/**
 * Save daily data (raw + aggregated themes) to a JSON file.
 *
 * @param {string} dateStr - Date in 'YYYY-MM-DD' format
 * @param {Object} rawData - Raw stock data keyed by stock code
 * @param {Array} themeData - Aggregated theme data
 */
export async function saveDailyData(dateStr, rawData, themeData) {
  await ensureDailyDir();

  const filePath = path.join(DAILY_DIR, `${dateStr}.json`);
  const payload = {
    date: dateStr,
    fetchedAt: new Date().toISOString(),
    stockCount: Object.keys(rawData).length,
    themeCount: themeData.length,
    themes: themeData,
    raw: rawData,
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[AGGREGATOR] Saved daily data to ${filePath}`);
}

/**
 * Load daily data from a JSON file.
 *
 * @param {string} dateStr - Date in 'YYYY-MM-DD' format
 * @returns {Object|null} Parsed daily data or null if not found
 */
export async function loadDailyData(dateStr) {
  const filePath = path.join(DAILY_DIR, `${dateStr}.json`);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * List all available dates from the data/daily/ directory.
 * Returns sorted array of date strings (ascending).
 *
 * @returns {string[]} Array of 'YYYY-MM-DD' strings
 */
export async function getAvailableDates() {
  await ensureDailyDir();

  const files = await fs.readdir(DAILY_DIR);
  const dates = files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  return dates;
}

/**
 * Get the most recent available date.
 *
 * @returns {string|null} Most recent 'YYYY-MM-DD' or null if no data
 */
export async function getLatestDate() {
  const dates = await getAvailableDates();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Round a number to 2 decimal places.
 */
function round2(num) {
  return Math.round(num * 100) / 100;
}
