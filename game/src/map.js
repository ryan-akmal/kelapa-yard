// KELAPA YARD — the map. A walled tropical yard, 40 x 28 m, with two
// bomb sites and three lanes between them, built from boxes, cylinders
// and spheres only. No imported models, no textures, no network.
//
// Layout (x east, z south, metres; player spawns south, bots north):
//   Site A "KIOS"   — north-west corner, a market kiosk with crates.
//   Site B "WARUNG" — south-east corner, a food stall with an awning.
//   Gang Tengah     — the middle lane, split by a coconut grove.
//   Gang Barat / Gang Timur — side lanes along the walls, with corners
//   that break sightlines so holding an angle is a real decision.
// Every solid is both a collider (player + bots) and a surface a bullet
// stops on. Site markers are glowing rings on the ground.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'KIOS', center: new THREE.Vector3(-14, 0, -9), radius: 3.2 },
  B: { name: 'WARUNG', center: new THREE.Vector3(13, 0, 9), radius: 3.2 },
};

export const PLAYER_SPAWN = new THREE.Vector3(0, 0, 12.5);
export const BOT_SPAWNS = [
  new THREE.Vector3(-10, 0, -11),
  new THREE.Vector3(0, 0, -12),
  new THREE.Vector3(10, 0, -11),
  new THREE.Vector3(-4, 0, -6),
];

// Waypoint loops the bots patrol when they have not seen or heard you.
// Each route runs through a lane and past a site, so a bot can be met
// anywhere instead of camping one corner.
export const BOT_ROUTES = [
  [new THREE.Vector3(-10, 0, -11), new THREE.Vector3(-12, 0, -2), new THREE.Vector3(-6, 0, 6), new THREE.Vector3(2, 0, 2)],
  [new THREE.Vector3(0, 0, -12), new THREE.Vector3(0, 0, -4), new THREE.Vector3(6, 0, 2), new THREE.Vector3(-2, 0, 8)],
  [new THREE.Vector3(10, 0, -11), new THREE.Vector3(14, 0, -2), new THREE.Vector3(8, 0, 6), new THREE.Vector3(0, 0, 0)],
  [new THREE.Vector3(-4, 0, -6), new THREE.Vector3(-14, 0, -9), new THREE.Vector3(-8, 0, 0), new THREE.Vector3(4, 0, -4)],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(rt, rb, h, x, y, z, mat, segments = 10) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: warm sand, 40 x 28 m.
  box(40.4, 0.4, 28.4, 0, -0.2, 0, 'sand');
  // Perimeter walls, 4.2 m high, deep green.
  box(0.5, 4.2, 28.4, -20.2, 2.1, 0, 'surface');
  box(0.5, 4.2, 28.4, 20.2, 2.1, 0, 'surface');
  box(40.4, 4.2, 0.5, 0, 2.1, -14.2, 'surface');
  box(40.4, 4.2, 0.5, 0, 2.1, 14.2, 'surface');

  // --- Site A "KIOS" (north-west): kiosk counter + roof + crate stack.
  box(5.2, 1.1, 1.4, -14, 0.55, -10.6, 'terracotta');
  box(5.6, 0.25, 2.2, -14, 2.6, -10.6, 'terracotta');
  box(0.3, 2.6, 0.3, -16.6, 1.3, -10.6, 'bark');
  box(0.3, 2.6, 0.3, -11.4, 1.3, -10.6, 'bark');
  box(1.4, 1.4, 1.4, -16.5, 0.7, -7.6, 'hairline');
  box(1.4, 0.7, 1.4, -16.5, 1.75, -7.6, 'hairline');
  box(1.2, 1.2, 1.2, -10.5, 0.6, -7.2, 'hairline');

  // --- Site B "WARUNG" (south-east): stall + angled awning + tables.
  box(4.6, 1.0, 1.6, 13, 0.5, 11.4, 'terracotta');
  const awning = box(5.0, 0.18, 2.6, 13, 2.5, 10.2, 'accent');
  awning.rotation.x = 0.22;
  box(0.3, 2.5, 0.3, 10.7, 1.25, 10.2, 'bark');
  box(0.3, 2.5, 0.3, 15.3, 1.25, 10.2, 'bark');
  box(1.8, 0.75, 1.0, 9.5, 0.38, 7.0, 'hairline');
  box(1.8, 0.75, 1.0, 16.5, 0.38, 7.0, 'hairline');

  // --- Gang Tengah: the coconut grove splits mid into two half-lanes.
  cylinder(0.28, 0.36, 4.6, -2, 2.3, -2, 'bark');
  cylinder(0.28, 0.36, 4.2, 2, 2.1, 3, 'bark');
  cylinder(0.28, 0.36, 4.8, 0, 2.4, -6, 'bark');
  // Canopies: spheres that read as coconut crowns from the ground.
  for (const [x, y, z, r] of [[-2, 5.0, -2, 1.7], [2, 4.6, 3, 1.6], [0, 5.2, -6, 1.8]]) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), materials.leaf);
    crown.position.set(x, y, z);
    crown.castShadow = true;
    group.add(crown);
    shootables.push(crown);
  }

  // --- Mid cover: low walls and crates that make crouch-peeking pay.
  box(3.4, 1.1, 1.0, -6, 0.55, 1.5, 'hairline');
  box(1.0, 1.1, 3.4, 6, 0.55, -1.5, 'hairline');
  box(2.2, 0.9, 2.2, -9, 0.45, 4.5, 'hairline');
  box(1.6, 1.6, 1.6, 9, 0.8, -6.5, 'hairline');
  box(1.6, 0.8, 1.6, 9, 2.0, -6.5, 'hairline');
  box(1.2, 1.2, 1.2, -13, 0.6, 3.5, 'hairline');
  box(1.2, 1.2, 1.2, 14, 0.6, -4.5, 'hairline');

  // --- Lane blockers: tall walls that break the long sightlines.
  box(0.6, 3.0, 6.0, -7, 1.5, -8, 'surface');
  box(0.6, 3.0, 6.0, 7, 1.5, 8, 'surface');
  box(6.0, 3.0, 0.6, -13, 1.5, 0, 'surface');
  box(6.0, 2.2, 0.6, 12, 1.1, -1, 'surface');

  // --- Barrels: cylinders that stop bullets and block movement.
  cylinder(0.55, 0.55, 1.1, -4, 0.55, 8, 'terracotta', 12);
  cylinder(0.55, 0.55, 1.1, 4, 0.55, -9, 'terracotta', 12);
  cylinder(0.55, 0.55, 1.1, 16, 0.55, 2, 'terracotta', 12);

  // Site markers: flat glowing rings on the sand, A orange, B orange.
  const siteMarkers = {};
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.02, site.center.z);
    group.add(ring);
    siteMarkers[key] = ring;
  }

  // Light: a low warm sun from the west, a cool dusk fill, and a warm
  // lamp glow over each site so the objective reads at a glance.
  const sky = new THREE.HemisphereLight(new THREE.Color('#9db8c4'), new THREE.Color(PALETTE.bark), 0.9);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.4);
  sun.position.set(-18, 12, 6);
  sun.target.position.set(4, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(14, 10, -10);
  scene.add(fill);

  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 26, 12);
  lampA.position.set(-14, 3.4, -9);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 26, 12);
  lampB.position.set(13, 3.4, 9);
  scene.add(lampB);

  return { colliders, shootables, group, siteMarkers };
}
