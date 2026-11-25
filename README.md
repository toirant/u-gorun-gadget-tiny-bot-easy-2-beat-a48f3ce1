# Bounce-back rotation bot — Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/toirant/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/toirant/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

Entry for [u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) (free entry, $2 pot).

## Strategy

Hourly returns in this 7-asset Solana universe mean-revert hard at 12–24h
horizons (on the dev window the cross-sectional correlation between a
symbol's trailing 12h return and its forward 24h return is about −0.4, and
the universe median mean-reverts too). So every 12 bars the bot:

1. ranks all 7 symbols by trailing 12h return, worst first;
2. holds the 3 biggest losers at equal weight (25% weight cap respected);
3. sells anything the ranking no longer wants.

Sizing follows the universe regime, because the bounce is strongest after
a broad drop: full stake when the median 12h return is below −1%, half
between −1% and +1%, a quarter above +1%. The bot never sits fully in cash
and never shorts, so it always clears the 8-trade guardrail.

## Local grade (official harness, dev window)

Run from the kit directory:

```
node cli/makefun.mjs grade-local --kit . --bot <this repo> --driver process
```

Python replica of the fill model (fee 10 bps + slippage 5 bps, fill at next
open) vs buy-and-hold: beats buy-and-hold in 19–20 of 34 rolling 72-bar
windows of the dev data (median margin about +$55 on $10,000 capital),
max drawdown about 11%, 10+ trades on every 72-bar window.

## Files

- `main.ts` — the bot (Node 22, stdlib only, deterministic)
- `vendor/makefun-bars.ts` — the kit's bars-replay/v1 shim, byte-identical

## License

MIT — see `LICENSE`.
