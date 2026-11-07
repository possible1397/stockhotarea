// =============================================================================
// server/index.js - Express server entry point
// Serves API routes and schedules daily data fetches after market close
// =============================================================================

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { router } from './routes.js';
import { fetchDailyData } from './fetcher.js';
import { aggregateByTheme, saveDailyData, loadDailyData } from './aggregator.js';

// Resolve __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// Serve static files from data/ directory (for direct access to JSON files)
const dataDir = path.resolve(__dirname, '..', 'data');
app.use('/data', express.static(dataDir));

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api', router);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Scheduled daily data fetch
// Runs at 14:30 Taiwan time (UTC+8) every weekday (Mon-Fri)
// Taiwan market closes at 13:30, so 14:30 gives a 1-hour buffer for data availability
// node-cron uses system timezone by default; we specify Asia/Taipei explicitly
// ---------------------------------------------------------------------------
cron.schedule('30 14 * * 1-5', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  console.log(`\n[CRON] Scheduled daily fetch triggered for ${today}`);

  try {
    // Fetch raw stock data from TWSE and TPEx
    const rawData = await fetchDailyData(today);
    const stockCount = Object.keys(rawData).length;

    if (stockCount === 0) {
      console.log('[CRON] No data returned (holiday or weekend?). Skipping.');
      return;
    }

    console.log(`[CRON] Fetched data for ${stockCount} stocks`);

    // Load previous day's data for volume comparison
    let previousDayData = null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    try {
      const prevFile = await loadDailyData(yesterdayStr);
      if (prevFile) {
        previousDayData = prevFile.raw;
      }
    } catch {
      console.log('[CRON] No previous day data found for volume comparison');
    }

    // Aggregate by theme
    const themeData = aggregateByTheme(rawData, previousDayData);
    console.log(`[CRON] Aggregated ${themeData.length} themes`);

    // Save to disk
    await saveDailyData(today, rawData, themeData);
    console.log(`[CRON] Data saved for ${today}`);
  } catch (err) {
    console.error(`[CRON] Failed to fetch/process data:`, err.message);
  }
}, {
  timezone: 'Asia/Taipei'
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`  台股題材資金流向追蹤系統 - Backend Server`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`  API base: http://localhost:${PORT}/api`);
  console.log(`  Data directory: ${dataDir}`);
  console.log(`  Scheduled fetch: 14:30 (Asia/Taipei) on weekdays`);
  console.log('='.repeat(60));
});

export default app;
