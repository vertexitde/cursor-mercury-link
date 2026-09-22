import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const supportedVersions = ['3.21.18', '3.21.16', '3.21.13', '3.21.12', '3.21.9'];
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

export function cursorRoot() {
  if (process.env.CURSOR_APP_ROOT) return path.resolve(process.env.CURSOR_APP_ROOT);
  const roots = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/cursor/resources/app'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Cursor/resources/app')].filter(Boolean);
  const root = roots.find(p => fs.existsSync(path.join(p, 'product.json')));
  if (!root) throw new Error('Cursor was not found. Set CURSOR_APP_ROOT to its resources/app directory.');
  return root;
}

// Installation manifests of the companion patches. Mercury installs after them
// and must be removed before them, because all three modify the same files.
export function linkedManifests() {
  return [...new Set([
    path.join(os.homedir(), 'cursor-chatgpt-bridge/installed.json'),
    path.join(process.env.CURSOR_GPT_LINK_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'cursor-gpt-link'), 'installed.json'),
    path.join(process.env.CURSOR_CLAUDE_LINK_HOME || path.join(os.homedir(), 'cursor-claude-link'), 'installed.json')
  ])].filter(p => fs.existsSync(p));
}

export function getBuild(root) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Only Windows x64 clients are supported.');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!supportedVersions.includes(version)) throw new Error('Unsupported Cursor version: ' + version);
  const build = JSON.parse(fs.readFileSync(new URL('./build-' + version + '.json', import.meta.url), 'utf8'));
  if (JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8')).commit !== build.commit) throw new Error('Unsupported Cursor commit.');
  return build;
}

// Every patched file must be either the reviewed original or exactly what a
// matching companion installation recorded. Anything else stops installation.
export function requireSupportedOriginals(root) {
  const build = getBuild(root);
  const accepted = Object.fromEntries(Object.entries(build.files).map(([relative, hash]) => [relative, new Set([hash])]));
  const linked = [];
  for (const manifestPath of linkedManifests()) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== build.version) throw new Error(`${manifestPath} belongs to Cursor ${manifest.version}. Reinstall that patch for ${build.version} first.`);
    for (const entry of manifest.files) {
      if (sha256(fs.readFileSync(entry.path)) !== entry.patchedHash) throw new Error(`${manifestPath} does not match the current Cursor files. Restore or repair that installation first.`);
      const relative = path.relative(root, entry.path).split(path.sep).join('/');
      accepted[relative]?.add(entry.patchedHash);
    }
    linked.push(manifestPath);
  }
  for (const [relative, hashes] of Object.entries(accepted)) {
    if (!hashes.has(sha256(fs.readFileSync(path.join(root, relative))))) throw new Error('Unrecognized or modified Cursor file: ' + relative);
  }
  return {build, linked};
}
