import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const targets = [
  {
    label: 'backend',
    filePath: path.join(repoRoot, 'backend/src/version.js'),
    constName: 'BACKEND_VERSION',
  },
  {
    label: 'frontend',
    filePath: path.join(repoRoot, 'frontend/src/version.js'),
    constName: 'FRONTEND_VERSION',
  },
];

function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid version format "${value}". Expected format like 1.00`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  };
}

function formatVersion(major, minor) {
  return `${major}.${String(minor).padStart(2, '0')}`;
}

function bumpPatch(version) {
  const { major, minor } = parseVersion(version);
  if (minor >= 99) {
    throw new Error(`Cannot auto-bump patch for version ${version}. Use --major instead.`);
  }
  return formatVersion(major, minor + 1);
}

function bumpMajor(version) {
  const { major } = parseVersion(version);
  return formatVersion(major + 1, 0);
}

function readCurrentVersion(fileContent, constName) {
  const regex = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*'([0-9]+\\.[0-9]{2})';`);
  const match = fileContent.match(regex);
  if (!match) {
    throw new Error(`Could not find ${constName} in file.`);
  }
  return match[1];
}

function writeVersion(fileContent, constName, nextVersion) {
  const regex = new RegExp(`(export\\s+const\\s+${constName}\\s*=\\s*')([0-9]+\\.[0-9]{2})(';)`);
  if (!regex.test(fileContent)) {
    throw new Error(`Could not update ${constName} in file.`);
  }
  return fileContent.replace(regex, `$1${nextVersion}$3`);
}

const args = new Set(process.argv.slice(2));
const mode = args.has('--major') ? 'major' : 'patch';

for (const target of targets) {
  const raw = fs.readFileSync(target.filePath, 'utf8');
  const currentVersion = readCurrentVersion(raw, target.constName);
  const nextVersion = mode === 'major' ? bumpMajor(currentVersion) : bumpPatch(currentVersion);
  const nextContent = writeVersion(raw, target.constName, nextVersion);
  fs.writeFileSync(target.filePath, nextContent, 'utf8');
  console.log(`[version] ${target.label}: ${currentVersion} -> ${nextVersion}`);
}
