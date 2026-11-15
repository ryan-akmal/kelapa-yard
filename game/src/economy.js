// The round economy: money in, money out, nothing else. Prices live with
// the weapon definitions in weapons.js; this module only decides what a
// round is worth and whether a purchase is affordable.
export const ECONOMY = {
  startMoney: 800,
  winRound: 600,
  loseRound: 300,
  kill: 200,
  plant: 300,
  defuseDenied: 150, // killing the bot that was defusing
};

export function roundPayout(won, kills, planted) {
  let payout = won ? ECONOMY.winRound : ECONOMY.loseRound;
  payout += kills * ECONOMY.kill;
  if (planted) payout += ECONOMY.plant;
  return payout;
}

export function canAfford(money, price) {
  return money >= price;
}
