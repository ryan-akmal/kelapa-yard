// Three weapons and one grenade, each with its own numbers, price and
// view model. The loadout owns the magazines; main.js owns the ray and
// the damage, and reads the current weapon's definition for both.
//   1 Pistol Kopi — free, starting sidearm, light and quick to reload.
//   2 Senapan Kelapa — $700, the workhorse rifle: fast, accurate standing still.
//   3 Bedil Sawah — $500, a pump shotgun: eight pellets, brutal up close.
//   4 Petasan — $300 each, a hand grenade (G to throw, at most 2 carried).
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = [
  {
    id: 'pistol', slot: 0, name: 'Pistol Kopi', price: 0,
    damage: 24, headDamage: 72, mag: 12, reserve: 48,
    fireGap: 0.21, reloadTime: 1.4, spreadStill: 0.004, spreadMoving: 0.03,
    recoil: 0.008, pellets: 1, kind: 'pistol', auto: false,
  },
  {
    id: 'rifle', slot: 1, name: 'Senapan Kelapa', price: 700,
    damage: 34, headDamage: 100, mag: 25, reserve: 75,
    fireGap: 0.105, reloadTime: 2.0, spreadStill: 0.0025, spreadMoving: 0.028,
    recoil: 0.011, pellets: 1, kind: 'rifle', auto: true,
  },
  {
    id: 'shotgun', slot: 2, name: 'Bedil Sawah', price: 500,
    damage: 11, headDamage: 22, mag: 5, reserve: 20,
    fireGap: 0.9, reloadTime: 2.4, spreadStill: 0.02, spreadMoving: 0.05,
    recoil: 0.032, pellets: 8, kind: 'shotgun', auto: false,
  },
];

export const GRENADE = { id: 'grenade', name: 'Petasan', price: 300, maxCarried: 2 };

const MOVE_REFERENCE = 5.4;

function buildModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.bark), roughness: 0.75, metalness: 0.1 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  if (def.kind === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.07), grip);
    handle.position.set(0, -0.09, 0.08);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), accent);
    sight.position.set(0, 0.05, -0.1);
    model.add(slide, handle, sight);
  } else if (def.kind === 'rifle') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.44), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), grip);
    barrel.position.set(0, 0.025, -0.4);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.24), grip);
    stock.position.set(0, -0.02, 0.32);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), accent);
    mag.position.set(0, -0.11, -0.02);
    mag.rotation.x = 0.15;
    model.add(receiver, barrel, stock, mag);
  } else {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 10), body);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.02, -0.2);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.2), grip);
    pump.position.set(0, -0.03, -0.28);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.26), grip);
    stock.position.set(0, -0.02, 0.32);
    model.add(tube, pump, stock);
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createLoadout(camera) {
  const models = WEAPONS.map((def) => {
    const model = buildModel(def);
    model.visible = false;
    camera.add(model);
    return model;
  });
  models[0].visible = true;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    slot: 0,
    owned: [true, false, false],
    mags: WEAPONS.map((w) => w.mag),
    reserves: WEAPONS.map((w) => w.reserve),
    grenades: 1,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };

  function currentDef() {
    return WEAPONS[state.slot];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.slot];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const def = currentDef();
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mags[state.slot];
        const take = Math.min(need, state.reserves[state.slot]);
        state.mags[state.slot] += take;
        state.reserves[state.slot] -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPONS,
    currentDef,
    step,
    ready() {
      return state.mags[state.slot] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mags[state.slot] <= 0) return false;
      state.mags[state.slot] -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      if (state.reloadLeft > 0 || state.mags[state.slot] === def.mag || state.reserves[state.slot] === 0) return false;
      state.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed) {
      const def = currentDef();
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMoving;
    },
    equip(slot) {
      if (slot < 0 || slot >= WEAPONS.length || !state.owned[slot] || slot === state.slot) return false;
      models[state.slot].visible = false;
      state.slot = slot;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      models[slot].visible = true;
      return true;
    },
    // Buying happens only in the buy phase; main.js checks the phase.
    // Returns the price paid, or -1 when the purchase is not possible.
    buy(id, money) {
      if (id === 'grenade') {
        if (state.grenades >= GRENADE.maxCarried || money < GRENADE.price) return -1;
        state.grenades += 1;
        return GRENADE.price;
      }
      const def = WEAPONS.find((w) => w.id === id);
      if (!def || state.owned[def.slot] || money < def.price) return -1;
      state.owned[def.slot] = true;
      state.mags[def.slot] = def.mag;
      state.reserves[def.slot] = def.reserve;
      return def.price;
    },
    throwGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
    refillRound() {
      // Between rounds every owned weapon is topped back up to its reserve.
      for (let i = 0; i < WEAPONS.length; i += 1) {
        if (!state.owned[i]) continue;
        state.mags[i] = WEAPONS[i].mag;
        state.reserves[i] = WEAPONS[i].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    ammo() {
      return { mag: state.mags[state.slot], reserve: state.reserves[state.slot] };
    },
  };
}
