// Solmar Bay — game orchestration: loop, camera, driving, combat, wanted,
// missions, shops, save/load and screenshot staging. One clear job: run it.
import * as THREE from 'three';
import { CITY, ROAD_LINES, VEHICLE_TYPES, WEAPONS, PLAYER, WANTED, SHOP, SAVE_KEY } from './config.js';
import { mulberry32, clamp, lerp, damp, lerpAngle, angleDiff } from './utils.js';
import { SoundBank } from './audio.js';
import { buildWorld, collideCircle, pointInBuilding, circleHits } from './world.js';
import { makeCarMesh, TrafficCar, PoliceCar } from './vehicles.js';
import { Player, Pedestrian } from './character.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';

const TRAFFIC_COUNT = 14;
const PED_COUNT = 22;
const PARKED_COUNT = 6;

class Game {
  constructor() {
    this.rng = mulberry32(20261123);
    this.state = 'menu'; // menu | playing | paused | busted | wasted | complete
    this.cash = 500;
    this.wanted = 0;
    this.lastCrimeAt = -999;
    this.wantedTimer = 0;
    this.bustTimer = 0;
    this.crimeCooldown = 0;
    this.ownedWeapons = ['pistol'];
    this.weapon = 'pistol';
    this.ammo = { pistol: 12, smg: 30, shotgun: 6 };
    this.reserve = { pistol: Infinity, smg: 90, shotgun: 24 };
    this.reloading = 0;
    this.shootCooldown = 0;
    this.muzzle = null;
    this.camYaw = Math.PI * 0.75;
    this.camPitch = 0.34;
    this.camDist = 11;
    this.lastMouseMove = -99;
    this.time = 0;
    this.frames = 0;
    this.shake = 0;
    this.shotMode = null;
    this.interactTarget = null;
    this.nearCar = null;
    this.vanSpawned = false;
    this.marker = null;
    this.markerMesh = null;
    this.gateMeshes = [];
    this.sound = new SoundBank();
    this.hud = new HUD();
    this.input = { f: false, b: false, l: false, r: false, run: false, jump: false };
    this.keys = {};
    this._initThree();
    this._initWorld();
    this._initActors();
    this._initMissions();
    this._initInput();
    this._initMenu();
    this._applyShotParams();
    this.clock = new THREE.Clock();
    this._loop();
  }

  // ---------- setup ----------
  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(60, 40, 90);
    this.muzzle = new THREE.PointLight(0xffc46b, 0, 30);
    this.scene.add(this.muzzle);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initWorld() {
    this.world = buildWorld(this.scene);
    // objective marker beacon
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcf3f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    });
    this.markerMesh = new THREE.Mesh(geo, mat);
    this.markerMesh.visible = false;
    this.scene.add(this.markerMesh);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.35;
    this.markerMesh.add(ring);
  }

  _initActors() {
    this.player = new Player(this.scene, this.rng);
    this.player.pos.set(this.world.spawnPos.x, 0, this.world.spawnPos.z);
    this.traffic = [];
    for (let i = 0; i < TRAFFIC_COUNT; i++) this.traffic.push(new TrafficCar(this.scene, this.rng));
    this.peds = [];
    for (let i = 0; i < PED_COUNT; i++) this.peds.push(new Pedestrian(this.scene, this.rng));
    this.parked = [];
    const parkedKinds = ['sedan', 'taxi', 'pickup', 'van', 'sports', 'sedan'];
    for (let i = 0; i < PARKED_COUNT; i++) {
      const kind = parkedKinds[i];
      const mesh = makeCarMesh(kind);
      const line = ROAD_LINES[i % ROAD_LINES.length];
      const along = -150 + i * 55;
      const horizontal = i % 2 === 0;
      const x = horizontal ? along : line + 8;
      const z = horizontal ? line + 8 : along;
      mesh.position.set(x, 0, z);
      mesh.rotation.y = horizontal ? Math.PI / 2 : 0;
      mesh.userData.owner = null;
      this.scene.add(mesh);
      const car = { mesh, kind, x, z, yaw: mesh.rotation.y, health: 100, parked: true };
      mesh.userData.owner = car;
      this.parked.push(car);
    }
    this.police = [];
    this.playerCar = null;
  }

  _initMissions() {
    this.missions = new MissionManager({
      onObjective: (html) => this.hud.setObjective(html),
      onMarker: (pos) => {
        this.marker = pos;
        this.markerMesh.visible = !!pos;
        if (pos) this.markerMesh.position.set(pos.x, 15, pos.z);
      },
      onGates: (gates) => {
        for (const g of this.gateMeshes) this.scene.remove(g);
        this.gateMeshes = [];
        if (!gates) return;
        for (const g of gates) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(5, 0.45, 10, 28),
            new THREE.MeshBasicMaterial({ color: 0xff9f1c }),
          );
          ring.position.set(g.x, 3, g.z);
          this.scene.add(ring);
          this.gateMeshes.push(ring);
        }
      },
      onCash: (n) => { this.cash += n; this.hud.setCash(this.cash); this.sound.cash(); },
      onWanted: (n) => this.addWanted(n, true),
      onMessage: (t) => this.hud.toast(t),
      onStoryComplete: () => {
        this.sound.missionComplete();
        this._showOverlay('complete');
        this.state = 'complete';
        document.exitPointerLock?.();
      },
    });
  }

  _initInput() {
    const keyMap = {
      KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
      KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
      ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys[e.code] = true;
      const k = keyMap[e.code];
      if (k) this.input[k] = true;
      if (e.code === 'KeyF' && this.state === 'playing') this._tryEnterExitCar();
      if (e.code === 'KeyE' && this.state === 'playing') this._tryInteract();
      if (e.code === 'KeyR' && this.state === 'playing') this._reload();
      if (e.code === 'Digit1') this._switchWeapon('pistol');
      if (e.code === 'Digit2') this._switchWeapon('smg');
      if (e.code === 'Digit3') this._switchWeapon('shotgun');
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      const k = keyMap[e.code];
      if (k) this.input[k] = false;
    });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.shotMode) {
        this._lockPointer();
        this.sound.resume();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && !this.shotMode) {
        this._pause();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas && this.state === 'playing') {
        this.camYaw -= e.movementX * 0.0032;
        this.camPitch = clamp(this.camPitch + e.movementY * 0.0028, 0.06, 1.05);
        this.lastMouseMove = this.time;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.state === 'playing' && document.pointerLockElement === canvas) {
        this._shoot();
      }
    });
    canvas.addEventListener('wheel', (e) => {
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 1.5, 5, 16);
    }, { passive: true });
  }

  _initMenu() {
    const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
    const hasSave = !!localStorage.getItem(SAVE_KEY);
    show('btn-continue', hasSave);
    document.getElementById('loading').textContent = '';
    document.getElementById('btn-new').addEventListener('click', () => {
      this.sound.resume(); this.sound.uiClick(); this.sound.setMusic(true);
      this._startGame(true);
    });
    document.getElementById('btn-continue').addEventListener('click', () => {
      this.sound.resume(); this.sound.uiClick(); this.sound.setMusic(true);
      this._startGame(false);
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.sound.uiClick();
      show('pause', false);
      this.state = 'playing';
      this._lockPointer();
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      this.sound.uiClick(); this.sound.setMusic(false);
      show('pause', false); show('menu', true);
      this.state = 'menu';
    });
    document.getElementById('btn-busted').addEventListener('click', () => {
      this.sound.uiClick(); this._respawn();
    });
    document.getElementById('btn-wasted').addEventListener('click', () => {
      this.sound.uiClick(); this._respawn();
    });
    document.getElementById('btn-free').addEventListener('click', () => {
      this.sound.uiClick();
      show('complete', false);
      this.state = 'playing';
      this._lockPointer();
    });
  }

  /** Request pointer lock without ever logging an unhandled rejection. */
  _lockPointer() {
    try {
      const p = this.renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { /* lock unavailable */ });
    } catch (e) { /* pointer lock unavailable */ }
  }

  _showOverlay(id) {
    for (const o of ['menu', 'pause', 'busted', 'wasted', 'complete']) {
      document.getElementById(o).classList.toggle('hidden', o !== id);
    }
    if (!id) {
      for (const o of ['menu', 'pause', 'busted', 'wasted', 'complete']) {
        document.getElementById(o).classList.add('hidden');
      }
    }
  }

  // ---------- game flow ----------
  _startGame(fresh) {
    if (!fresh) this._loadSave();
    else {
      this.cash = 500; this.ownedWeapons = ['pistol']; this.weapon = 'pistol';
      this.ammo = { pistol: 12, smg: 30, shotgun: 6 };
      this.reserve = { pistol: Infinity, smg: 90, shotgun: 24 };
    }
    this.wanted = 0; this.bustTimer = 0;
    this.player.health = PLAYER.health;
    this.player.pos.set(this.world.spawnPos.x, 0, this.world.spawnPos.z);
    this._showOverlay(null);
    document.getElementById('hud').classList.remove('hidden');
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setWanted(0);
    this.hud.setWeapon(WEAPONS[this.weapon].name, this.ammo[this.weapon], this.reserve[this.weapon]);
    this.state = 'playing';
    this.missions.start(fresh ? 0 : (this._saveMissionIndex ?? 0));
    if (!this.shotMode) this._lockPointer();
  }

  _pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this._showOverlay('pause');
  }

  _respawn() {
    this.cash = Math.max(0, this.cash - WANTED.fine);
    this.wanted = 0;
    this.bustTimer = 0;
    this.player.health = PLAYER.health;
    this.player.pos.set(SHOP.safehousePos[0], 0, SHOP.safehousePos[1]);
    this._clearPolice();
    if (this.playerCar) { this._exitCar(); }
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setWanted(0);
    this._showOverlay(null);
    this.state = 'playing';
    if (!this.shotMode) this._lockPointer();
  }

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, missionIndex: this.missions.index,
        ownedWeapons: this.ownedWeapons, ammo: this.ammo, reserve: this.reserve,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  _loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s) { this._saveMissionIndex = 0; return; }
      this.cash = s.cash ?? 500;
      this._saveMissionIndex = Math.min(s.missionIndex ?? 0, 4);
      this.ownedWeapons = s.ownedWeapons || ['pistol'];
      this.ammo = s.ammo || this.ammo;
      this.reserve = s.reserve || this.reserve;
      this.weapon = this.ownedWeapons[0];
    } catch (e) { this._saveMissionIndex = 0; }
  }

  // ---------- wanted / police ----------
  addWanted(n, silent) {
    if (this.state !== 'playing' && !silent) return;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.lastCrimeAt = this.time;
    this.wantedTimer = 0;
    if (this.wanted > before) this.sound.wantedUp();
    this.hud.setWanted(this.wanted);
    this._syncPolice();
  }

  _syncPolice() {
    const want = this.wanted > 0 ? Math.min(this.wanted, WANTED.maxPolice) : 0;
    const anchor = this._interactPoint();
    while (this.police.length < want) {
      const p = new PoliceCar(this.scene);
      const angle = this.rng() * Math.PI * 2;
      const px = clamp(anchor.x + Math.cos(angle) * 90, -180, 180);
      const pz = clamp(anchor.z + Math.sin(angle) * 90, -180, 180);
      p.spawnAt(px, pz, this.rng() * Math.PI * 2);
      this.police.push(p);
    }
    while (this.police.length > want) {
      const p = this.police.pop();
      this.scene.remove(p.mesh);
    }
  }

  _clearPolice() {
    for (const p of this.police) this.scene.remove(p.mesh);
    this.police = [];
  }

  // ---------- cars ----------
  _nearestCar(maxDist) {
    const px = this.player.pos.x, pz = this.player.pos.z;
    let best = null, bestD = maxDist;
    const check = (car) => {
      const d = Math.hypot(car.x - px, car.z - pz);
      if (d < bestD) { bestD = d; best = car; }
    };
    for (const c of this.parked) check(c);
    for (const t of this.traffic) {
      if (t.dead) continue;
      check({ x: t.mesh.position.x, z: t.mesh.position.z, traffic: t });
    }
    return best;
  }

  _tryEnterExitCar() {
    if (this.playerCar) { this._exitCar(); return; }
    const car = this._nearestCar(4.5);
    if (!car) return;
    this.sound.uiClick();
    if (car.traffic) {
      const t = car.traffic;
      this.traffic = this.traffic.filter((c) => c !== t);
      this.playerCar = { mesh: t.mesh, kind: t.kind, x: t.mesh.position.x, z: t.mesh.position.z, yaw: t.mesh.rotation.y, speed: 0, steer: 0, health: t.health };
      this.playerCar.mesh.userData.owner = this.playerCar;
    } else {
      this.parked = this.parked.filter((c) => c !== car);
      this.playerCar = { mesh: car.mesh, kind: car.kind, x: car.x, z: car.z, yaw: car.yaw, speed: 0, steer: 0, health: car.health };
      this.playerCar.mesh.userData.owner = this.playerCar;
    }
    this.player.mesh.visible = false;
    this.addWanted(1);
    this.hud.toast(`You stole a ${VEHICLE_TYPES[this.playerCar.kind].label}!`);
    this.hud.setCrosshair(false);
  }

  _exitCar() {
    const car = this.playerCar;
    if (!car) return;
    car.x = car.mesh.position.x; car.z = car.mesh.position.z;
    this.player.pos.set(car.x + Math.cos(car.yaw + Math.PI / 2) * 2.5, 0, car.z - Math.sin(car.yaw + Math.PI / 2) * 2.5);
    this.player.mesh.visible = true;
    this.playerCar = null;
    this.parked.push({ mesh: car.mesh, kind: car.kind, x: car.x, z: car.z, yaw: car.yaw, health: car.health, parked: true });
    this.hud.setCarHealth(null);
    this.hud.setCrosshair(true);
  }

  _updateDriving(dt) {
    const car = this.playerCar;
    const spec = VEHICLE_TYPES[car.kind];
    const cruise = this.shotMode ? 1 : 0; // staged screenshots keep rolling
    const fwd = (this.input.f || cruise) ? 1 : 0;
    const back = this.input.b ? 1 : 0;
    if (fwd) car.speed += spec.accel * dt;
    else if (back) car.speed -= (car.speed > 0.5 ? spec.accel * 1.4 : spec.accel * 0.6) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
    if (this.input.jump) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = clamp(car.speed, -14, spec.topSpeed);
    if (this.shotMode) car.speed = Math.min(car.speed, 20);
    const steerTarget = (this.input.l ? 1 : 0) - (this.input.r ? 1 : 0);
    car.steer = lerp(car.steer, steerTarget, Math.min(1, dt * 7));
    const spd = Math.abs(car.speed);
    car.yaw += car.steer * spec.grip * (spd / spec.topSpeed) * dt * Math.sign(car.speed || 1) * 0.9;
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const p = { x: nx, z: nz };
    const hitWall = collideCircle(p, 2.3, this.world.colliders);
    if (hitWall && spd > 12) {
      car.health -= (spd - 12) * 1.4;
      this.player.health = Math.max(0, this.player.health - (spd - 12) * 0.8);
      this.sound.crash();
      this.hud.damageFlash();
      this.shake = 0.5;
      car.speed *= 0.35;
    }
    car.x = clamp(p.x, -235, 235);
    car.z = clamp(p.z, -235, 300);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    car.mesh.rotation.z = -car.steer * 0.06 * Math.min(1, spd / 20);
    for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed * dt) / 0.38;
    this.sound.engine(Math.abs(car.speed) / spec.topSpeed, true);
    this.hud.setSpeed(Math.abs(car.speed) * 3.6, true);
    this.hud.setCarHealth(car.health);
    if (car.health <= 0) this._wasted();
    // run over pedestrians
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.pos.x - car.x, ped.pos.z - car.z) < 2.4 && spd > 3) {
        ped.fall();
        this.addWanted(1);
        this.sound.crash();
        car.speed *= 0.85;
      }
    }
    // bump traffic
    for (const t of this.traffic) {
      if (t.dead) continue;
      const d = Math.hypot(t.mesh.position.x - car.x, t.mesh.position.z - car.z);
      if (d < 3.6 && spd > 4) {
        t.damage(25);
        car.health -= 4;
        this.sound.crash();
        this.shake = 0.3;
        car.speed *= 0.7;
      }
    }
  }

  // ---------- combat ----------
  _switchWeapon(name) {
    if (!this.ownedWeapons.includes(name) || this.state !== 'playing') return;
    this.weapon = name;
    this.reloading = 0;
    this.player.mesh.userData.gun.visible = true;
    this.hud.setWeapon(WEAPONS[name].name, this.ammo[name], this.reserve[name]);
    this.sound.uiClick();
  }

  _reload() {
    const w = WEAPONS[this.weapon];
    if (this.reloading > 0 || this.ammo[this.weapon] >= w.mag) return;
    if (this.reserve[this.weapon] <= 0) { this.hud.toast('Out of ammo — visit the gun shop!'); return; }
    this.reloading = w.reload;
    this.sound.uiClick();
  }

  _shoot() {
    if (this.playerCar || this.reloading > 0 || this.shootCooldown > 0) return;
    const w = WEAPONS[this.weapon];
    if (this.ammo[this.weapon] <= 0) { this._reload(); return; }
    this.ammo[this.weapon]--;
    this.shootCooldown = w.rate;
    this.sound.gunshot();
    this.muzzle.intensity = 60;
    this.muzzle.position.copy(this.player.pos).add(new THREE.Vector3(0, 1.5, 0));
    this.hud.setWeapon(w.name, this.ammo[this.weapon], this.reserve[this.weapon]);
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const ray = new THREE.Raycaster();
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      dir.x += (Math.random() - 0.5) * w.spread * 2;
      dir.y += (Math.random() - 0.5) * w.spread * 2;
      dir.normalize();
      ray.set(this.camera.position, dir);
      ray.far = w.range;
      const targets = [];
      for (const t of this.traffic) if (!t.dead) targets.push(t.mesh);
      for (const p of this.police) if (!p.dead) targets.push(p.mesh);
      for (const p of this.peds) if (!p.dead) targets.push(p.mesh);
      const hits = ray.intersectObjects(targets, true);
      if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj && !obj.userData.owner) obj = obj.parent;
        const owner = obj ? obj.userData.owner : null;
        if (owner) {
          this.sound.hit();
          if (owner instanceof Pedestrian) {
            owner.fall();
            this.addWanted(1);
          } else if (owner instanceof TrafficCar) {
            if (owner.damage(w.damage)) this.addWanted(1);
          } else if (owner instanceof PoliceCar) {
            if (owner.damage(w.damage)) { this.addWanted(1); this._syncPolice(); }
            else this.addWanted(1);
          } else if (owner && owner.kind) {
            owner.health -= w.damage;
            this.addWanted(1);
          }
        }
        break;
      }
    }
    if (this.ammo[this.weapon] === 0) this._reload();
  }

  _wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.sound.setMusic(false);
    this.sound.engine(0, false);
    document.exitPointerLock?.();
    this._showOverlay('wasted');
  }

  // ---------- interact ----------
  _interactPoint() {
    const p = this.playerCar
      ? { x: this.playerCar.x, z: this.playerCar.z }
      : { x: this.player.pos.x, z: this.player.pos.z };
    return p;
  }

  _tryInteract() {
    const t = this.interactTarget;
    if (!t) return;
    if (t.kind === 'mission-pickup') {
      this._missionInteract = true;
      this.sound.pickup();
      return;
    }
    if (t.kind === 'shop') {
      const next = this.ownedWeapons.includes('smg') ? 'shotgun' : 'smg';
      if (!this.ownedWeapons.includes(next)) {
        const price = WEAPONS[next].price;
        if (this.cash >= price) {
          this.cash -= price;
          this.ownedWeapons.push(next);
          this._switchWeapon(next);
          this.hud.setCash(this.cash);
          this.hud.toast(`Bought the ${WEAPONS[next].name}!`);
          this.sound.cash();
        } else {
          this.hud.toast(`Need $${price} for the ${WEAPONS[next].name}.`);
        }
      } else if (this.cash >= SHOP.ammoPrice) {
        this.cash -= SHOP.ammoPrice;
        this.reserve.smg = Math.min(300, this.reserve.smg + 90);
        this.reserve.shotgun = Math.min(120, this.reserve.shotgun + 24);
        this.hud.setCash(this.cash);
        this.hud.toast('Ammo restocked.');
        this.sound.pickup();
      } else {
        this.hud.toast('Not enough cash for ammo.');
      }
      return;
    }
    if (t.kind === 'safehouse') {
      let spent = false;
      if (this.playerCar && this.playerCar.health < 100 && this.cash >= SHOP.repairPrice) {
        this.cash -= SHOP.repairPrice;
        this.playerCar.health = 100;
        spent = true;
      }
      this.player.health = PLAYER.health;
      this.hud.setHealth(this.player.health);
      this._save();
      this.hud.setCash(this.cash);
      this.hud.toast(spent ? 'Car repaired and game saved.' : 'Game saved. You feel fresh.');
      this.sound.pickup();
    }
  }

  // ---------- screenshot staging ----------
  _applyShotParams() {
    const q = new URLSearchParams(window.location.search);
    const shot = q.get('shot');
    if (!shot) return;
    this.shotMode = shot;
    const start = (fn) => {
      this._startGame(true);
      fn();
      this.state = 'playing';
      this._showOverlay(null);
      document.getElementById('hud').classList.remove('hidden');
    };
    if (shot === 'cover') {
      start(() => {
        this._enterParkedKind('sports', -60, 0, Math.PI / 2);
        this.playerCar.speed = 18;
        this.camYaw = Math.PI / 2;
        this.camPitch = 0.38;
        this.camDist = 13;
        this.addWanted(3, true);
        this.missions.start(2);
        this.hud.toast('HOT PURSUIT — lose the cops!');
      });
    } else if (shot === 'drive') {
      start(() => {
        this._enterParkedKind('sedan', -170, 0, Math.PI / 2);
        this.playerCar.speed = 18;
        this.camYaw = Math.PI / 2;
        this.camPitch = 0.38;
        this.camDist = 15;
        this.missions.start(0);
      });
    } else if (shot === 'foot') {
      start(() => {
        this.player.pos.set(-14, 0, -14);
        if (!this.ownedWeapons.includes('smg')) this.ownedWeapons.push('smg');
        this._switchWeapon('smg');
        this.ammo.smg = 30;
        this.camYaw = 2.4;
        this.camPitch = 0.32;
        this.camDist = 7.5;
        this.addWanted(1, true);
        this.missions.start(1);
        this.hud.setCrosshair(true);
      });
    } else if (shot === 'race') {
      start(() => {
        this._enterParkedKind('sports', -170, 0, Math.PI / 2);
        this.playerCar.speed = 18;
        this.camYaw = Math.PI / 2;
        this.camPitch = 0.38;
        this.camDist = 15;
        this.missions.start(3);
      });
    }
  }

  _enterParkedKind(kind, x, z, yaw) {
    const mesh = makeCarMesh(kind);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    const car = { mesh, kind, x, z, yaw, speed: 0, steer: 0, health: 100 };
    mesh.userData.owner = car;
    this.playerCar = car;
    this.player.mesh.visible = false;
  }

  // ---------- per-frame ----------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.frames++;
    if (this.state === 'playing') this._update(dt);
    else if (this.state === 'menu') {
      // slow orbit around the plaza behind the menu
      const a = this.time * 0.05;
      this.camera.position.set(Math.cos(a) * 90, 42, Math.sin(a) * 90);
      this.camera.lookAt(0, 8, 0);
    }
    // water shimmer + marker pulse
    if (this.world.water) this.world.water.position.y = 0.06 + Math.sin(this.time * 0.8) * 0.02;
    if (this.markerMesh.visible) {
      this.markerMesh.rotation.y += dt * 0.8;
      this.markerMesh.material.opacity = 0.2 + 0.12 * Math.sin(this.time * 4);
    }
    for (const g of this.gateMeshes) g.rotation.y += dt * 0.5;
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 400);
    this.renderer.render(this.scene, this.camera);
    if (this.shotMode && this.frames === 45) window.__shotReady = true;
  }

  _update(dt) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = WEAPONS[this.weapon];
        const need = w.mag - this.ammo[this.weapon];
        const take = Math.min(need, this.reserve[this.weapon] === Infinity ? need : this.reserve[this.weapon]);
        this.ammo[this.weapon] += take;
        if (this.reserve[this.weapon] !== Infinity) this.reserve[this.weapon] -= take;
        this.hud.setWeapon(w.name, this.ammo[this.weapon], this.reserve[this.weapon]);
      }
    }
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);

    // mission 5: spawn the armored van when its steal step begins
    if (!this.vanSpawned && this.missions.active && this.missions.index === 4) {
      this.vanSpawned = true;
      const mesh = makeCarMesh('armored');
      mesh.position.set(0, 0, -180);
      mesh.rotation.y = 0;
      this.scene.add(mesh);
      const van = { mesh, kind: 'armored', x: 0, z: -180, yaw: 0, health: 200, parked: true };
      mesh.userData.owner = van;
      this.parked.push(van);
    }

    // player / car
    if (this.playerCar) {
      this._updateDriving(dt);
    } else {
      this.player.update(dt, this.input, this.camYaw, this.world);
      this.sound.engine(0, false);
      this.hud.setSpeed(0, false);
      this.hud.setCarHealth(null);
      this.hud.setCrosshair(true);
      if (this.player.health < PLAYER.health && this.wanted === 0) {
        this.player.health = Math.min(PLAYER.health, this.player.health + dt * 2);
        this.hud.setHealth(this.player.health);
      }
      if (this.player.health <= 0) this._wasted();
    }

    // near-car prompt + interact prompt
    this.nearCar = this.playerCar ? null : this._nearestCar(4.5);
    const p = this._interactPoint();
    let interact = null;
    if (!this.playerCar && this.marker && this.missions.active) {
      const s = this.missions.mission.steps[this.missions.step];
      if (s && s.type === 'pickup' && Math.hypot(p.x - s.pos[0], p.z - s.pos[1]) < 5) {
        interact = { kind: 'mission-pickup', text: 'Press <b>E</b> — grab the package' };
      }
    }
    if (!interact && Math.hypot(p.x - SHOP.gunPos[0], p.z - SHOP.gunPos[1]) < 7) {
      const next = this.ownedWeapons.includes('smg') ? 'shotgun' : 'smg';
      const label = this.ownedWeapons.includes(next) ? `Buy ammo $${SHOP.ammoPrice}` : `Buy ${WEAPONS[next].name} $${WEAPONS[next].price}`;
      interact = { kind: 'shop', text: `Press <b>E</b> — ${label}` };
    }
    if (!interact && Math.hypot(p.x - SHOP.safehousePos[0], p.z - SHOP.safehousePos[1]) < 7) {
      interact = { kind: 'safehouse', text: 'Press <b>E</b> — repair & save' };
    }
    if (!interact && this.nearCar) {
      interact = { kind: 'car', text: `Press <b>F</b> — steal the ${VEHICLE_TYPES[this.nearCar.kind || this.nearCar.traffic?.kind].label}` };
    }
    this.interactTarget = interact && interact.kind !== 'car' ? interact : null;
    this.hud.showInteract(interact ? interact.text : null);

    // traffic + peds
    for (const t of this.traffic) t.update(dt);
    // respawn destroyed traffic to keep the streets alive
    this.traffic = this.traffic.filter((t) => {
      if (t.dead) { this.scene.remove(t.mesh); return false; }
      return true;
    });
    while (this.traffic.length < TRAFFIC_COUNT) this.traffic.push(new TrafficCar(this.scene, this.rng));
    for (const ped of this.peds) {
      ped.update(dt, this.world);
      // flee from a fast player car
      if (this.playerCar && Math.abs(this.playerCar.speed) > 6) {
        if (Math.hypot(ped.pos.x - this.playerCar.x, ped.pos.z - this.playerCar.z) < 9) {
          ped.fleeFrom(this.playerCar.x, this.playerCar.z);
        }
      }
    }
    this.peds = this.peds.filter((ped) => {
      if (ped.dead && ped.fallTimer > 8) { this.scene.remove(ped.mesh); return false; }
      return true;
    });
    while (this.peds.length < PED_COUNT) this.peds.push(new Pedestrian(this.scene, this.rng));

    // police
    const target = this.playerCar
      ? { x: this.playerCar.x, z: this.playerCar.z }
      : { x: this.player.pos.x, z: this.player.pos.z };
    for (const pc of this.police) pc.update(dt, target, this.world, this.time);
    this.police = this.police.filter((pc) => {
      if (pc.dead) { this.scene.remove(pc.mesh); return false; }
      return true;
    });
    this.sound.siren(this.police.length > 0 && this.wanted > 0);

    // wanted decay + bust
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      let nearestPolice = Infinity;
      for (const pc of this.police) {
        nearestPolice = Math.min(nearestPolice, Math.hypot(pc.x - target.x, pc.z - target.z));
      }
      if (this.time - this.lastCrimeAt > WANTED.decaySeconds && nearestPolice > 45) {
        this.wanted--;
        this.wantedTimer = 0;
        this.lastCrimeAt = this.time;
        this.hud.setWanted(this.wanted);
        this._syncPolice();
        if (this.wanted === 0) this.hud.toast('You lost the cops.');
      }
      if (!this.playerCar && nearestPolice < WANTED.bustDistance) {
        this.bustTimer += dt;
        if (this.bustTimer > WANTED.bustSeconds) {
          this.state = 'busted';
          this.sound.setMusic(false);
          document.exitPointerLock?.();
          this._showOverlay('busted');
        }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
    }
    this.hud.setWantedFlash(this.wanted >= 3, this.time);

    // missions
    this.missions.update(dt, {
      x: target.x, z: target.z,
      inCar: !!this.playerCar,
      carKind: this.playerCar ? this.playerCar.kind : null,
      interact: !!this._missionInteract,
    });
    this._missionInteract = false;

    // camera
    this._updateCamera(dt);
    this.hud.tick(dt);
    this.hud.drawMinimap({
      x: target.x, z: target.z,
      yaw: this.playerCar ? this.playerCar.yaw : this.player.yaw,
      buildings: this.world.buildings,
      roadLines: ROAD_LINES,
      marker: this.marker,
      gates: this.missions.active && this.missions.mission.steps[this.missions.step]?.type === 'gates'
        ? this.missions.mission.steps[this.missions.step].gates.map(([x, z]) => ({ x, z }))
        : null,
      police: this.police.map((p) => ({ x: p.x, z: p.z })),
      traffic: this.traffic.map((t) => ({ x: t.mesh.position.x, z: t.mesh.position.z })),
      peds: this.peds.filter((p) => !p.dead).map((p) => ({ x: p.pos.x, z: p.pos.z })),
    });
    if (this.state === 'playing' && this.missions.active) {
      this.saveTimer = (this.saveTimer || 0) + dt;
      if (this.saveTimer > 5) { this.saveTimer = 0; this._save(); }
    }
    this.shake = Math.max(0, this.shake - dt);
  }

  _updateCamera(dt) {
    const target = this.playerCar
      ? new THREE.Vector3(this.playerCar.x, 1.4, this.playerCar.z)
      : new THREE.Vector3(this.player.pos.x, 1.7, this.player.pos.z);
    // when driving, the camera drifts back behind the car unless the mouse moved lately
    if (this.playerCar && this.time - this.lastMouseMove > 1.5) {
      this.camYaw = lerpAngle(this.camYaw, this.playerCar.yaw, Math.min(1, dt * 1.2));
    }
    const dist = this.playerCar ? this.camDist + 2 : this.camDist;
    const pitch = this.camPitch;
    // camYaw is the look direction (camera -> target); the camera sits behind it
    const dir = new THREE.Vector3(
      -Math.sin(this.camYaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(this.camYaw) * Math.cos(pitch),
    );
    // pull the camera in until it clears every building (no wall clipping)
    let useDist = dist;
    for (const f of [1, 0.85, 0.7, 0.55, 0.4, 0.28]) {
      const cand = target.clone().addScaledVector(dir, dist * f);
      if (cand.y < 0.8) continue;
      if (!pointInBuilding(cand.x, cand.z, this.world.colliders)) { useDist = dist * f; break; }
      useDist = dist * f;
    }
    const desired = target.clone().addScaledVector(dir, useDist);
    if (this.shotMode && this.frames < 130) {
      this.camera.position.copy(desired);
    } else {
      this.camera.position.x = damp(this.camera.position.x, desired.x, 9, dt);
      this.camera.position.y = damp(this.camera.position.y, desired.y, 9, dt);
      this.camera.position.z = damp(this.camera.position.z, desired.z, 9, dt);
    }
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    this.camera.lookAt(target);
  }
}

try {
  const game = new Game();
  window.__solmar = game;
  document.getElementById('loading').textContent = '';
} catch (err) {
  document.getElementById('loading').textContent = `Failed to start: ${err.message}`;
  console.error(err);
}
