import { useEffect, useRef, useState } from 'react';
import { createChart, Time, LineStyle } from 'lightweight-charts';
import dayjs from 'dayjs';
import { useApi } from '../hooks/useApi';

interface Props { trade: any; height?: number; }

export default function TradeChart({ trade, height=300 }: Props){
  const containerRef = useRef<HTMLDivElement|null>(null);
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [interval, setInterval] = useState<'5m'|'15m'|'1h'|'1d'>(()=> '1d');
  const [windowDays, setWindowDays] = useState<number>(()=> 30);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Defer initial load until settings have been fetched to avoid flicker from defaults
  useEffect(()=>{ if (settingsLoaded) load(); }, [trade?.symbol, trade?.entryTime, trade?.exitTime, interval, windowDays, settingsLoaded]);

  // Keep window reasonable for intraday to reduce upstream errors
  useEffect(()=>{
    if (!settingsLoaded) return; // wait until settings applied
    if (interval === '5m' && windowDays > 5) setWindowDays(5);
    else if (interval !== '1d' && windowDays > 30) setWindowDays(15);
  }, [interval, windowDays, settingsLoaded]);

  // Initialize from user settings if available
  useEffect(()=>{
    (async () => {
      try {
        const r = await api.get('/settings');
        const s = r.data?.settings || {};
        if (s.defaultChartInterval) setInterval(s.defaultChartInterval);
        if (s.defaultChartWindowDays) setWindowDays(s.defaultChartWindowDays);
      } catch {
        // swallow; fall back to defaults
      } finally {
        setSettingsLoaded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(){
    if (!trade?.symbol) return;
    const derived = deriveFromFills(trade);
    setLoading(true); setError(null);
    try {
  // Fetch a window around the trade time(s) (fills-aware)
  const before = windowDays;
  const after = windowDays;
  const baseEntry = derived.firstEntryTime || trade.entryTime;
  const baseExit = derived.lastExitTime || trade.exitTime || baseEntry;
  const start = dayjs(baseEntry).subtract(before,'day').format('YYYY-MM-DD');
  const end = dayjs(baseExit).add(after,'day').format('YYYY-MM-DD');
  const r = await api.get('/marketdata/candles', { params: { symbol: trade.symbol, start, end, interval } });
  const raw = (r.data?.candles || []).map((c:any)=> ({ time: Number(c.time) as Time, open: c.open, high: c.high, low: c.low, close: c.close }));
  // Ensure candles strictly ascending by time and dedupe equal timestamps
  const candles = sortCandles(raw);
      if (!candles.length) {
        setError(`No price data for ${trade.symbol} in selected window (${start} → ${end}).`);
      } else {
        draw(candles, derived);
      }
    } catch(e:any){
      const resp = e?.response;
      const upstream = resp?.data?.error || resp?.data?.detail;
      const status = resp?.status || resp?.data?.status;
      const statusText = resp?.data?.statusText || resp?.statusText;
      const detail = upstream || e.message || 'Unknown error';
      const extras = status ? ` (HTTP ${status}${statusText ? ' ' + statusText : ''})` : '';
      setError(`Failed to load chart: ${detail}${extras}`);
    }
    finally { setLoading(false); }
  }

  function resolvedCssVar(name: string, fallback: string){
    try {
      const root = containerRef.current ?? document.documentElement;
      const v = getComputedStyle(root).getPropertyValue(name).trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  function draw(candles: any[], derived: ReturnType<typeof deriveFromFills>){
    if (!containerRef.current) return;
    containerRef.current.innerHTML='';
    const textColor = resolvedCssVar('--text', '#e5e7eb');
    const chart = createChart(containerRef.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor },
      grid: { vertLines: { color:'rgba(255,255,255,0.06)' }, horzLines: { color:'rgba(255,255,255,0.06)' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)' }
    });
    const series = chart.addCandlestickSeries({
      upColor: '#20c997', downColor: '#ef4444', borderVisible: false, wickUpColor:'#20c997', wickDownColor:'#ef4444'
    });
    series.setData(candles);

    // Removed bubble markers per user request; using only horizontal price lines now.

    // Execution markers from fills
    if (derived.fills.length){
      const markers = [] as any[];
      for (const f of derived.fills){
        const ts = toMarkerTime(f.time);
        const dir = trade.direction === 'SHORT' ? 'SHORT' : 'LONG';
        const isEntry = f.type === 'ENTRY';
        // Color logic: Long entry green, long exit yellow; Short entry red, short exit yellow
        let color = '#20c997';
        if (dir === 'SHORT' && isEntry) color = '#ef4444';
        if (!isEntry) color = '#ffd166';
        // Position logic: entry below bar for LONG, above bar for SHORT; exits inverse
        const position = isEntry ? (dir === 'SHORT' ? 'aboveBar' : 'belowBar') : (dir === 'SHORT' ? 'belowBar' : 'aboveBar');
        const shape = isEntry ? (dir === 'SHORT' ? 'arrowDown' : 'arrowUp') : (dir === 'SHORT' ? 'arrowUp' : 'arrowDown');
        const qty = Number(f.size);
        markers.push({ time: ts as Time, position, color, shape, text: `${isEntry?'E':'X'} ${qty} @ ${Number(f.price).toFixed(2)}` });
      }
      series.setMarkers(markers);
    }

    // Price lines for avg Entry / SL / TP (fills-aware) and avg Exit
    const entry = derived.avgEntry != null ? Number(derived.avgEntry) : Number(trade.entryPrice);
    const avgExit = derived.avgExit != null ? Number(derived.avgExit) : Number(trade.exitPrice);
    const stop = trade.stopPrice != null ? Number(trade.stopPrice) : undefined;
    const target = trade.targetPrice != null ? Number(trade.targetPrice) : undefined;
    if (Number.isFinite(entry)) {
      series.createPriceLine({ price: entry, color: '#5ac8fa', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'Entry' });
    }
    if (Number.isFinite(stop as any)) {
      series.createPriceLine({ price: stop as number, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'SL' });
    }
    if (Number.isFinite(target as any)) {
      series.createPriceLine({ price: target as number, color: '#20c997', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'TP' });
    }
    if (Number.isFinite(avgExit)) {
      series.createPriceLine({ price: avgExit, color: '#ffd166', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Exit' });
    }

    // Focus/zoom: center around entry->exit with padding
  const entryTs = toMarkerTime(derived.firstEntryTime || trade.entryTime);
  const exitTs = toMarkerTime(derived.lastExitTime || trade.exitTime || derived.firstEntryTime || trade.entryTime);
    const isDaily = interval === '1d';
    let padSecs: number;
    switch(interval){
      case '5m': padSecs = 60*60*3; break;        // 3 hours each side
      case '15m': padSecs = 60*60*6; break;       // 6 hours each side
      case '1h': padSecs = 60*60*24; break;       // 1 day each side
      default: padSecs = 86400*3;                 // 3 days each side
    }
    const fromNum = Math.max(Number(candles[0].time), Math.min(entryTs, exitTs) - padSecs);
    const toNum = Math.min(Number(candles[candles.length-1].time), Math.max(entryTs, exitTs) + padSecs);
    chart.timeScale().setVisibleRange({ from: fromNum as Time, to: toNum as Time });
  }

  return (
    <div style={{display:'grid', gap:8}}>
      <div style={{display:'flex', gap:8, alignItems:'center', fontSize:12}}>
        <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <span style={{opacity:.8}}>Interval</span>
          <select disabled={!settingsLoaded} value={interval} onChange={e=> setInterval(e.target.value as any)}>
            <option value='1d'>1D</option>
            <option value='1h'>1H</option>
            <option value='15m'>15M</option>
            <option value='5m'>5M</option>
          </select>
        </label>
        <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <span style={{opacity:.8}}>Window</span>
          <select disabled={!settingsLoaded} value={String(windowDays)} onChange={e=> setWindowDays(Number(e.target.value))}>
            <option value='1'>1d</option>
            <option value='5'>5d</option>
            <option value='15'>15d</option>
            <option value='30'>30d</option>
            <option value='90'>90d</option>
          </select>
        </label>
      </div>
      <div ref={containerRef} className='trade-chart-container' style={{width:'100%', height}} />
      {loading && <div style={{fontSize:12, opacity:.7}}>Loading chart...</div>}
  {error && <div className='warn' style={{fontSize:12, lineHeight:1.4}}>{error}</div>}
      <div style={{display:'flex', gap:12, flexWrap:'wrap', fontSize:11, opacity:0.8}}>
        <Legend color='#5ac8fa' label='Entry' />
        <Legend color='#ffd166' label='Exit' />
        <Legend color='#ef4444' label='Stop' />
        <Legend color='#20c997' label='Target' />
      </div>
    </div>
  );
}

function toMarkerTime(ts: string){ return Math.floor(new Date(ts).getTime()/1000); }

// Derive fills-based averages & timing
function deriveFromFills(trade: any){
  const fills = Array.isArray(trade.tradeFills) ? trade.tradeFills : [];
  const sorted = [...fills].sort((a,b)=> new Date(a.time).getTime() - new Date(b.time).getTime());
  const entryFills = sorted.filter(f=> f.type==='ENTRY');
  const exitFills = sorted.filter(f=> f.type==='EXIT');
  const sumQty = (arr:any[]) => arr.reduce((s,x)=> s + Number(x.size||0), 0);
  const qtyEntry = sumQty(entryFills);
  const qtyExit = sumQty(exitFills);
  const wAvg = (arr:any[]) => {
    const total = arr.reduce((s,x)=> s + Number(x.price)*Number(x.size), 0);
    const qty = sumQty(arr);
    return qty ? total/qty : null;
  };
  const avgEntry = wAvg(entryFills);
  const avgExit = wAvg(exitFills);
  const firstEntryTime = entryFills[0]?.time || null;
  const lastExitTime = exitFills.length ? exitFills[exitFills.length-1].time : null;
  return { fills: sorted, entryFills, exitFills, avgEntry, avgExit, qtyEntry, qtyExit, firstEntryTime, lastExitTime };
}

function sortCandles(list: { time: Time; open:number; high:number; low:number; close:number }[]){
  // sort ascending and remove duplicates by time (keep last occurrence)
  const sorted = [...list].sort((a,b)=> Number(a.time) - Number(b.time));
  const dedup: any[] = [];
  for (const c of sorted) {
    const last = dedup[dedup.length - 1];
    if (!last || Number(last.time) !== Number(c.time)) dedup.push(c);
    else dedup[dedup.length - 1] = c; // replace with latest
  }
  return dedup;
}

function Legend({ color, label }: { color:string; label:string }){
  return <span style={{display:'inline-flex', alignItems:'center', gap:4}}><span style={{width:10, height:10, background:color, borderRadius:3}} /> {label}</span>;
}
