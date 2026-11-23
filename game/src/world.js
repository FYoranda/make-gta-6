// Solmar Bay — the city: sunset sky, roads, buildings, beach, palms, lamps.
// One clear job: build every static mesh and answer collision questions.
import * as THREE from 'three';
import { CITY, ROAD_LINES } from './config.js';
import {
  mulberry32, makeTexture, facadeTexture, roadTexture,
  sidewalkTexture, sandTexture, signTexture,
} from './utils.js';

/** True when the circle (x, z, r) overlaps any building AABB. */
export function circleHits(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/** Push the circle {x, z} out of any building AABB it overlaps. */
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        pos.x = c.maxX + radius;
      }
    }
  }
  return hit;
}

export function pointInBuilding(x, z, colliders) {
  for (const c of colliders) {
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
  }
  return false;
}

const SIGN_WORDS = ['HOTEL', 'BAR', 'TACOS', '24H', 'CLUB', 'PIZZA', "ROSA'S", 'MOTEL', 'CASINO', 'SURF'];
const SIGN_COLORS = ['#ff2e63', '#08d9d6', '#f9ed69', '#ff9f1c', '#e26ee5'];

export function buildWorld(scene) {
  const rng = mulberry32(20261123);
  const colliders = [];
  const buildings = [];
  const { pitch, half, beachZ, waterZ, groundSize } = CITY;

  // ----- sunset sky dome, sun disc, fog, lights -----
  const skyTex = makeTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#241a5e');
    grad.addColorStop(0.45, '#7a3a8e');
    grad.addColorStop(0.72, '#ff7a3d');
    grad.addColorStop(1, '#ffc46b');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sun.position.set(-620, 150, -260);
  sun.lookAt(0, 60, 0);
  scene.add(sun);

  scene.fog = new THREE.Fog(0xdd8855, 200, 700);

  const sunLight = new THREE.DirectionalLight(0xffd9a0, 3.0);
  sunLight.position.set(-260, 170, 120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -260; sunLight.shadow.camera.right = 260;
  sunLight.shadow.camera.top = 260; sunLight.shadow.camera.bottom = -260;
  sunLight.shadow.camera.far = 800;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x8a7bd8, 0x3a2a1a, 1.05));

  // ----- ground base -----
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshLambertMaterial({ color: 0x4c5a44 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.receiveShadow = true;
  scene.add(base);

  // ----- roads -----
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const line of ROAD_LINES) {
    for (const horizontal of [true, false]) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(30, 1);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const road = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 28, CITY.roadWidth), mat);
      road.rotation.x = -Math.PI / 2;
      if (!horizontal) road.rotation.z = Math.PI / 2;
      road.position.set(horizontal ? 0 : line, 0.02, horizontal ? line : 0);
      road.receiveShadow = true;
      scene.add(road);
    }
  }
  void roadMat;

  // ----- beach + water -----
  const sandTex = sandTexture();
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, waterZ - beachZ + 8),
    new THREE.MeshLambertMaterial({ map: sandTex }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, (beachZ + waterZ) / 2);
  beach.receiveShadow = true;
  scene.add(beach);

  const waterMat = new THREE.MeshLambertMaterial({ color: 0x1e6f8e, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, 320), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.06, waterZ + 160);
  scene.add(water);

  // ----- sidewalks + buildings, block by block -----
  const sidewalkTex = sidewalkTexture();
  const facadeVariants = [];
  const wallColors = ['#b08a6a', '#8a7a9e', '#7a9e8a', '#a89a7a', '#9e6a6a', '#6a8aa8', '#c0a080'];
  for (let i = 0; i < 5; i++) {
    facadeVariants.push(facadeTexture(wallColors[i % wallColors.length], 0.45, 6 + i * 2, 6, mulberry32(100 + i)));
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  const plazaBlock = { bx: 2, bz: 2 }; // block centre (-30, -30)
  const parkBlocks = [{ bx: 1, bz: 4 }, { bx: 4, bz: 1 }];

  // Blocks sit BETWEEN the roads: centres at (i - 2.5) * pitch.
  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      const cx = (bx - 2.5) * pitch, cz = (bz - 2.5) * pitch;
      const isPlaza = bx === plazaBlock.bx && bz === plazaBlock.bz;
      const isPark = parkBlocks.some((p) => p.bx === bx && p.bz === bz);
      // sidewalk slab
      const walk = new THREE.Mesh(
        new THREE.BoxGeometry(CITY.blockSize, 0.3, CITY.blockSize),
        new THREE.MeshLambertMaterial({ map: sidewalkTex }),
      );
      walk.position.set(cx, 0.15, cz);
      walk.receiveShadow = true;
      scene.add(walk);

      if (isPlaza) {
        // fountain plaza: low round basin + water disc + benches
        const basin = new THREE.Mesh(
          new THREE.CylinderGeometry(7, 8, 1.2, 20),
          new THREE.MeshLambertMaterial({ color: 0x9a9aa2 }),
        );
        basin.position.set(cx, 0.9, cz);
        basin.castShadow = true;
        scene.add(basin);
        const pool = new THREE.Mesh(
          new THREE.CircleGeometry(6.4, 20),
          new THREE.MeshLambertMaterial({ color: 0x2a7fa8 }),
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(cx, 1.55, cz);
        scene.add(pool);
        continue;
      }
      if (isPark) {
        for (let t = 0; t < 7; t++) {
          const px = cx + (rng() - 0.5) * 36, pz = cz + (rng() - 0.5) * 36;
          scene.add(makePalm(px, pz, 4 + rng() * 3, rng));
        }
        continue;
      }

      // 1-3 buildings per block
      const count = 1 + Math.floor(rng() * 3);
      const downtown = 1 - (Math.abs(bx) + Math.abs(bz)) / 6; // 1 at centre
      for (let b = 0; b < count; b++) {
        const w = 12 + rng() * 9, d = 12 + rng() * 9;
        const h = 9 + rng() * 18 + downtown * 26;
        const ox = (rng() - 0.5) * (CITY.blockSize - w - 4);
        const oz = (rng() - 0.5) * (CITY.blockSize - d - 4);
        const x = cx + ox, z = cz + oz;
        const tex = facadeVariants[Math.floor(rng() * facadeVariants.length)];
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        building.position.set(x, h / 2 + 0.3, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roofMat);
        roof.position.set(x, h + 0.55, z);
        scene.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
        buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

        // neon sign on tall buildings, facing the nearest road
        if (h > 26 && rng() < 0.65) {
          const word = bx === 3 && bz === 0 ? 'BANK' : SIGN_WORDS[Math.floor(rng() * SIGN_WORDS.length)];
          const color = SIGN_COLORS[Math.floor(rng() * SIGN_COLORS.length)];
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 2.5),
            new THREE.MeshBasicMaterial({ map: signTexture(word, color, '#12081f') }),
          );
          const face = Math.abs(x) > Math.abs(z) ? 'x' : 'z';
          if (face === 'x') {
            sign.position.set(x + (x > 0 ? w / 2 + 0.1 : -w / 2 - 0.1), h * 0.72, z);
            sign.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            sign.position.set(x, h * 0.72, z + (z > 0 ? d / 2 + 0.1 : -d / 2 - 0.1));
            sign.rotation.y = z > 0 ? 0 : Math.PI;
          }
          scene.add(sign);
        }
      }
    }
  }

  // ----- palm trees along the beach -----
  for (let x = -260; x <= 260; x += 26) {
    scene.add(makePalm(x + (rng() - 0.5) * 8, beachZ + 8 + rng() * 14, 5 + rng() * 3, rng));
  }

  // ----- street lamps at intersections -----
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x22242e });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      if ((lx + lz) % 120 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
      pole.position.set(lx + 8, 3, lz + 8);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(lx + 8, 6.1, lz + 8);
      scene.add(bulb);
    }
  }

  // ----- drifting clouds -----
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(40 + rng() * 50, 4, 12 + rng() * 10), cloudMat);
    cloud.position.set((rng() - 0.5) * 700, 130 + rng() * 60, (rng() - 0.5) * 700);
    scene.add(cloud);
  }

  return {
    colliders,
    buildings,
    roadLines: ROAD_LINES,
    spawnPos: { x: -14, z: -14 },
    water,
    waterMat,
    sunLight,
  };
}

function makePalm(x, z, height, rng) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, height, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5a34 }),
  );
  trunk.position.y = height / 2;
  trunk.castShadow = true;
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7a3a, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2 + rng() * 0.4;
    leaf.position.set(Math.cos(a) * 1.2, height + 0.4, Math.sin(a) * 1.2);
    leaf.rotation.z = Math.PI / 2.4;
    leaf.rotation.y = -a;
    leaf.scale.set(1, 1, 0.25);
    group.add(leaf);
  }
  group.position.set(x, 0, z);
  return group;
}
