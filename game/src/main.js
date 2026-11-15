// KELAPA YARD — boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. The sim (movement, bots, bomb, timer)
// never reads the renderer, and the renderer never writes the sim.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, PLAYER_SPAWN, BOT_SPAWNS, BOT_ROUTES } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createLoadout, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_SECONDS, DEFUSE_SECONDS, EXPLODE_SECONDS } from './bomb.js';
import { createGameState, PHASE, resetRoundState, MATCH_WIN_ROUNDS } from './state.js';
import { roundPayout } from './economy.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 58);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createGameState();
const world = createWorld(scene);
const bots = createBots(scene, world, BOT_ROUTES, BOT_SPAWNS);
const bomb = createBomb(scene, SITES, world.siteMarkers);
const loadout = createLoadout(camera);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders, PLAYER_SPAWN);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);

// Reused temporaries: the hot loops allocate nothing per frame.
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const muzzleVec = new THREE.Vector3();
const endVec = new THREE.Vector3();
const tmpBox = new THREE.Box3();

const body = player.state;
const grenades = []; // { mesh, vel, fuse }
const grenadeGeo = new THREE.SphereGeometry(0.12, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.terracotta), roughness: 0.6 });
const blastMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 12),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
);
blastMesh.visible = false;
scene.add(blastMesh);
let blastLife = 0;

// Tracers: a small pool of stretched boxes, reused, never allocated in play.
const tracers = [];
for (let i = 0; i < 8; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.02, 1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  tracers.push({ mesh, life: 0 });
}
let tracerIndex = 0;

function fireTracer(from, to) {
  const tracer = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  tracer.mesh.position.copy(from).add(to).multiplyScalar(0.5);
  tracer.mesh.lookAt(to);
  tracer.mesh.scale.set(1, 1, len);
  tracer.mesh.material.opacity = 0.85;
  tracer.mesh.visible = true;
  tracer.life = 0.07;
}

function stepTracers(dt) {
  for (const tracer of tracers) {
    if (tracer.life <= 0) continue;
    tracer.life -= dt;
    if (tracer.life <= 0) {
      tracer.mesh.visible = false;
      tracer.mesh.material.opacity = 0;
    }
  }
  if (blastLife > 0) {
    blastLife -= dt;
    const k = Math.max(0, blastLife / 0.45);
    blastMesh.material.opacity = k * 0.55;
    blastMesh.scale.setScalar(1 + (1 - k) * 5);
    if (blastLife <= 0) blastMesh.visible = false;
  }
}

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let lastBeepSecond = -1;
let plantedThisRound = false;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function syncHud() {
  const ammo = loadout.ammo();
  hud.setHealth(state.health);
  hud.setAmmo(ammo.mag, ammo.reserve, loadout.currentDef().name, loadout.state.grenades);
  hud.setMoney(state.money);
  hud.setTimer(state.timer);
  hud.setScore(state.won, state.lost, state.round);
  hud.setCrosshairGap(4 + loadout.spread(player.groundSpeed()) * 320);
  if (state.phase === PHASE.LIVE && state.bomb.state === 'planted') {
    hud.setBomb(`BOM DI ${state.bomb.site} — MELEDAK ${Math.ceil(state.bomb.explodeIn)} dtk`, 1 - state.bomb.explodeIn / EXPLODE_SECONDS);
  } else if (state.phase === PHASE.LIVE && state.bomb.state === 'planting') {
    hud.setBomb('MENANAM TAS KELAPA…', state.bomb.plantProgress);
  } else if (state.phase === PHASE.LIVE) {
    const site = bomb.nearestSite(body.position);
    hud.setBomb(site ? `Tahan E untuk tanam di ${SITES[site].name}` : '', 0);
  } else {
    hud.setBomb('', 0);
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = loadout.currentDef();
  if (!loadout.takeRound()) {
    audio.dryClick();
    return false;
  }
  camera.getWorldDirection(direction);
  const muzzle = muzzleVec.copy(camera.position).addScaledVector(direction, 0.6);
  let hitSomething = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    tmpVec2.copy(direction);
    tmpVec2.x += (random() * 2 - 1) * spread;
    tmpVec2.y += (random() * 2 - 1) * spread;
    tmpVec2.z += (random() * 2 - 1) * spread;
    tmpVec2.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, tmpVec2);
    const hit = raycaster.intersectObjects(shootables, false)[0];
    const end = hit ? hit.point : endVec.copy(camera.position).addScaledVector(tmpVec2, 80);
    fireTracer(muzzle, end);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const isHead = hit.object.userData.part === 'head';
      const killed = bots.damage(hit.object, isHead ? def.headDamage : def.damage);
      hitSomething = true;
      hud.hitMarker(Boolean(killed), shot ? 4000 : 90);
      if (killed) {
        state.kills += 1;
        state.totalKills += 1;
        state.money += 200;
        bot.defuseTimer = 0;
        audio.kill();
        hud.feedLine(`Kamu menumbangkan Penjaga #${bot.id + 1} (+$200)`);
      } else {
        audio.hit();
      }
    }
  }
  loadout.pullTrigger();
  player.recoil(def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hearShot(body.position);
  audio.shot(def.kind);
  syncHud();
  return hitSomething;
}

function throwGrenade() {
  if (!loadout.throwGrenade()) return;
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: 1.6,
  });
  audio.shot('pistol');
  syncHud();
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const pos = g.mesh.position;
  blastMesh.position.copy(pos);
  blastMesh.visible = true;
  blastLife = 0.45;
  audio.grenade();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.group.position.distanceTo(pos);
    if (d < 5.5) {
      const killed = bots.damage(bot.torso, Math.round(115 * (1 - d / 5.5)) + 10);
      if (killed) {
        state.kills += 1;
        state.totalKills += 1;
        state.money += 200;
        bot.defuseTimer = 0;
        audio.kill();
        hud.feedLine(`Petasan menumbangkan Penjaga #${bot.id + 1} (+$200)`);
      }
    }
  }
  const selfDist = body.position.distanceTo(pos);
  if (selfDist < 4) {
    state.health -= Math.round(42 * (1 - selfDist / 4));
    audio.hurt();
    if (state.health <= 0) {
      state.health = 0;
      endRound(false, 'Kamu kena Petasan sendiri.');
    }
  }
  syncHud();
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 13 * dt;
    const next = tmpVec.copy(g.mesh.position).addScaledVector(g.vel, dt);
    if (next.y < 0.12) {
      next.y = 0.12;
      g.vel.y *= -0.42;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    tmpBox.min.set(next.x - 0.12, next.y - 0.12, next.z - 0.12);
    tmpBox.max.set(next.x + 0.12, next.y + 0.12, next.z + 0.12);
    for (const c of world.colliders) {
      if (tmpBox.intersectsBox(c)) {
        g.vel.x *= -0.45;
        g.vel.z *= -0.45;
        g.vel.y *= 0.5;
        break;
      }
    }
    g.mesh.position.copy(next);
    g.mesh.rotation.x += dt * 6;
    g.mesh.rotation.z += dt * 4;
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function startRound() {
  resetRoundState(state);
  plantedThisRound = false;
  player.reset(PLAYER_SPAWN);
  bots.reset(BOT_SPAWNS);
  bomb.hideSatchel();
  loadout.refillRound();
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  state.phase = PHASE.BUY;
  state.banner = '';
  lastBeepSecond = -1;
  hud.hideBuy();
  syncHud();
}

function beginLive() {
  state.phase = PHASE.LIVE;
  hud.hideBuy();
  hud.setBanner('');
  syncHud();
}

function endRound(won, reason) {
  if (state.phase === PHASE.END || state.phase === PHASE.MATCH) return;
  const payout = roundPayout(won, state.kills, plantedThisRound);
  state.money += payout;
  if (won) state.won += 1;
  else state.lost += 1;
  state.phase = PHASE.END;
  state.banner = reason;
  hud.setBanner(reason);
  if (won) audio.roundWin();
  else audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
  const matchWon = state.won >= MATCH_WIN_ROUNDS;
  const matchLost = state.lost >= MATCH_WIN_ROUNDS;
  if (matchWon || matchLost) {
    state.phase = PHASE.MATCH;
    hud.showOverlay('match', {
      title: matchWon ? 'KELAPA YARD MENANG!' : 'KELAPA YARD KALAH',
      copy: matchWon
        ? `Kamu menang ${state.won}—${state.lost}. Halaman ini milikmu sore ini. Hadiah ronde: $${payout}.`
        : `Penjaga menang ${state.lost}—${state.won}. Halaman ini tetap milik mereka. Hadiah ronde: $${payout}.`,
      action: 'Main lagi dari awal',
    });
  } else {
    hud.showOverlay('round', {
      title: won ? `Ronde ${state.round} dimenangkan` : `Ronde ${state.round} kalah`,
      copy: `${reason} Hadiah ronde: $${payout} (menang $${won ? 600 : 300} + ${state.kills} kill x $200${plantedThisRound ? ' + tanam $300' : ''}). Skor ${state.won}—${state.lost}.`,
      action: 'Ronde berikutnya',
    });
  }
  syncHud();
}

function startMatch() {
  state.round = 1;
  state.won = 0;
  state.lost = 0;
  state.money = 800;
  state.totalKills = 0;
  startRound();
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === PHASE.MATCH) {
    startMatch();
    input.requestLock();
    return;
  }
  if (state.phase === PHASE.END) {
    state.round += 1;
    startRound();
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (state.phase === PHASE.BUY) showBuyMenu();
  } else if (state.phase === PHASE.LIVE) {
    hud.showOverlay('paused', 0);
  }
}

function showBuyMenu() {
  const items = WEAPONS.map((w, i) => ({
    key: String(i + 1),
    name: `${w.name} — ${w.damage} dmg, ${w.mag} peluru`,
    price: w.price,
    owned: loadout.state.owned[i],
    id: w.id,
  }));
  items.push({ key: '4', name: `${GRENADE.name} — ledakan area 5,5 m`, price: GRENADE.price, owned: false, id: 'grenade' });
  hud.showBuy(state.money, items);
}

function handlePressed(pressed) {
  if (state.phase === PHASE.BUY) {
    if (pressed.has('Digit1') || pressed.has('Digit2') || pressed.has('Digit3')) {
      const idx = Number(pressed.has('Digit1') ? 0 : pressed.has('Digit2') ? 1 : 2);
      const def = WEAPONS[idx];
      const paid = loadout.buy(def.id, state.money);
      if (paid >= 0) {
        state.money -= paid;
        audio.buy();
        hud.feedLine(`${def.name} dibeli (-$${paid})`);
        loadout.equip(idx);
        showBuyMenu();
        syncHud();
      }
    } else if (pressed.has('Digit4')) {
      const paid = loadout.buy('grenade', state.money);
      if (paid >= 0) {
        state.money -= paid;
        audio.buy();
        hud.feedLine(`Petasan dibeli (-$${paid})`);
        showBuyMenu();
        syncHud();
      }
    } else if (pressed.has('KeyB') || pressed.has('Enter')) {
      beginLive();
    }
    return;
  }
  if (state.phase !== PHASE.LIVE) return;
  if (pressed.has('Digit1')) loadout.equip(0);
  else if (pressed.has('Digit2')) loadout.equip(1);
  else if (pressed.has('Digit3')) loadout.equip(2);
  if (pressed.has('KeyR')) {
    if (loadout.reload()) audio.reload();
  }
  if (pressed.has('KeyG')) throwGrenade();
}

function step(dt) {
  if (state.phase === PHASE.LIVE) {
    state.timer -= dt;
    player.step(dt, input.state.keys);
    loadout.step(dt);
    stepGrenades(dt);
    if (state.phase !== PHASE.LIVE) return; // a grenade may have ended the round
    stepTracers(dt);
    bomb.setRingPulse(performance.now() / 1000, state.bomb.state === 'planted');

    // Planting: hold E inside a site ring.
    const siteKey = bomb.nearestSite(body.position);
    if (siteKey && input.state.keys.has('KeyE') && state.bomb.state === 'idle') {
      state.bomb.state = 'planting';
      state.bomb.site = siteKey;
    }
    if (state.bomb.state === 'planting') {
      if (siteKey === state.bomb.site && input.state.keys.has('KeyE')) {
        state.bomb.plantProgress += dt / PLANT_SECONDS;
        if (state.bomb.plantProgress >= 1) {
          state.bomb.state = 'planted';
          state.bomb.explodeIn = EXPLODE_SECONDS;
          plantedThisRound = true;
          bomb.placeSatchel(siteKey);
          audio.plantDone();
          hud.feedLine(`Tas Kelapa tertanam di ${SITES[siteKey].name} (+$300 kalau ronde menang)`);
          hud.setBanner(`Bom tertanam di ${SITES[siteKey].name} — bertahan 35 detik!`);
        }
      } else {
        state.bomb.plantProgress = Math.max(0, state.bomb.plantProgress - dt / PLANT_SECONDS);
        if (state.bomb.plantProgress === 0) state.bomb.state = 'idle';
      }
    }

    if (state.bomb.state === 'planted') {
      state.bomb.explodeIn -= dt;
      const sec = Math.ceil(state.bomb.explodeIn);
      if (sec !== lastBeepSecond && sec <= 10 && sec > 0) {
        lastBeepSecond = sec;
        audio.beep();
      }
      if (state.bomb.explodeIn <= 0) {
        bomb.hideSatchel();
        endRound(true, `Bom meledak di ${SITES[state.bomb.site].name} — titik itu rata!`);
        return;
      }
      // A bot that channels a full defuse wins the round for the defenders.
      for (const bot of bots.bots) {
        if (bot.alive && bot.mode === 'defuse' && bot.defuseTimer >= DEFUSE_SECONDS) {
          endRound(false, 'Penjaga menjinakkan bom.');
          return;
        }
      }
      const defuser = bots.bots.find((b) => b.alive && b.mode === 'defuse' && b.defuseTimer > 0);
      if (defuser) {
        state.bomb.defuseProgress = defuser.defuseTimer / DEFUSE_SECONDS;
        hud.setBanner(`Penjaga #${defuser.id + 1} sedang menjinakkan bom!`);
      }
    }

    // Bot turns: they move, see, shoot; their shots land here.
    const events = bots.step(dt, player, state.bomb.state === 'planted', state.bomb.site ? SITES[state.bomb.site].center : null);
    for (const event of events) {
      if (event.type !== 'shot') continue;
      const bot = event.bot;
      const dist = bot.group.position.distanceTo(body.position);
      let chance = 0.36;
      if (dist > 20) chance -= 0.12;
      if (dist < 8) chance += 0.1;
      if (player.groundSpeed() > 1.5) chance -= 0.08;
      if (body.crouching) chance -= 0.08;
      tmpVec.set(bot.group.position.x, 1.55, bot.group.position.z);
      tmpVec2.copy(body.position);
      tmpVec2.y += body.eye;
      fireTracer(tmpVec, tmpVec2);
      audio.enemyShot();
      if (random() < chance) {
        state.health -= bots.shotDamage;
        audio.hurt();
        hud.feedLine(`Penjaga #${bot.id + 1} menembakmu (-${bots.shotDamage})`);
        if (state.health <= 0) {
          state.health = 0;
          endRound(false, 'Kamu gugur di halaman.');
          return;
        }
      }
    }

    if (bots.aliveCount() === 0) {
      endRound(true, 'Semua penjaga tumbang.');
      return;
    }
    if (state.timer <= 0 && state.bomb.state !== 'planted') {
      endRound(false, 'Waktu habis — bom tidak tertanam.');
      return;
    }
  } else if (state.phase === PHASE.BUY) {
    loadout.step(dt);
    stepTracers(dt);
  }
  syncHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const pressed = input.takePressed();
    handlePressed(pressed);
    const def = loadout.currentDef();
    const wantFire = input.state.firing && state.phase === PHASE.LIVE;
    if (wantFire && loadout.ready() && (def.auto || !prevFiring)) {
      shoot(shot ? 0 : loadout.spread(player.groundSpeed()));
    }
    if (wantFire && !loadout.ready() && loadout.state.mags[loadout.state.slot] === 0 && !prevFiring) {
      audio.dryClick();
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'play') {
    // Live round, open mid-yard, clear line of sight: one bot straight
    // ahead at (0, 2), one to the right at (5, 0). No tree in between.
    state.phase = PHASE.LIVE;
    state.timer = 92;
    state.money = 1150;
    body.position.set(0, 0, 10);
    bots.bots[0].group.position.set(0, 0, 2);
    bots.bots[1].group.position.set(5, 0, 0);
    bots.bots[2].group.position.set(-5, 0, 4);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.3, 2));
    shoot(0);
    settle(8);
    shoot(0);
    settle(10);
    aimAt(new THREE.Vector3(5, 1.4, 0));
    shoot(0);
    settle(12);
    syncHud();
  } else if (name === 'end') {
    // Round won at KIOS: two bots down, the satchel on the ground, banner up.
    state.phase = PHASE.END;
    state.won = 2;
    state.lost = 1;
    state.round = 4;
    state.money = 1750;
    state.kills = 3;
    state.bomb.state = 'planted';
    state.bomb.site = 'A';
    bomb.placeSatchel('A');
    body.position.set(-9, 0, -3);
    bots.bots[0].group.position.set(-12, 0, -6);
    bots.bots[0].alive = false;
    bots.bots[0].mode = 'dead';
    bots.bots[0].group.rotation.x = -Math.PI / 2 + 0.12;
    bots.bots[0].group.position.y = 0.25;
    bots.bots[1].group.position.set(-16, 0, -5);
    bots.bots[1].alive = false;
    bots.bots[1].mode = 'dead';
    bots.bots[1].group.rotation.x = -Math.PI / 2 + 0.12;
    bots.bots[1].group.position.y = 0.25;
    bots.bots[2].group.position.set(-6, 0, -8);
    settle(20);
    aimAt(new THREE.Vector3(-14, 1.2, -9));
    hud.showOverlay('round', {
      title: 'Ronde 4 dimenangkan',
      copy: 'Bom meledak di KIOS — titik itu rata! Hadiah ronde: $1500 (menang $600 + 3 kill x $200 + tanam $300). Skor 2—1.',
      action: 'Ronde berikutnya',
    });
    syncHud();
  } else {
    // Start: spawn view down the middle lane toward the grove and KIOS.
    body.position.set(0.6, 0, 12.5);
    settle(20);
    aimAt(new THREE.Vector3(-2, 1.6, -6));
    hud.showOverlay('start', 0);
    syncHud();
  }
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
