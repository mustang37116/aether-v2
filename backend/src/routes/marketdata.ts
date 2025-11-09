import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Simple in-memory cache for symbol resolutions during process lifetime
const symbolCache = new Map<string, string>();

async function resolveYahooSymbol(input: string): Promise<string> {
  const raw = (input || '').trim();
  if (!raw) return raw;
  // If user already provided a provider-specific suffix, use as-is
  if (/[=\-\.]/.test(raw)) return raw;
  const key = raw.toUpperCase();
  const cached = symbolCache.get(key);
  if (cached) return cached;
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(raw)}&quotesCount=6&newsCount=0`;
    const r = await fetch(url);
    if (!r.ok) return raw;
    const data = await r.json();
    const quotes: any[] = data?.quotes || [];
    if (!quotes.length) return raw;
    const U = (s: string) => (s || '').toUpperCase();
    const exact = quotes.find(q => U(q.symbol) === U(raw));
    const fut = quotes.find(q => U(q.symbol).startsWith(U(raw)) && q.quoteType === 'FUTURE');
    const eq = quotes.find(q => U(q.symbol) === U(raw) && q.quoteType === 'EQUITY') || quotes.find(q => U(q.symbol).startsWith(U(raw)) && q.quoteType === 'EQUITY');
    const crypto = quotes.find(q => U(q.symbol).startsWith(U(raw)) && q.quoteType === 'CRYPTOCURRENCY');
    const fx = quotes.find(q => U(q.symbol).startsWith(U(raw)) && (q.quoteType === 'CURRENCY' || q.quoteType === 'FX')); // EURUSD=X
    const pick = exact || fut || eq || crypto || fx || quotes[0];
    const resolved = pick?.symbol || raw;
    symbolCache.set(key, resolved);
    return resolved;
  } catch {
    return raw;
  }
}

// GET /marketdata/candles?symbol=AAPL&interval=1d&start=2024-01-01&end=2024-03-01
router.get('/candles', async (req: AuthRequest, res) => {
  try {
    const { symbol: inputSymbol, interval = '1d', start, end } = (req as any).query as { symbol: string; interval?: string; start?: string; end?: string };
    if (!inputSymbol) return res.status(400).json({ error: 'symbol required' });
    // Resolve user-friendly ticker to Yahoo Finance canonical symbol (e.g., MES -> MES=F)
    const symbol = await resolveYahooSymbol(inputSymbol);
    // Yahoo Finance chart API
    // Convert start/end to unix seconds if provided
    const period1 = start ? Math.floor(new Date(start).getTime() / 1000) : Math.floor(Date.now()/1000) - 60*60*24*120;
    const period2 = end ? Math.floor(new Date(end).getTime() / 1000) : Math.floor(Date.now()/1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&period1=${period1}&period2=${period2}`;
  let r = await fetch(url);
  if (!r.ok) {
      // If initial try failed and we changed the symbol, try a second time with a basic futures suffix if not already present
      if (!/[=\-\.]/.test(String(inputSymbol)) && !String(symbol).endsWith('=F')) {
        const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(String(inputSymbol) + '=F')}?interval=${encodeURIComponent(interval)}&period1=${period1}&period2=${period2}`;
        r = await fetch(fallbackUrl);
      }
  }
  if (!r.ok) return res.status(502).json({ error: 'upstream error', status: r.status, statusText: (r as any).statusText || undefined });
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp || [];
    const o = result?.indicators?.quote?.[0]?.open || [];
    const h = result?.indicators?.quote?.[0]?.high || [];
    const l = result?.indicators?.quote?.[0]?.low || [];
    const c = result?.indicators?.quote?.[0]?.close || [];
    const candles = timestamps.map((t: number, i: number) => ({ time: t, open: o[i], high: h[i], low: l[i], close: c[i] })).filter((x: any)=> Number.isFinite(x.open));
    res.json({ symbol, interval, candles });
  } catch (e: any) {
    res.status(500).json({ error: 'failed to fetch candles', detail: e?.message });
  }
});

// Symbol search proxy to power autocomplete (optional frontend usage)
router.get('/search', async (req: AuthRequest, res) => {
  try {
    const q = String((req.query as any).q || '').trim();
    if (!q) return res.json({ quotes: [] });
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'upstream error', status: r.status, statusText: (r as any).statusText || undefined });
    const data = await r.json();
    const quotes = (data?.quotes || []).map((x: any) => ({ symbol: x.symbol, shortname: x.shortname, longname: x.longname, quoteType: x.quoteType, exchDisp: x.exchDisp }));
    res.json({ quotes });
  } catch (e: any) {
    res.status(500).json({ error: 'failed to search symbols', detail: e?.message });
  }
});

export default router;
