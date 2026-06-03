const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const webpackDir = path.join(root, '.webpack');
const preferredArchDir = path.join(webpackDir, process.arch);

const findArchDir = () => {
  if (fs.existsSync(path.join(preferredArchDir, 'main')) && fs.existsSync(path.join(preferredArchDir, 'renderer'))) {
    return preferredArchDir;
  }

  const candidates = fs.existsSync(webpackDir)
    ? fs.readdirSync(webpackDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(webpackDir, entry.name))
    : [];

  return candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'main')) &&
    fs.existsSync(path.join(candidate, 'renderer')));
};

const archDir = findArchDir();

if (!archDir) {
  throw new Error('No architecture-specific Forge Webpack output was found.');
}

for (const name of ['main', 'renderer']) {
  const target = path.join(webpackDir, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(archDir, name), target, { recursive: true });
}

console.log(`Prepared Electron Builder input from ${path.relative(root, archDir)}.`);
