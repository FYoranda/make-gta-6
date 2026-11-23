// Solmar Bay — tuning, city layout, vehicles, weapons and missions.
// One clear job: every number the rest of the game reads lives here.
import * as THREE from 'three';

export const SAVE_KEY = 'solmar-bay-save-v1';

// City grid: roads run along x = k * PITCH and z = k * PITCH.
export const CITY = {
  pitch: 60,
  roadWidth: 14,
  blockSize: 46,
  half: 210, // city edge; roads at -180 .. 180
  beachZ: 222, // sand strip starts here (south edge)
  waterZ: 292, // water plane starts here
  groundSize: 640,
};

export const ROAD_LINES = [-180, -120, -60, 0, 60, 120, 180];

export const COLORS = {
  skyTop: 0x2a1a5e,
  skyHorizon: 0xff8a4c,
  fog: 0xe08a5a,
  sun: 0xffd9a0,
  asphalt: 0x2e2e38,
  sidewalk: 0x8d8d96,
  sand: 0xe0c188,
  water: 0x1e6f8e,
  grass: 0x4a7a4a,
};

// Vehicle types: size in metres, top speed, acceleration, handling.
export const VEHICLE_TYPES = {
  sedan: { label: 'Sedan', length: 4.4, width: 1.9, topSpeed: 34, accel: 16, grip: 2.4, color: 0x3a6fd8 },
  taxi: { label: 'Taxi', length: 4.4, width: 1.9, topSpeed: 32, accel: 15, grip: 2.4, color: 0xf2c230 },
  pickup: { label: 'Pickup', length: 4.9, width: 2.0, topSpeed: 31, accel: 14, grip: 2.2, color: 0x8a5a2e },
  van: { label: 'Van', length: 5.2, width: 2.1, topSpeed: 28, accel: 12, grip: 2.0, color: 0xd8d8d8 },
  sports: { label: 'Sports', length: 4.2, width: 1.9, topSpeed: 46, accel: 24, grip: 3.4, color: 0xd81e3f },
  police: { label: 'Interceptor', length: 4.6, width: 2.0, topSpeed: 40, accel: 22, grip: 3.0, color: 0x14181f },
  armored: { label: 'Armored Van', length: 5.6, width: 2.3, topSpeed: 26, accel: 11, grip: 1.9, color: 0x4a5560 },
};

export const WEAPONS = {
  pistol: { name: 'PISTOL', damage: 34, mag: 12, reload: 0.9, rate: 0.22, range: 60, spread: 0.012, price: 0 },
  smg: { name: 'SMG', damage: 20, mag: 30, reload: 1.3, rate: 0.09, range: 55, spread: 0.03, price: 800 },
  shotgun: { name: 'SHOTGUN', damage: 26, mag: 6, reload: 1.6, rate: 0.8, range: 32, spread: 0.09, pellets: 6, price: 1500 },
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 7.5,
  radius: 0.55,
  health: 100,
  eyeHeight: 1.7,
};

export const WANTED = {
  decaySeconds: 22, // no crime + unseen by police -> one star drops
  policePerStar: 1,
  maxPolice: 3,
  bustDistance: 3.2,
  bustSeconds: 2.0,
  fine: 250,
};

// Five story jobs. steps: goto (reach marker), pickup (press E), gates
// (drive through checkpoints in order, timed), deliver (reach marker).
export const MISSIONS = [
  {
    id: 'wheels-up', title: 'WHEELS UP', reward: 400,
    brief: 'Steal a car. Any car. Then drive to the yellow marker.',
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press F.' },
      { type: 'goto', pos: [150, -150], text: 'Drive to the garage on the north-east side.' },
    ],
  },
  {
    id: 'the-pickup', title: 'THE PICKUP', reward: 700,
    brief: 'A package is waiting at the docks. Go get it, then bring it to Rosa.',
    steps: [
      { type: 'goto', pos: [-180, 180], text: 'Drive to the docks, south-west corner.' },
      { type: 'pickup', pos: [-180, 180], text: 'Press E to grab the package.' },
      { type: 'goto', pos: [60, 60], text: 'Deliver the package to Rosa at the plaza.' },
    ],
  },
  {
    id: 'hot-pursuit', title: 'HOT PURSUIT', reward: 1200,
    brief: 'The cops are onto the crew. Lose them and get the cash to the hideout.',
    wantedAtStart: 2,
    steps: [
      { type: 'goto', pos: [-150, -150], text: 'Reach the hideout, north-west — with the law on your tail.' },
    ],
  },
  {
    id: 'street-king', title: 'STREET KING', reward: 1500,
    brief: 'A street race across the city. Hit every gate before the clock runs out.',
    steps: [
      { type: 'gates', time: 95, gates: [[-120, 0], [-60, -120], [60, -180], [180, -60], [120, 120]], text: 'Race! Drive through the gates in order.' },
    ],
  },
  {
    id: 'the-big-score', title: 'THE BIG SCORE', reward: 5000,
    brief: 'The armored van leaves the bank at dusk. Take it, and bring it home.',
    wantedAtStart: 3,
    steps: [
      { type: 'steal-van', pos: [0, -180], text: 'Steal the armored van outside the bank.' },
      { type: 'goto', pos: [150, 150], text: 'Deliver the van to the hideout, south-east.' },
    ],
  },
];

export const SHOP = {
  gunPos: [-60, -180],
  safehousePos: [150, -150],
  repairPrice: 150,
  ammoPrice: 50,
};
