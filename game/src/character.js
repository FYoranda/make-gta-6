// Solmar Bay — people: the player on foot and the pedestrians.
// One clear job: walk, run, jump, fall, and look alive doing it.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, lerpAngle } from './utils.js';
import { collideCircle } from './world.js';

const SHIRTS = [0x3a6fd8, 0xd81e3f, 0x2ea86a, 0xf2c230, 0x7a4ad8, 0xe87a2e, 0xdddddd, 0x222831];
const PANTS = [0x222831, 0x3a3a4a, 0x5a3a2a, 0x2a4a5a];

/** A simple stylized figure: legs, torso, arms, head, cap. */
export function buildFigureMesh(shirtColor, pantsColor, skinColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor || 0xd8a077 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), pants);
  legL.position.set(-0.13, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
  armL.position.set(-0.37, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.37;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.23, 0.09, 12),
    new THREE.MeshLambertMaterial({ color: 0x222831 }),
  );
  cap.position.y = 1.78;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.12, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x181818 }),
  );
  gun.position.set(0.37, 0.82, 0.22);
  gun.visible = false;

  group.add(legL, legR, torso, armL, armR, head, cap, gun);
  group.userData = { legL, legR, armL, armR, gun };
  return group;
}

export class Player {
  constructor(scene, rng) {
    this.mesh = buildFigureMesh(0x2ea86a, 0x222831);
    this.pos = new THREE.Vector3(14, 0, 14);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.grounded = true;
    this.health = PLAYER.health;
    this.phase = 0;
    this.moving = false;
    this.rng = rng;
    scene.add(this.mesh);
  }

  /** input: {f,b,l,r,run,jump}, camYaw: camera heading. */
  update(dt, input, camYaw, world) {
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = 0, mz = 0;
    if (input.f) mz -= 1;
    if (input.b) mz += 1;
    if (input.l) mx -= 1;
    if (input.r) mx += 1;
    this.moving = mx !== 0 || mz !== 0;
    if (this.moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const wx = mx * cos - mz * sin;
      const wz = mx * sin + mz * cos;
      const p = { x: this.pos.x + wx * speed * dt, z: this.pos.z + wz * speed * dt };
      collideCircle(p, PLAYER.radius, world.colliders);
      p.x = clamp(p.x, -CITY_HALF, CITY_HALF);
      p.z = clamp(p.z, -CITY_HALF, 300);
      this.pos.x = p.x; this.pos.z = p.z;
      this.yaw = lerpAngle(this.yaw, Math.atan2(wx, wz), Math.min(1, dt * 12));
      this.phase += dt * speed * 1.5;
    }
    if (input.jump && this.grounded) {
      this.vy = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    }
    const swing = this.moving && this.grounded ? Math.sin(this.phase) * 0.6 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }
}
const CITY_HALF = 235;

export class Pedestrian {
  constructor(scene, rng) {
    this.rng = rng;
    this.mesh = buildFigureMesh(
      SHIRTS[Math.floor(rng() * SHIRTS.length)],
      PANTS[Math.floor(rng() * PANTS.length)],
    );
    this.pos = new THREE.Vector3((rng() - 0.5) * 360, 0, (rng() - 0.5) * 360);
    this.target = this._pickTarget();
    this.speed = 1.1 + rng() * 0.8;
    this.phase = rng() * 10;
    this.fleeTimer = 0;
    this.fallTimer = 0;
    this.dead = false;
    this.yaw = rng() * Math.PI * 2;
    this.mesh.userData.owner = this;
    scene.add(this.mesh);
    this.mesh.position.copy(this.pos);
  }

  _pickTarget() {
    // walk along a sidewalk: near a road line, inside the city
    const line = [-180, -120, -60, 0, 60, 120, 180][Math.floor(this.rng() * 7)];
    const along = (this.rng() - 0.5) * 360;
    if (this.rng() < 0.5) return { x: line + (this.rng() < 0.5 ? 9 : -9), z: along };
    return { x: along, z: line + (this.rng() < 0.5 ? 9 : -9) };
  }

  fleeFrom(x, z) {
    const dx = this.pos.x - x, dz = this.pos.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.target = { x: this.pos.x + (dx / d) * 60, z: this.pos.z + (dz / d) * 60 };
    this.fleeTimer = 3;
  }

  fall() {
    if (this.dead) return;
    this.dead = true;
    this.fallTimer = 0;
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = 0.3;
  }

  update(dt, world) {
    if (this.dead) {
      this.fallTimer += dt;
      return;
    }
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) { this.target = this._pickTarget(); return; }
    const sp = this.fleeTimer > 0 ? this.speed * 2.6 : this.speed;
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);
    const nx = this.pos.x + (dx / d) * sp * dt;
    const nz = this.pos.z + (dz / d) * sp * dt;
    const p = { x: nx, z: nz };
    collideCircle(p, 0.4, world.colliders);
    this.pos.x = p.x; this.pos.z = p.z;
    this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
    this.phase += dt * sp * 2.2;
    const swing = Math.sin(this.phase) * 0.5;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }
}
