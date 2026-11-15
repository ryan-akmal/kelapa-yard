// The bomb objective. The player carries the "Tas Kelapa" (a coconut
// satchel) and can plant it at site A (KIOS) or B (WARUNG) by holding E
// inside the glowing ring for 3 seconds. Once planted it ticks for 35
// seconds: if it blows, the round is the player's; if a bot channels a
// 5-second defuse uninterrupted, the round is lost. Planting pays $300.
// The module owns the timers and the site glow; main.js owns the round
// verdict and calls back into here.
import * as THREE from 'three';

export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const EXPLODE_SECONDS = 35;

export function createBomb(scene, sites, siteMarkers) {
  // The satchel itself: a small dark sphere with an orange band, hidden
  // until the bomb is planted, then sitting on the site it was planted at.
  const satchel = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 9),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b2118'), roughness: 0.8 }),
  );
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.05, 8, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8c42') }),
  );
  band.rotation.x = Math.PI / 2;
  satchel.add(band);
  satchel.visible = false;
  scene.add(satchel);

  function nearestSite(playerPos) {
    let best = null;
    let bestDist = Infinity;
    for (const key of ['A', 'B']) {
      const site = sites[key];
      const d = Math.hypot(playerPos.x - site.center.x, playerPos.z - site.center.z);
      if (d < bestDist) {
        bestDist = d;
        best = key;
      }
    }
    return bestDist <= sites[best].radius ? best : null;
  }

  function setRingPulse(time, planted) {
    for (const key of ['A', 'B']) {
      const ring = siteMarkers[key];
      if (!ring) continue;
      const pulse = planted ? 0.5 : 0.65 + Math.sin(time * 3) * 0.25;
      ring.material.opacity = pulse;
    }
  }

  return {
    satchel,
    nearestSite,
    setRingPulse,
    placeSatchel(siteKey) {
      const site = sites[siteKey];
      satchel.position.set(site.center.x, 0.3, site.center.z);
      satchel.visible = true;
    },
    hideSatchel() {
      satchel.visible = false;
    },
  };
}
