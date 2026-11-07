#!/usr/bin/env node
// =============================================================================
// server/fetch-cli.js - CLI tool for manually fetching daily stock data
// Usage:
//   node server/fetch-cli.js              — fetches today's data
//   node server/fetch-cli.js 2026-06-06   — fetches data for a specific date
// =============================================================================

import { fetchDailyData } from './fetcher.js';
import {
  loadThemes,
  aggregateByTheme,
  saveDailyData,
  loadDailyData,
} from './aggregator.js';

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
台股題材資金流向追蹤系統 - Data Fetch CLI
==========================================

Usage:
  node server/fetch-cli.js                 Fetch today's market data
  node server/fetch-cli.js YYYY-MM-DD      Fetch data for a specific date
  node server/fetch-cli.js --help          Show this help message

Examples:
  node server/fetch-cli.js
  node server/fetch-cli.js 2026-06-06
  node server/fetch-cli.js 2026-01-15

Notes:
  - TWSE data is typically available ~30 min after market close (13:30 TST)
  - Weekends and holidays will return no data
  - Data is saved to data/daily/YYYY-MM-DD.json
`);
  process.exit(0);
}

// Determine target date
let targetDate;

if (args[0]) {
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
    console.error('❌ Invalid date format. Please use YYYY-MM-DD.');
    console.error('   Example: node server/fetch-cli.js 2026-06-06');
    process.exit(1);
  }
  targetDate = args[0];
} else {
  // Default to today in Taiwan timezone
  targetDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

// Check for future date
const targetDateObj = new Date(targetDate + 'T00:00:00+08:00');
const now = new Date();
if (targetDateObj > now) {
  console.error(`❌ Cannot fetch data for a future date: ${targetDate}`);
  process.exit(1);
}

// Check if it's a weekend
const dayOfWeek = targetDateObj.getDay();
if (dayOfWeek === 0 || dayOfWeek === 6) {
  console.warn(`⚠️  ${targetDate} is a weekend (${dayOfWeek === 0 ? 'Sunday' : 'Saturday'}). Market data is unlikely to be available.`);
  console.warn('   Continuing anyway in case of special trading days...\n');
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(60));
  console.log('  台股題材資金流向追蹤系統 - Daily Data Fetch');
  console.log('='.repeat(60));
  console.log(`  Target date: ${targetDate}`);
  console.log(`  Started at:  ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
  console.log('='.repeat(60));
  console.log('');

  // Step 1: Load themes
  console.log('📋 Loading theme definitions...');
  const themes = await loadThemes();
  console.log(`   Loaded ${themes.length} themes\n`);

  // Step 2: Fetch raw stock data
  console.log('📡 Fetching market data from TWSE & TPEx...');
  console.log('   (This will take ~15 seconds due to API throttling)\n');

  const rawData = await fetchDailyData(targetDate);
  const stockCount = Object.keys(rawData).length;

  if (stockCount === 0) {
    console.log('\n⚠️  No stock data returned.');
    console.log('   Possible reasons:');
    console.log('   - Market is closed (weekend/holiday)');
    console.log('   - Data not yet available (try after 14:00 TST)');
    console.log('   - Network or API issues');
    process.exit(0);
  }

  console.log(`✅ Fetched data for ${stockCount} stocks\n`);

  // Step 3: Load previous day data for volume comparison
  console.log('📊 Loading previous day data for comparison...');
  let previousDayData = null;

  // Try to find the most recent previous day with data
  for (let i = 1; i <= 7; i++) {
    const prevDate = new Date(targetDateObj);
    prevDate.setDate(prevDate.getDate() - i);
    const prevDateStr = prevDate.toISOString().slice(0, 10);

    try {
      const prevFile = await loadDailyData(prevDateStr);
      if (prevFile && prevFile.raw) {
        previousDayData = prevFile.raw;
        console.log(`   Found previous data: ${prevDateStr}\n`);
        break;
      }
    } catch {
      // Keep trying earlier dates
    }
  }

  if (!previousDayData) {
    console.log('   No previous day data found (volume change will be 0%)\n');
  }

  // Step 4: Aggregate by theme
  console.log('🔄 Aggregating data by theme...');
  const themeData = aggregateByTheme(rawData, previousDayData);
  console.log(`   Aggregated ${themeData.length} themes\n`);

  // Step 5: Save to disk
  console.log('💾 Saving daily data...');
  await saveDailyData(targetDate, rawData, themeData);
  console.log('');

  // Step 6: Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('='.repeat(60));
  console.log('  📊 THEME SUMMARY');
  console.log('='.repeat(60));
  console.log('');

  // Print a compact table of theme results
  console.log(
    padRight('Theme', 20) +
    padRight('Change%', 10) +
    padRight('Volume(M)', 12) +
    padRight('Foreign', 14) +
    padRight('Trust', 14) +
    'Total Net'
  );
  console.log('-'.repeat(84));

  // Sort by change % descending
  const sorted = [...themeData].sort((a, b) => b.avgChangePercent - a.avgChangePercent);

  for (const theme of sorted) {
    const changeStr = formatPercent(theme.avgChangePercent);
    const volumeStr = formatMillions(theme.totalVolume);
    const foreignStr = formatThousands(theme.institutional.foreignNet);
    const trustStr = formatThousands(theme.institutional.trustNet);
    const totalStr = formatThousands(theme.institutional.totalNet);

    console.log(
      padRight(`${theme.icon} ${theme.name}`, 20) +
      padRight(changeStr, 10) +
      padRight(volumeStr, 12) +
      padRight(foreignStr, 14) +
      padRight(trustStr, 14) +
      totalStr
    );
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`  ✅ Done in ${elapsed}s — ${stockCount} stocks, ${themeData.length} themes`);
  console.log(`  📁 Saved to data/daily/${targetDate}.json`);
  console.log('='.repeat(60));
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function padRight(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function formatPercent(num) {
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

function formatMillions(num) {
  // Convert shares to millions
  return (num / 1_000_000).toFixed(1) + 'M';
}

function formatThousands(num) {
  // Convert shares to thousands with sign
  const sign = num > 0 ? '+' : '';
  return `${sign}${(num / 1_000).toFixed(0)}K`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
