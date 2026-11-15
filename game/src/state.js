// All mutable match state lives here, in one plain object, so the sim,
// the HUD and the round flow never disagree about what is happening.
// main.js owns the object; the other modules read it or take the fields
// they need as arguments, and nobody keeps a second copy of a number.
export const PHASE = {
  BUY: 'buy', // between rounds: buy menu open, bots frozen, timer paused
  LIVE: 'live', // round running: timer counts down, bots hunt
  END: 'end', // round decided: banner shown, next round arms on click / key
  MATCH: 'match', // match decided (first to 3 rounds): restart resets all
};

export const ROUND_SECONDS = 100;
export const MATCH_WIN_ROUNDS = 3;
export const START_MONEY = 800;

export function createGameState() {
  return {
    phase: PHASE.BUY,
    round: 1,
    won: 0, // rounds the player won
    lost: 0, // rounds the player lost
    money: START_MONEY,
    health: 100,
    maxHealth: 100,
    timer: ROUND_SECONDS, // seconds left in the live round
    kills: 0, // kills this round (for the end banner)
    totalKills: 0,
    bomb: {
      state: 'idle', // idle | planting | planted | defused | exploded
      site: null, // 'A' | 'B' | null
      plantProgress: 0, // 0..1 while holding E at a site
      defuseProgress: 0, // 0..1 while a bot channels a defuse
      explodeIn: 0, // seconds until the planted bomb blows
      defuser: null, // the bot currently defusing, if any
    },
    banner: '', // short line the HUD shows under the timer
    message: '', // one-line feed line (kill, plant, buy, ...)
    plantedSite: null,
  };
}

export function resetRoundState(state) {
  state.health = state.maxHealth;
  state.timer = ROUND_SECONDS;
  state.kills = 0;
  state.bomb.state = 'idle';
  state.bomb.site = null;
  state.bomb.plantProgress = 0;
  state.bomb.defuseProgress = 0;
  state.bomb.explodeIn = 0;
  state.bomb.defuser = null;
  state.plantedSite = null;
  state.banner = '';
}
