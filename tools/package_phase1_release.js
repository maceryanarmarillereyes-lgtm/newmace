#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function die(msg){
  console.error(`\n[package_phase1_release] ${msg}\n`);
  process.exit(1);
}

function readText(p){
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, s){
  fs.writeFileSync(p, s, 'utf8');
}

function parseArgs(argv){
  const out = {
    bump: true,
    force: false,
    outDir: null,
    dryRun: false,
  };
  for(let i=0;i<argv.length;i++){
    const a = String(argv[i]||'');
    if(a === '--no-bump') out.bump = false;
    else if(a === '--bump') out.bump = true;
    else if(a === '--force') out.force = true;
    else if(a === '--dry-run') out.dryRun = true;
    else if(a === '--out'){
      out.outDir = String(argv[i+1]||'').trim();
      i++;
    }else if(a === '-h' || a === '--help'){
      console.log(`\nMUMS Phase 1 — Sequential Release Packager\n\n`+
        `Usage:\n`+
        `  node tools/package_phase1_release.js [--out <dir>] [--no-bump] [--force] [--dry-run]\n\n`+
        `Default:\n`+
        `  - Creates: MUMS Phase 1-<sequence>.zip\n`+
        `  - Then bumps build labels to the next sequence (ready for next release)\n`);
      process.exit(0);
    }
  }
  return out;
}

// Match hyphen-like separators (hyphen, en dash, em dash, non-breaking hyphen, etc.)
const SEP_CLASS = '[-\u2010\u2011\u2012\u2013\u2014]';
const BUILD_RE = new RegExp(`BUILD\\s*:\\s*['\"]MUMS\\s+Phase\\s+1${SEP_CLASS}(\\d+)['\"]`);
const PHASE_RE_GLOBAL = new RegExp(`MUMS\\s+Phase\\s+1${SEP_CLASS}\\d+`, 'g');

function replaceBuildLabels(text, nextSeq){
  return String(text||'').replace(PHASE_RE_GLOBAL, `MUMS Phase 1-${nextSeq}`);
}

function main(){
  const opts = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');

  const configPath = path.join(root, 'public', 'js', 'config.js');
  if(!fs.existsSync(configPath)) die('Missing public/js/config.js');
  const cfg = readText(configPath);
  const m = cfg.match(BUILD_RE);
  if(!m) die('Could not parse Config.BUILD in public/js/config.js');
  const seq = Number(m[1]);
  if(!Number.isFinite(seq) || seq <= 0) die(`Invalid build sequence: ${m[1]}`);

  const outDir = opts.outDir ? path.resolve(root, opts.outDir) : root;
  if(!fs.existsSync(outDir) && !opts.dryRun){
    fs.mkdirSync(outDir, { recursive: true });
  }

  const zipName = `MUMS Phase 1-${seq}.zip`;
  const zipPath = path.join(outDir, zipName);
  if(fs.existsSync(zipPath) && !opts.force){
    die(`Output already exists: ${zipName} (use --force to overwrite)`);
  }

  // Build zip (exclude common non-artifacts)
  const zipArgs = ['-r', zipPath, '.'];
  const excludes = [
    'node_modules/*',
    '.git/*',
    '.vercel/*',
    '*.zip',
    'dist/*',
    'tmp/*',
  ];
  for(const x of excludes){
    zipArgs.push('-x', x);
  }

  if(opts.dryRun){
    console.log(`[package_phase1_release] DRY RUN: would run zip ${zipArgs.join(' ')}`);
  }else{
    console.log(`[package_phase1_release] Packaging → ${zipName}`);
    const res = cp.spawnSync('zip', zipArgs, { cwd: root, stdio: 'inherit' });
    if(res.status !== 0){
      die('zip command failed');
    }
  }

  if(!opts.bump){
    console.log(`[package_phase1_release] Done (no bump).`);
    return;
  }

  const nextSeq = seq + 1;
  const filesToBump = [
    configPath,
    path.join(root, 'public', 'index.html'),
    path.join(root, 'public', 'login.html'),
    path.join(root, 'public', 'dashboard.html'),
    path.join(root, 'public', 'schedule.html'),
  ];

  for(const fp of filesToBump){
    if(!fs.existsSync(fp)) continue;
    const before = readText(fp);
    const after = replaceBuildLabels(before, nextSeq);
    if(after !== before){
      if(opts.dryRun) console.log(`[package_phase1_release] DRY RUN: would bump labels in ${path.relative(root, fp)}`);
      else writeText(fp, after);
    }
  }

  if(opts.dryRun) console.log(`[package_phase1_release] DRY RUN: would bump build labels to MUMS Phase 1-${nextSeq}`);
  else console.log(`[package_phase1_release] Bumped build labels to MUMS Phase 1-${nextSeq}`);
  console.log(`[package_phase1_release] Next run will create: MUMS Phase 1-${nextSeq}.zip`);
}

main();
