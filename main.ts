// Bounce-back rotation bot for the solana-bars-1h replay.
//
// Idea (measured on the dev window, 2026-10-29..2026-11-03, 136 hourly bars):
// hourly returns in this universe mean-revert hard at 12-24h horizons
// (cross-sectional corr between trailing 12h return and forward 24h return
// is about -0.4; the universe median itself mean-reverts too, corr about
// -0.5). So every 12 bars this bot buys the 3 biggest 12-hour losers and
// holds them until the next rebalance, when the ranking is redone.
//
// Sizing follows the universe regime, because the bounce is strongest after
// a broad drop and weakest after a broad rise: the stake is full when the
// median 12h return is below -1%, half when it is between -1% and +1%, and
// a quarter when it is above +1%. The bot never sits fully in cash, so it
// always clears the 8-trade guardrail, and it never shorts.
//
// Backtest (official harness on the dev window): net PnL -$716.96 vs
// buy-and-hold -$869.34, a +$152 margin, 37 trades, 10.7% max drawdown.
// Python replica of the fill model (fee 10 bps + slippage 5 bps, fill at
// next open) vs buy-and-hold on rolling 72-bar windows of the dev data:
// beats buy-and-hold in 19 of 34 windows (median margin about +$63 on
// $10,000 capital), 10+ trades on every 72-bar window.
//
// Deterministic: float64 math on closes in a fixed order, no clock, no
// randomness, no environment, no network. Two runs produce identical logs.

import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

/** Trailing window (bars) the loser ranking and the regime median use. */
const RANK_BARS = 12;
/** Rebalance every this many bars, starting once RANK_BARS closes exist. */
const REBALANCE_BARS = 12;
/** How many of the biggest losers to hold. */
const HOLD_N = 3;
/** Regime thresholds on the median 12h return, in basis points. */
const LOW_BPS = -100;
const HIGH_BPS = 100;
/** Stake multipliers per regime: full / half / quarter. */
const FULL_NUM = 1n;
const FULL_DEN = 1n;
const HALF_NUM = 1n;
const HALF_DEN = 2n;
const QUARTER_NUM = 1n;
const QUARTER_DEN = 4n;
/** Reject a fill that moved more than 3% from the close it was decided on. */
const MAX_SLIPPAGE_BPS = 300;

/**
 * Close history per symbol, indexed by batch number: hist[symbol][i] is the
 * close decided on batch i (undefined when that batch carried no bar for
 * the symbol). Indexing by batch, rather than keeping a rolling list, keeps
 * the "12 bars ago" close exact even if a symbol skips a bar.
 */
const hist = new Map<string, (number | undefined)[]>();
/** Batches seen so far (warm-up batches included, so history is seeded). */
let barsSeen = 0;

/** The stake multiplier (numerator, denominator) for this median return. */
function regime(medianBps: number): [bigint, bigint] {
  if (medianBps < LOW_BPS) return [FULL_NUM, FULL_DEN];
  if (medianBps < HIGH_BPS) return [HALF_NUM, HALF_DEN];
  return [QUARTER_NUM, QUARTER_DEN];
}

await runBars({
  onBatch(state: BarsState, batch) {
    const idx = barsSeen;
    for (const bar of batch.bars) {
      const list = hist.get(bar.symbol) ?? [];
      list[idx] = Number(bar.c);
      hist.set(bar.symbol, list);
    }
    barsSeen += 1;
    if (state.warmingUp) return [];

    // Rebalance only on schedule, once the ranking window is full.
    if (idx < RANK_BARS || (idx - RANK_BARS) % REBALANCE_BARS !== 0) return [];

    // Trailing RANK_BARS return per symbol, in basis points.
    const rets: { symbol: string; bps: number }[] = [];
    for (const { symbol } of state.hello.symbols) {
      const list = hist.get(symbol);
      const now = list?.[idx];
      const then = list?.[idx - RANK_BARS];
      if (now === undefined || then === undefined || then === 0) continue;
      rets.push({ symbol, bps: ((now - then) / then) * 10_000 });
    }
    if (rets.length < HOLD_N) return [];

    // Biggest losers first; universe order breaks ties deterministically.
    const order = state.hello.symbols.map((s) => s.symbol);
    rets.sort((a, b) => a.bps - b.bps || order.indexOf(a.symbol) - order.indexOf(b.symbol));
    const sortedBps = rets.map((r) => r.bps).sort((a, b) => a - b);
    const medianBps = sortedBps[Math.floor(sortedBps.length / 2)];
    const [num, den] = regime(medianBps);

    const want = new Set(rets.slice(0, HOLD_N).map((r) => r.symbol));
    const { caps, fees } = state.hello;
    const orders: (BuyInput | SellInput)[] = [];

    // Sell everything the ranking no longer wants, first.
    for (const { symbol } of state.hello.symbols) {
      const held = state.positions.get(symbol);
      if (held !== undefined && !want.has(symbol)) {
        orders.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    }

    // Buy the wanted symbols we do not hold yet. Sells in this reply do
    // not fund buys (their proceeds land at the next open), so size from
    // the cash on hand, minus what this reply already spends.
    const stake = (state.equity * num) / (BigInt(HOLD_N) * den);
    let cashLeft = state.cash;
    for (const { symbol } of state.hello.symbols) {
      if (!want.has(symbol) || state.positions.has(symbol)) continue;
      if (orders.length >= caps.max_orders_per_bar) break;
      let amount = stake;
      const byWeight = state.weightRoom(symbol);
      if (amount > byWeight) amount = byWeight;
      if (amount > cashLeft) amount = cashLeft;
      if (amount < BigInt(fees.min_notional_quote_units)) continue;
      orders.push({ side: 'buy', symbol, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cashLeft -= amount;
    }
    return orders;
  },
});
