// The four bots: orange-shirt defenders who patrol the lanes, hold the
// sites, and react to what they see and hear. Each bot is a small state
// machine — patrol, engage, defuse, dead — driven at the fixed step.
// Seeing: a ray from the bot's eyes to the player, blocked by any wall
// or crate in the world's shootables. Hearing: a gunshot within 22 m
// pulls the nearest bots toward the noise. Shooting: a bot that sees you
// fires in bursts with a hit chance that falls with distance and rises
// when you stand still in the open, so moving and crouching matter.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_HEALTH = 100;
const BOT_SPEED = 2.9;
const BOT_ENGAGE_SPEED = 2.2;
const SIGHT_RANGE = 30;
const HEAR_RANGE = 22;
const SHOT_GAP = 0.55;
const SHOT_DAMAGE = 11;

export function createBots(scene, world, routes, spawns) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE + 4;
  const toPlayer = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  // Reused collision probes: the movement loop allocates nothing per frame.
  const probeA = new THREE.Box3();
  const probeB = new THREE.Box3();

  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.65, metalness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.8, 0.32);
  const headGeo = new THREE.SphereGeometry(0.17, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.2);

  const bots = [];
  const hitMeshes = [];

  for (let i = 0; i < spawns.length; i += 1) {
    const group = new THREE.Group();
    group.position.copy(spawns[i]);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.02;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.58;
    head.userData.part = 'head';
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.14, 0.28, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.14, 0.28, 0);
    group.add(torso, head, legL, legR);
    group.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      id: i,
      group,
      torso,
      head,
      legL,
      legR,
      health: BOT_HEALTH,
      alive: true,
      mode: 'patrol', // patrol | engage | defuse | dead
      route: routes[i % routes.length],
      routeIndex: 0,
      target: routes[i % routes.length][0].clone(),
      shotTimer: 0.4 + i * 0.2,
      defuseTimer: 0,
      hearAt: null, // a Vector3 the bot heard a shot from
      walkPhase: Math.random() * 6,
      yaw: Math.PI,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  function canSee(bot, playerPos, playerEye) {
    toPlayer.copy(playerPos);
    toPlayer.y += playerEye;
    eyePos.set(bot.group.position.x, 1.55, bot.group.position.z);
    const dist = eyePos.distanceTo(toPlayer);
    if (dist > SIGHT_RANGE) return false;
    moveDir.copy(toPlayer).sub(eyePos).normalize();
    raycaster.set(eyePos, moveDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function moveToward(bot, dest, dt, speed) {
    moveDir.set(dest.x - bot.group.position.x, 0, dest.z - bot.group.position.z);
    const dist = moveDir.length();
    if (dist < 0.15) return true;
    moveDir.normalize();
    const stepLen = Math.min(dist, speed * dt);
    const nx = bot.group.position.x + moveDir.x * stepLen;
    const nz = bot.group.position.z + moveDir.z * stepLen;
    // Bots collide with the same world boxes, tested as a small probe.
    probeA.min.set(nx - 0.34, 0.05, nz - 0.34);
    probeA.max.set(nx + 0.34, 1.7, nz + 0.34);
    let blocked = false;
    for (const c of world.colliders) {
      if (probeA.intersectsBox(c)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      bot.group.position.x = nx;
      bot.group.position.z = nz;
      bot.yaw = Math.atan2(moveDir.x, moveDir.z);
      bot.group.rotation.y = bot.yaw;
    } else {
      // Sidestep: try the perpendicular, so a bot never wedges on a crate.
      const px = bot.group.position.x - moveDir.z * stepLen;
      const pz = bot.group.position.z + moveDir.x * stepLen;
      probeB.min.set(px - 0.34, 0.05, pz - 0.34);
      probeB.max.set(px + 0.34, 1.7, pz + 0.34);
      let blocked2 = false;
      for (const c of world.colliders) {
        if (probeB.intersectsBox(c)) {
          blocked2 = true;
          break;
        }
      }
      if (!blocked2) {
        bot.group.position.x = px;
        bot.group.position.z = pz;
      }
    }
    return dist < 0.4;
  }

  // Returns true when this hit killed the bot, false when it only hurt
  // it, null when the mesh is not a live bot.
  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return null;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.mode = 'dead';
    bot.defuseTimer = 0;
    bot.group.rotation.x = -Math.PI / 2 + 0.12;
    bot.group.position.y = 0.25;
    return true;
  }

  function hearShot(from) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.group.position.distanceTo(from) < HEAR_RANGE && bot.mode === 'patrol') {
        bot.hearAt = from.clone();
      }
    }
  }

  // step returns events the sim acts on: { shot: bot } when a bot fires,
  // so main.js rolls the hit and the sound in one place.
  function step(dt, player, bombPlanted, bombSite) {
    const events = [];
    const playerPos = player.state.position;
    const playerEye = player.state.eye;
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.walkPhase += dt * 7;
      const swing = Math.sin(bot.walkPhase) * 0.35;
      bot.legL.rotation.x = swing;
      bot.legR.rotation.x = -swing;
      const sees = canSee(bot, playerPos, playerEye);
      const playerMoving = player.groundSpeed() > 1.5;
      const playerCrouched = player.state.crouching;

      if (bombPlanted && bombSite) {
        // The bomb is ticking: break off and go defuse it.
        bot.mode = 'defuse';
      } else if (sees) {
        bot.mode = 'engage';
      } else if (bot.mode === 'engage') {
        bot.mode = 'patrol';
      }

      if (bot.mode === 'defuse') {
        const arrived = moveToward(bot, bombSite, dt, BOT_SPEED);
        if (arrived) {
          bot.defuseTimer += dt;
          bot.group.rotation.y = Math.atan2(
            bombSite.x - bot.group.position.x,
            bombSite.z - bot.group.position.z,
          );
        }
        continue;
      }

      if (bot.mode === 'engage') {
        // Face the player, strafe a little, and fire in bursts.
        bot.group.rotation.y = Math.atan2(
          playerPos.x - bot.group.position.x,
          playerPos.z - bot.group.position.z,
        );
        bot.shotTimer -= dt;
        if (bot.shotTimer <= 0) {
          bot.shotTimer = SHOT_GAP + Math.random() * 0.35;
          events.push({ type: 'shot', bot });
        }
        // Close the distance slowly instead of standing still.
        const dist = bot.group.position.distanceTo(playerPos);
        if (dist > 14) moveToward(bot, playerPos, dt, BOT_ENGAGE_SPEED);
        continue;
      }

      // Patrol: follow the route, or investigate a noise first.
      let dest = bot.target;
      if (bot.hearAt) {
        dest = bot.hearAt;
        if (moveToward(bot, dest, dt, BOT_SPEED)) bot.hearAt = null;
      } else {
        if (moveToward(bot, dest, dt, BOT_SPEED)) {
          bot.routeIndex = (bot.routeIndex + 1) % bot.route.length;
          bot.target = bot.route[bot.routeIndex];
        }
      }
      bot.shotTimer = Math.max(bot.shotTimer - dt, 0);
    }
    return events;
  }

  function reset(spawnPoints) {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      bot.alive = true;
      bot.health = BOT_HEALTH;
      bot.mode = 'patrol';
      bot.routeIndex = 0;
      bot.target = bot.route[0].clone();
      bot.hearAt = null;
      bot.defuseTimer = 0;
      bot.shotTimer = 0.4 + i * 0.2;
      bot.group.position.copy(spawnPoints[i]);
      bot.group.position.y = 0;
      bot.group.rotation.set(0, Math.PI, 0);
      bot.yaw = Math.PI;
    }
  }

  function aliveCount() {
    let n = 0;
    for (const bot of bots) if (bot.alive) n += 1;
    return n;
  }

  return {
    bots,
    hitMeshes,
    damage,
    hearShot,
    step,
    reset,
    aliveCount,
    shotDamage: SHOT_DAMAGE,
  };
}
