import { useReadiness, useMarket } from './market';
import { eth, usd } from './format';

/**
 * The launch treasury: the ObjectPad wallet that pays the launch fee, first buy and gas for every free launch.
 * Balance and per-launch cost are read live from Robinhood Chain by the API; nothing is estimated as funded.
 */
export function useTreasury() {
  const status = useReadiness(); const market = useMarket(); const sponsor = status.data?.sponsor ?? null; const ethUsd = market.data?.ethUsd ?? null;
  const balanceEth = sponsor ? Number(BigInt(sponsor.balanceWei)) / 1e18 : null;
  const costEth = sponsor ? Number(BigInt(sponsor.launchCostWei)) / 1e18 : null;
  // Each person gets perPersonDaily free launches every 24h, as long as the treasury can pay for them.
  const perPerson = sponsor?.perPersonDaily ?? 5;
  const launchesLeft = sponsor ? Math.max(0, Math.min(sponsor.launchesAffordable, perPerson, sponsor.dailyLimit - sponsor.usedToday)) : 0;
  const money = (value: number | null) => (value === null ? '…' : ethUsd ? usd(value * ethUsd) : eth(value, 4));
  return {
    loading: status.isPending, address: sponsor?.address ?? null, balanceEth, costEth, ethUsd,
    affordable: sponsor?.launchesAffordable ?? 0, launchesLeft, usedToday: sponsor?.usedToday ?? 0, dailyLimit: sponsor?.dailyLimit ?? 0, perPerson,
    open: Boolean(sponsor && sponsor.launchesAffordable >= 1 && sponsor.usedToday < sponsor.dailyLimit),
    scanning: status.data ? status.data.mode !== 'operator_blocked' : null,
    label: balanceEth === null ? (status.isError ? '—' : '…') : `${balanceEth.toFixed(balanceEth >= 1 ? 2 : 4)} ETH`,
    balanceUsd: money(balanceEth), costUsd: money(costEth),
  };
}
