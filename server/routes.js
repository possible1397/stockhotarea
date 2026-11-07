// =============================================================================
// server/routes.js - Express API Router
// Provides all REST endpoints for the frontend to consume theme data,
// rankings, heatmaps, stock details, and manual data fetch triggers
// =============================================================================

import { Router } from 'express';
import {
  loadThemes,
  aggregateByTheme,
  saveDailyData,
  loadDailyData,
  getAvailableDates,
  getLatestDate,
} from './aggregator.js';
import { fetchDailyData } from './fetcher.js';

export const router = Router();

// ---------------------------------------------------------------------------
// GET /api/themes — Return the full themes list from themes.json
// ---------------------------------------------------------------------------
router.get('/themes', async (_req, res) => {
  try {
    const themes = await loadThemes();
    // Return only metadata (no stocks array) for a lightweight listing
    const summary = themes.map(t => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      stockCount: t.stocks.length,
      stocks: t.stocks,
    }));
    res.json({ themes: summary });
  } catch (err) {
    console.error('[API] /themes error:', err.message);
    res.status(500).json({ error: 'Failed to load themes' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dates — List all available data dates
// ---------------------------------------------------------------------------
router.get('/dates', async (_req, res) => {
  try {
    const dates = await getAvailableDates();
    res.json({ dates, latest: dates[dates.length - 1] || null });
  } catch (err) {
    console.error('[API] /dates error:', err.message);
    res.status(500).json({ error: 'Failed to list dates' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/overview — Latest day's theme summary with rankings
// ---------------------------------------------------------------------------
router.get('/overview', async (_req, res) => {
  try {
    const latestDate = await getLatestDate();
    if (!latestDate) {
      return res.status(404).json({ error: 'No data available yet. Run a fetch first.' });
    }

    const dailyData = await loadDailyData(latestDate);
    if (!dailyData || !dailyData.themes) {
      return res.status(404).json({ error: 'Data file is empty or corrupted' });
    }

    const themes = dailyData.themes;

    // Build rankings
    const byChange = [...themes].sort((a, b) => b.avgChangePercent - a.avgChangePercent);
    const byVolume = [...themes].sort((a, b) => b.totalTradeValue - a.totalTradeValue);
    const byInstitutional = [...themes].sort(
      (a, b) => b.institutional.totalNet - a.institutional.totalNet
    );

    res.json({
      date: latestDate,
      fetchedAt: dailyData.fetchedAt,
      themes,
      rankings: {
        byChange: byChange.map(t => t.id),
        byVolume: byVolume.map(t => t.id),
        byInstitutional: byInstitutional.map(t => t.id),
      },
    });
  } catch (err) {
    console.error('[API] /overview error:', err.message);
    res.status(500).json({ error: 'Failed to load overview data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/daily/:date — Theme data for a specific date
// ---------------------------------------------------------------------------
router.get('/daily/:date', async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const data = await loadDailyData(date);
    if (!data) {
      return res.status(404).json({ error: `No data available for ${date}` });
    }

    // Return themes without raw stock data to keep response lightweight
    res.json({
      date: data.date,
      fetchedAt: data.fetchedAt,
      stockCount: data.stockCount,
      themeCount: data.themeCount,
      themes: data.themes,
    });
  } catch (err) {
    console.error(`[API] /daily/${req.params.date} error:`, err.message);
    res.status(500).json({ error: 'Failed to load daily data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/trend/:themeId — Historical trend data for a single theme
// Query params: ?days=30 (default 30)
// ---------------------------------------------------------------------------
router.get('/trend/:themeId', async (req, res) => {
  try {
    const { themeId } = req.params;
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    const allDates = await getAvailableDates();
    // Take the most recent N dates
    const targetDates = allDates.slice(-days);

    const trend = [];

    for (const date of targetDates) {
      const data = await loadDailyData(date);
      if (!data || !data.themes) continue;

      const theme = data.themes.find(t => t.id === themeId);
      if (!theme) continue;

      trend.push({
        date,
        avgChangePercent: theme.avgChangePercent,
        totalVolume: theme.totalVolume,
        totalTradeValue: theme.totalTradeValue,
        volumeChangePercent: theme.volumeChangePercent,
        foreignNet: theme.institutional.foreignNet,
        trustNet: theme.institutional.trustNet,
        dealerNet: theme.institutional.dealerNet,
        totalNet: theme.institutional.totalNet,
      });
    }

    if (trend.length === 0) {
      return res.status(404).json({ error: `No trend data found for theme "${themeId}"` });
    }

    res.json({
      themeId,
      days: trend.length,
      trend,
    });
  } catch (err) {
    console.error(`[API] /trend/${req.params.themeId} error:`, err.message);
    res.status(500).json({ error: 'Failed to load trend data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ranking/:date — Ranked themes by various metrics
// ---------------------------------------------------------------------------
router.get('/ranking/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const data = await loadDailyData(date);
    if (!data || !data.themes) {
      return res.status(404).json({ error: `No data available for ${date}` });
    }

    const themes = data.themes;

    // Multiple ranking dimensions
    const rankings = {
      // Top gainers (highest avg change%)
      topGainers: [...themes]
        .sort((a, b) => b.avgChangePercent - a.avgChangePercent)
        .map(t => ({
          id: t.id, name: t.name, icon: t.icon, color: t.color,
          value: t.avgChangePercent, unit: '%',
        })),

      // Top losers (lowest avg change%)
      topLosers: [...themes]
        .sort((a, b) => a.avgChangePercent - b.avgChangePercent)
        .map(t => ({
          id: t.id, name: t.name, icon: t.icon, color: t.color,
          value: t.avgChangePercent, unit: '%',
        })),

      // Highest trade value
      byTradeValue: [...themes]
        .sort((a, b) => b.totalTradeValue - a.totalTradeValue)
        .map(t => ({
          id: t.id, name: t.name, icon: t.icon, color: t.color,
          value: t.totalTradeValue, unit: 'TWD',
        })),

      // Foreign investor net buy
      byForeignNet: [...themes]
        .sort((a, b) => b.institutional.foreignNet - a.institutional.foreignNet)
        .map(t => ({
          id: t.id, name: t.name, icon: t.icon, color: t.color,
          value: t.institutional.foreignNet, unit: 'shares',
        })),

      // Investment trust net buy
      byTrustNet: [...themes]
        .sort((a, b) => b.institutional.trustNet - a.institutional.trustNet)
        .map(t => ({
          id: t.id, name: t.name, icon: t.icon, color: t.color,
          value: t.institutional.trustNet, unit: 'shares',
        })),

      // Total institutional net buy
      byTotalNet: [...themes]
        .sort((a, b) => b.institutional.totalNet - a.institutional.totalNet)
        .map(t => ({
          id: t.id, name: t.name, icon: t.icon, color: t.color,
          value: t.institutional.totalNet, unit: 'shares',
        })),

      // Volume change % vs previous day
      byVolumeChange: [...themes]
        .sort((a, b) => b.volumeChangePercent - a.volumeChangePercent)
        .map(t => ({
          id: t.id, name: t.name, icon: t.icon, color: t.color,
          value: t.volumeChangePercent, unit: '%',
        })),
    };

    res.json({ date, rankings });
  } catch (err) {
    console.error(`[API] /ranking/${req.params.date} error:`, err.message);
    res.status(500).json({ error: 'Failed to load ranking data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/heatmap/:date — Treemap data formatted for ECharts
// ---------------------------------------------------------------------------
router.get('/heatmap/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const data = await loadDailyData(date);
    if (!data || !data.themes) {
      return res.status(404).json({ error: `No data available for ${date}` });
    }

    // Build ECharts treemap format
    // Each theme is a parent node, each stock is a child
    const treemapData = data.themes.map(theme => ({
      name: `${theme.icon} ${theme.name}`,
      id: theme.id,
      value: theme.totalTradeValue, // Size by trade value
      avgChangePercent: theme.avgChangePercent,
      color: theme.color,
      children: theme.stocks.map(stock => ({
        name: stock.name,
        code: stock.code,
        value: stock.tradeValue || 1, // Avoid zero-sized nodes
        changePercent: stock.changePercent,
        // Color encoding: green for positive, red for negative (Taiwan convention is opposite!)
        // Positive = red (漲), Negative = green (跌) in Taiwan
        colorValue: stock.changePercent,
      })),
    }));

    res.json({
      date,
      treemap: treemapData,
    });
  } catch (err) {
    console.error(`[API] /heatmap/${req.params.date} error:`, err.message);
    res.status(500).json({ error: 'Failed to load heatmap data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stocks/:themeId/:date — Individual stocks within a theme
// ---------------------------------------------------------------------------
router.get('/stocks/:themeId/:date', async (req, res) => {
  try {
    const { themeId, date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const data = await loadDailyData(date);
    if (!data || !data.themes) {
      return res.status(404).json({ error: `No data available for ${date}` });
    }

    const theme = data.themes.find(t => t.id === themeId);
    if (!theme) {
      return res.status(404).json({ error: `Theme "${themeId}" not found in data for ${date}` });
    }

    // Sort stocks by change% descending
    const sortedStocks = [...theme.stocks].sort(
      (a, b) => b.changePercent - a.changePercent
    );

    res.json({
      date,
      themeId: theme.id,
      themeName: theme.name,
      avgChangePercent: theme.avgChangePercent,
      institutional: theme.institutional,
      stocks: sortedStocks,
    });
  } catch (err) {
    console.error(`[API] /stocks/${req.params.themeId}/${req.params.date} error:`, err.message);
    res.status(500).json({ error: 'Failed to load stock data' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/fetch/:date — Trigger manual data fetch for a specific date
// ---------------------------------------------------------------------------
router.post('/fetch/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // Check if the date is in the future
    const targetDate = new Date(date + 'T00:00:00+08:00');
    const now = new Date();
    if (targetDate > now) {
      return res.status(400).json({ error: 'Cannot fetch data for a future date' });
    }

    console.log(`[API] Manual fetch triggered for ${date}`);

    // Start fetching (this will take a while due to throttling)
    res.json({ status: 'started', date, message: 'Data fetch started. This may take 15-30 seconds.' });

    // Perform fetch in background (response already sent)
    try {
      // Load themes first (needed by aggregator)
      await loadThemes();

      // Fetch raw data
      const rawData = await fetchDailyData(date);
      const stockCount = Object.keys(rawData).length;

      if (stockCount === 0) {
        console.log(`[API] No data returned for ${date} (holiday or weekend?)`);
        return;
      }

      // Load previous day data for volume comparison
      let previousDayData = null;
      const prevDate = new Date(targetDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().slice(0, 10);
      try {
        const prevFile = await loadDailyData(prevDateStr);
        if (prevFile) previousDayData = prevFile.raw;
      } catch {
        // No previous day data available
      }

      // Aggregate and save
      const themeData = aggregateByTheme(rawData, previousDayData);
      await saveDailyData(date, rawData, themeData);
      console.log(`[API] Fetch complete for ${date}: ${stockCount} stocks, ${themeData.length} themes`);
    } catch (fetchErr) {
      console.error(`[API] Background fetch failed for ${date}:`, fetchErr.message);
    }
  } catch (err) {
    console.error(`[API] /fetch/${req.params.date} error:`, err.message);
    // Only send error if response not yet sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to initiate data fetch' });
    }
  }
});
