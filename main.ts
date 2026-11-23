// Solmar Bay — entry program for the make.fun "Make GTA 6" bounty.
// Copies the game and its screenshots into the output directory and writes
// the dossier with the kit library, byte for byte as the scorer expects.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : '/output';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(HERE, 'game'), join(OUT, 'game'), { recursive: true });
cpSync(join(HERE, 'screenshots'), join(OUT, 'screenshots'), { recursive: true });

const dossier = buildDossier(OUT, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(OUT, 'dossier.json'), dossier);
console.log(`solmar-bay: wrote ${OUT} (dossier ${dossier.length} bytes)`);
