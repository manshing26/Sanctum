import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  ExternalPrivateBrowserId,
  ExternalPrivateBrowserTarget,
  OpenExternalPrivateInput,
} from '../../../shared/ipc';

type BrowserLaunchConfig = {
  id: ExternalPrivateBrowserId;
  label: string;
  privateArgs: string[];
  macApps: Array<{ appName: string; executable: string }>;
  winExecutables: string[];
  linuxExecutables: string[];
};

const PRIVATE_BROWSER_CONFIGS: BrowserLaunchConfig[] = [
  {
    id: 'chrome',
    label: 'Chrome',
    privateArgs: ['--incognito'],
    macApps: [{ appName: 'Google Chrome.app', executable: 'Contents/MacOS/Google Chrome' }],
    winExecutables: ['Google/Chrome/Application/chrome.exe'],
    linuxExecutables: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  },
  {
    id: 'brave',
    label: 'Brave',
    privateArgs: ['--incognito'],
    macApps: [{ appName: 'Brave Browser.app', executable: 'Contents/MacOS/Brave Browser' }],
    winExecutables: ['BraveSoftware/Brave-Browser/Application/brave.exe'],
    linuxExecutables: ['brave-browser', 'brave'],
  },
  {
    id: 'edge',
    label: 'Edge',
    privateArgs: ['--inprivate'],
    macApps: [{ appName: 'Microsoft Edge.app', executable: 'Contents/MacOS/Microsoft Edge' }],
    winExecutables: ['Microsoft/Edge/Application/msedge.exe'],
    linuxExecutables: ['microsoft-edge', 'microsoft-edge-stable'],
  },
  {
    id: 'firefox',
    label: 'Firefox',
    privateArgs: ['-private-window'],
    macApps: [{ appName: 'Firefox.app', executable: 'Contents/MacOS/firefox' }],
    winExecutables: ['Mozilla Firefox/firefox.exe'],
    linuxExecutables: ['firefox'],
  },
];

export const isHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const findMacExecutable = (config: BrowserLaunchConfig): string | null => {
  const roots = ['/Applications', path.join(os.homedir(), 'Applications')];
  for (const root of roots) {
    for (const appInfo of config.macApps) {
      const executable = path.join(root, appInfo.appName, appInfo.executable);
      if (existsSync(executable)) return executable;
    }
  }
  return null;
};

const findWindowsExecutable = (config: BrowserLaunchConfig): string | null => {
  const roots = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean) as string[];
  for (const root of roots) {
    for (const relative of config.winExecutables) {
      const executable = path.join(root, relative);
      if (existsSync(executable)) return executable;
    }
  }
  return null;
};

const findLinuxExecutable = (config: BrowserLaunchConfig): string | null => {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const executableName of config.linuxExecutables) {
    for (const dir of pathDirs) {
      const executable = path.join(dir, executableName);
      if (existsSync(executable)) return executable;
    }
  }
  return null;
};

const findBrowserExecutable = (config: BrowserLaunchConfig): string | null => {
  if (process.platform === 'darwin') return findMacExecutable(config);
  if (process.platform === 'win32') return findWindowsExecutable(config);
  return findLinuxExecutable(config);
};

export const listPrivateOpenTargets = (): ExternalPrivateBrowserTarget[] =>
  PRIVATE_BROWSER_CONFIGS.map((config) => ({
    id: config.id,
    label: config.label,
    available: Boolean(findBrowserExecutable(config)),
  }));

export const openExternalPrivate = async (input: OpenExternalPrivateInput): Promise<void> => {
  if (!isHttpUrl(input.url)) {
    throw new Error('Only http and https URLs can be opened externally.');
  }
  const config = PRIVATE_BROWSER_CONFIGS.find((entry) => entry.id === input.browser);
  if (!config) {
    throw new Error('Unsupported browser.');
  }
  const executable = findBrowserExecutable(config);
  if (!executable) {
    throw new Error(`${config.label} is not installed.`);
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...config.privateArgs, input.url], {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
};
