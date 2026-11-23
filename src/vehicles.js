// Solmar Bay — vehicles: car meshes, traffic AI and police pursuit.
// One clear job: everything with four wheels.
import * as THREE from 'three';
import { VEHICLE_TYPES, ROAD_LINES } from './config.js';
import { lerp, lerpAngle, angleDiff, clamp } from './utils.js';
import { circleHits } from './world.js';

const PAINTS = [0x3a6fd8, 0xd81e3f, 0xf2c230, 0x2ea86a, 0xe8e8e8, 0x222831, 0x8a5a2e, 0x7a4ad8];

/** Build a low-poly car. Forward is +z. userData holds wheels + kind. */
export function makeCarMesh(kind, colorHex) {
  const spec = VEHICLE_TYPES[kind];
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex ?? spec.color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x101826 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x151515 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, 0.62, spec.length), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width * 0.86, 0.55, spec.length * 0.48),
    kind === 'armored' ? paint : glass,
  );
  cabin.position.set(0, 1.18, -spec.length * 0.08);
  cabin.castShadow = true;
  group.add(cabin);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  for (const [wx, wz] of [
    [-spec.width / 2, spec.length * 0.32], [spec.width / 2, spec.length * 0.32],
    [-spec.width / 2, -spec.length * 0.32], [spec.width / 2, -spec.length * 0.32],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  // headlights + taillights (emissive, so they glow at sunset)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), headMat);
    head.position.set(sx * spec.width * 0.32, 0.72, spec.length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailMat);
    tail.position.set(sx * spec.width * 0.32, 0.72, -spec.length / 2 - 0.02);
    group.add(tail);
  }

  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }),
    );
    sign.position.set(0, 1.55, -spec.length * 0.08);
    group.add(sign);
  }
  if (kind === 'police') {
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    );
    red.position.set(-0.3, 1.52, -spec.length * 0.08);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2050ff }),
    );
    blue.position.set(0.3, 1.52, -spec.length * 0.08);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width + 0.02, 0.2, spec.length * 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    stripe.position.set(0, 0.62, 0);
    group.add(stripe);
  }

  group.userData.wheels = wheels;
  group.userData.kind = kind;
  return group;
}

/** A traffic car cruising the road grid, turning at intersections. */
export class TrafficCar {
  constructor(scene, rng, kind) {
    const kinds = ['sedan', 'taxi', 'pickup', 'van', 'sports'];
    this.kind = kind || kinds[Math.floor(rng() * kinds.length)];
    this.mesh = makeCarMesh(this.kind, PAINTS[Math.floor(rng() * PAINTS.length)]);
    this.axis = rng() < 0.5 ? 'x' : 'z';
    this.line = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
    this.s = (rng() - 0.5) * 360;
    this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = 8 + rng() * 6;
    this.health = 100;
    this.dead = false;
    this.turnCooldown = 0;
    this.rng = rng;
    this.mesh.userData.owner = this;
    scene.add(this.mesh);
    this._sync(0);
  }

  _targetYaw() {
    if (this.axis === 'x') return this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return this.dir > 0 ? 0 : Math.PI;
  }

  _sync(dt) {
    const x = this.axis === 'x' ? this.s : this.line;
    const z = this.axis === 'x' ? this.line : this.s;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, this._targetYaw(), Math.min(1, dt * 6 + 0.2));
    for (const w of this.mesh.userData.wheels) w.rotation.x += (this.speed * dt) / 0.38;
  }

  update(dt) {
    if (this.dead) return;
    this.turnCooldown = Math.max(0, this.turnCooldown - dt);
    this.s += this.dir * this.speed * dt;
    if (this.s > 180) { this.s = 180; this.dir = -1; }
    if (this.s < -180) { this.s = -180; this.dir = 1; }
    // maybe turn at an intersection
    const nearest = Math.round(this.s / 60) * 60;
    if (this.turnCooldown <= 0 && Math.abs(this.s - nearest) < this.speed * dt * 1.5 && this.rng() < 0.3) {
      const oldLine = this.line;
      this.line = nearest;
      this.s = oldLine;
      this.axis = this.axis === 'x' ? 'z' : 'x';
      this.dir = this.rng() < 0.5 ? 1 : -1;
      this.turnCooldown = 2;
    }
    this._sync(dt);
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.z = 0.12;
      return true;
    }
    return false;
  }
}

/** A police interceptor that chases a target position. */
export class PoliceCar {
  constructor(scene) {
    this.kind = 'police';
    this.mesh = makeCarMesh('police');
    this.x = 0; this.z = 0;
    this.yaw = 0;
    this.speed = 0;
    this.health = 120;
    this.dead = false;
    this.flash = 0;
    this.mesh.userData.owner = this;
    scene.add(this.mesh);
  }

  spawnAt(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.speed = 12;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;
  }

  update(dt, target, world, time) {
    if (this.dead) return;
    const dx = target.x - this.x, dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    const turn = clamp(angleDiff(this.yaw, desired), -2.4 * dt, 2.4 * dt);
    this.yaw += turn;
    const want = dist > 6 ? 36 : 20;
    this.speed = lerp(this.speed, want, Math.min(1, dt * 0.8));
    const nx = this.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    if (!circleHits(nx, nz, 2.3, world.colliders)) {
      this.x = nx; this.z = nz;
    } else if (!circleHits(nx, this.z, 2.3, world.colliders)) {
      this.x = nx;
    } else if (!circleHits(this.x, nz, 2.3, world.colliders)) {
      this.z = nz;
    } else {
      this.speed *= 0.4;
      this.yaw += 1.2 * dt;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    for (const w of this.mesh.userData.wheels) w.rotation.x += (this.speed * dt) / 0.38;
    // flashing light bar
    this.flash += dt * 9;
    const on = Math.sin(this.flash) > 0;
    if (this.mesh.userData.lightRed) {
      this.mesh.userData.lightRed.material.color.setHex(on ? 0xff2020 : 0x551010);
      this.mesh.userData.lightBlue.material.color.setHex(on ? 0x101050 : 0x2050ff);
    }
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.z = 0.12;
      return true;
    }
    return false;
  }
}
