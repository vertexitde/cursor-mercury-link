import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cursorRoot, requireSupportedOriginals, sha256} from './build-support.mjs';
import {patchWorkbench, patchRuntime} from './patches.mjs';
import {buildAutostart} from './autostart.mjs';

const version = '3.22.9';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = cursorRoot();
const manifestPath = path.join(dir, 'installed.json');
const configPath = path.join(dir, 'config.json');

if (process.argv.includes('--restore')) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const f of manifest.files) {
    if (sha256(fs.readFileSync(f.path)) !== f.patchedHash || sha256(fs.readFileSync(f.backup)) !== f.originalHash) throw new Error('Files changed. Restore stopped: ' + f.path);
  }
  for (const f of manifest.files) fs.copyFileSync(f.backup, f.path);
  // Companion manifests now describe the files as they were before Mercury.
  for (const linkedPath of manifest.linked) {
    if (!fs.existsSync(linkedPath)) continue;
    const linked = JSON.parse(fs.readFileSync(linkedPath, 'utf8'));
    for (const entry of linked.files) { const restored = manifest.files.find(f => f.path === entry.path); if (restored) entry.patchedHash = restored.originalHash; }
    fs.writeFileSync(linkedPath, JSON.stringify(linked, null, 2));
  }
  fs.renameSync(manifestPath, manifestPath + '.restored-' + Date.now());
  console.log('Mercury patch removed. Reload Cursor.');
  process.exit();
}

if (fs.existsSync(manifestPath)) throw new Error('Mercury patch already installed. Restore before reinstalling.');
const {build, linked} = requireSupportedOriginals(root);
if (build.version !== version) throw new Error('This installer supports Cursor ' + version + ' only.');
const check = process.argv.includes('--check');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {port:43189, key:crypto.randomBytes(32).toString('hex')};
if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || !/^[a-f0-9]{64}$/.test(config.key)) throw new Error('Invalid local bridge configuration.');
const symbols = JSON.parse(fs.readFileSync(path.join(dir, 'symbols-' + version + '.json'), 'utf8'));

const pending = [];
for (const surface of ['desktop', 'glass']) {
  const target = path.join(root, 'out/vs/workbench/workbench.' + surface + '.main.js');
  pending.push({path:target, content:patchWorkbench(fs.readFileSync(target, 'utf8'), surface, symbols[surface], config)});
}
for (const name of ['cursor-agent-exec', 'cursor-local-agent-runtime']) {
  const target = path.join(root, 'extensions', name, 'dist/main.js');
  pending.push({path:target, content:patchRuntime(fs.readFileSync(target, 'utf8'))});
}
const main = path.join(root, 'out/main.js');
pending.push({path:main, content:fs.readFileSync(main, 'utf8') + buildAutostart({nodePath:process.execPath, bridgePath:path.join(dir, 'bridge.mjs')})});
const productPath = path.join(root, 'product.json');
const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
product.checksums['vs/workbench/workbench.desktop.main.js'] = crypto.createHash('sha256').update(pending[0].content).digest('base64').replace(/=+$/, '');
pending.push({path:productPath, content:JSON.stringify(product, null, 2)});

const backupDir = path.join(dir, 'backups', version + '-' + Date.now());
fs.mkdirSync(backupDir, {recursive:true});
for (const [i, file] of pending.entries()) {
  if (!file.path.endsWith('.js')) continue;
  const candidate = path.join(backupDir, 'candidate-' + i + '.mjs');
  fs.writeFileSync(candidate, file.content);
  execFileSync(process.execPath, ['--check', candidate], {windowsHide:true, stdio:'pipe'});
  fs.unlinkSync(candidate);
}
if (check) {
  fs.rmSync(backupDir, {recursive:true, force:true});
  console.log(`Cursor ${version} Mercury patch candidates passed syntax and anchor checks` + (linked.length ? ` on top of ${linked.length} companion installation(s).` : '.'));
  process.exit();
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {mode:0o600});
const manifest = {version, commit:build.commit, installedAt:new Date().toISOString(), files:[], linked};
const linkedOriginals = linked.map(p => ({path:p, text:fs.readFileSync(p, 'utf8')}));
for (const [i, file] of pending.entries()) {
  const backup = path.join(backupDir, i + '-' + path.basename(file.path));
  fs.copyFileSync(file.path, backup);
  manifest.files.push({path:file.path, backup, originalHash:sha256(fs.readFileSync(backup)), patchedHash:sha256(file.content)});
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), {flag:'wx'});
try {
  for (const file of pending) fs.writeFileSync(file.path, file.content);
  for (const f of manifest.files) if (sha256(fs.readFileSync(f.path)) !== f.patchedHash) throw new Error('Post-write verification failed: ' + f.path);
  // The companion patches must keep recognising their own files.
  for (const {path:linkedPath, text} of linkedOriginals) {
    const value = JSON.parse(text);
    for (const entry of value.files) { const changed = manifest.files.find(f => f.path === entry.path); if (changed) entry.patchedHash = changed.patchedHash; }
    fs.writeFileSync(linkedPath, JSON.stringify(value, null, 2));
  }
} catch (error) {
  for (const f of manifest.files) fs.copyFileSync(f.backup, f.path);
  for (const {path:linkedPath, text} of linkedOriginals) fs.writeFileSync(linkedPath, text);
  fs.renameSync(manifestPath, manifestPath + '.rolled-back-' + Date.now());
  throw error;
}
console.log('Mercury models installed. Add your Inception API key in Cursor Settings > Models, then reload Cursor.');
