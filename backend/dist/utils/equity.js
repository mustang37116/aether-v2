// Legacy simple curve based only on trades (entry time). Kept for backward compatibility.
export function buildEquityCurve(trades) {
    const points = [];
    let cum = 0;
    const sorted = trades.slice().sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
    for (const t of sorted) {
        if (t.exitPrice) {
            const pnl = (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size);
            cum += pnl;
        }
        points.push({ time: t.entryTime, cumulative: cum });
    }
    return points;
}
// Enhanced curve: combines deposits/withdrawals and realized PnL at exit time.
// Transactions affect equity at their createdAt. Trade PnL realized at exitTime (if closed).
export function buildEquityCurveWithTransactions(trades, transactions) {
    const events = [];
    for (const tx of transactions) {
        const amt = Number(tx.amount);
        events.push({
            time: tx.createdAt,
            delta: tx.type === 'DEPOSIT' ? amt : -amt,
            kind: tx.type
        });
    }
    for (const t of trades) {
        if (t.exitPrice) {
            const pnl = (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size) - Number(t.fees || 0);
            events.push({ time: t.exitTime || t.entryTime, delta: pnl, kind: 'PNL' });
        }
    }
    events.sort((a, b) => a.time.getTime() - b.time.getTime());
    const curve = [];
    let cum = 0;
    for (const e of events) {
        cum += e.delta;
        curve.push({ time: e.time, cumulative: cum, eventDelta: e.delta, kind: e.kind });
    }
    return curve;
}
