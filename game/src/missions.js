// Solmar Bay — story missions: five jobs, cash rewards, one arc.
// One clear job: turn mission definitions into objectives and payouts.
import { MISSIONS } from './config.js';

export class MissionManager {
  constructor(hooks) {
    this.hooks = hooks; // {onObjective, onMarker, onGates, onCash, onWanted, onMessage, onStoryComplete}
    this.index = 0;
    this.step = 0;
    this.active = false;
    this.gateIndex = 0;
    this.gateTimer = 0;
    this.finished = false;
  }

  get mission() { return MISSIONS[this.index]; }

  start(index) {
    this.index = index;
    this.step = 0;
    this.gateIndex = 0;
    this.finished = index >= MISSIONS.length;
    this.active = !this.finished;
    if (!this.active) return;
    const m = this.mission;
    if (m.wantedAtStart) this.hooks.onWanted(m.wantedAtStart);
    this.hooks.onMessage(`${m.title} — $${m.reward}`);
    this._enterStep();
  }

  _enterStep() {
    const m = this.mission;
    const s = m.steps[this.step];
    if (!s) { this._complete(); return; }
    this.hooks.onObjective(`<b>JOB ${this.index + 1} — ${m.title}</b><br>${s.text}`);
    if (s.type === 'goto' || s.type === 'pickup' || s.type === 'steal-van') {
      this.hooks.onMarker({ x: s.pos[0], z: s.pos[1] });
      this.hooks.onGates(null);
    } else if (s.type === 'gates') {
      this.gateIndex = 0;
      this.gateTimer = s.time;
      this.hooks.onMarker({ x: s.gates[0][0], z: s.gates[0][1] });
      this.hooks.onGates(s.gates.map(([x, z]) => ({ x, z })));
    } else {
      this.hooks.onMarker(null);
      this.hooks.onGates(null);
    }
  }

  _nextStep() {
    this.step++;
    this._enterStep();
  }

  _complete() {
    const m = this.mission;
    this.hooks.onCash(m.reward);
    this.hooks.onMessage(`${m.title} COMPLETE — +$${m.reward}`);
    this.hooks.onMarker(null);
    this.hooks.onGates(null);
    this.index++;
    if (this.index >= MISSIONS.length) {
      this.finished = true;
      this.active = false;
      this.hooks.onObjective('<b>STORY COMPLETE</b><br>Solmar Bay is yours. Free roam is open.');
      this.hooks.onStoryComplete();
      return;
    }
    this.start(this.index);
  }

  /** ctx: {x, z, inCar, carKind, interact}. Call every frame while playing. */
  update(dt, ctx) {
    if (!this.active) return;
    const m = this.mission;
    const s = m.steps[this.step];
    if (!s) return;
    const distTo = (pos) => Math.hypot(ctx.x - pos[0], ctx.z - pos[1]);

    if (s.type === 'steal') {
      if (ctx.inCar) this._nextStep();
      return;
    }
    if (s.type === 'steal-van') {
      if (ctx.inCar && ctx.carKind === 'armored') this._nextStep();
      return;
    }
    if (s.type === 'goto') {
      if (distTo(s.pos) < 9) this._nextStep();
      return;
    }
    if (s.type === 'pickup') {
      if (distTo(s.pos) < 5 && ctx.interact) this._nextStep();
      return;
    }
    if (s.type === 'gates') {
      this.gateTimer -= dt;
      this.hooks.onObjective(
        `<b>JOB ${this.index + 1} — ${m.title}</b><br>Gate ${this.gateIndex + 1}/${s.gates.length} — ${Math.max(0, Math.ceil(this.gateTimer))}s left`,
      );
      if (this.gateTimer <= 0) {
        this.hooks.onMessage('Too slow! Back to the start line.');
        this._enterStep();
        return;
      }
      const gate = s.gates[this.gateIndex];
      if (distTo(gate) < 10) {
        this.gateIndex++;
        if (this.gateIndex >= s.gates.length) {
          this._nextStep();
        } else {
          this.hooks.onMarker({ x: s.gates[this.gateIndex][0], z: s.gates[this.gateIndex][1] });
          this.hooks.onMessage(`Gate ${this.gateIndex}/${s.gates.length}!`);
        }
      }
    }
  }
}
