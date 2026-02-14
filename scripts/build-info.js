#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '../src/build-info.json');

try {
  // Get short commit hash
  const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

  // Get build date in YYYYMMDD format
  const now = new Date();
  const buildDate = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');

  const buildInfo = {
    date: buildDate,
    sha: commitHash
  };

  writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
  console.log(`Build info written: ${buildDate} @ ${commitHash}`);
} catch (error) {
  console.warn('Warning: Could not get git info, using fallback values');
  const now = new Date();
  const buildDate = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');

  const buildInfo = {
    date: buildDate,
    sha: 'unknown'
  };

  writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
  console.log(`Build info written (fallback): ${buildDate}`);
}