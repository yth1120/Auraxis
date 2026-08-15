/**
 * Desktop smoke test — launches the compiled Electron app against the
 * production renderer (dist/), verifies the preload bridge is injected and
 * a few read-only IPC surfaces answer, then exits cleanly.
 *
 * Usage: npx tsc -p tsconfig.electron.json && npx vite build && node scripts/smoke-electron.cjs
 */
const path = require('path');
const { _electron } = require('playwright');

const root = path.join(__dirname, '..');

(async () => {
  const rendererErrors = [];
  const app = await _electron.launch({
    args: [path.join(root, 'dist-electron', 'main.js')],
    cwd: root,
    env: { ...process.env, AURAXIS_FORCE_PRODUCTION: '1' },
  });

  try {
    const win = await app.firstWindow();
    win.on('pageerror', (err) => rendererErrors.push(`pageerror: ${err.message}`));
    win.on('console', (msg) => {
      if (msg.type() === 'error') rendererErrors.push(`console.error: ${msg.text()}`);
    });

    await win.waitForLoadState('domcontentloaded');
    await win.waitForSelector('body', { timeout: 15_000 });
    // Give React a moment to mount the app shell.
    await new Promise((r) => setTimeout(r, 1_500));

    const bridge = await win.evaluate(() => ({
      hasBridge: typeof window.electronAPI === 'object',
      platform: window.electronAPI?.platform,
      bodyChildren: document.body.children.length,
    }));
    console.log('BRIDGE', JSON.stringify(bridge));
    if (!bridge.hasBridge) throw new Error('preload bridge missing (window.electronAPI)');
    if (bridge.bodyChildren === 0) throw new Error('renderer mounted an empty body');

    // Composer interaction — the primary user path must mount and accept text.
    const composer = win.locator('.ax-composer-textarea');
    await composer.waitFor({ state: 'visible', timeout: 15_000 });
    await composer.fill('E2E 冒烟消息');
    const typed = await composer.inputValue();
    if (typed !== 'E2E 冒烟消息') {
      throw new Error(`composer did not accept typed text (got "${typed}")`);
    }
    const sendDisabled = await win.locator('button[aria-label="发送"]').isDisabled();
    if (sendDisabled) {
      throw new Error('send button stayed disabled after typing');
    }
    console.log('COMPOSER_OK', JSON.stringify({ typed, sendDisabled }));

    const ipc = await win.evaluate(async () => {
      const e = window.electronAPI;
      const checks = {
        version: () => e.system.getVersion(),
        settings: () => e.settings.get(),
        models: () => e.model.getAll(),
        chats: () => e.chatLog.list(),
        skills: () => e.skills.list(),
        rules: () => e.permission.getRules(),
      };
      const out = {};
      for (const [key, fn] of Object.entries(checks)) {
        try {
          out[key] = await fn();
        } catch (err) {
          out[key] = { __error: String(err) };
        }
      }
      return out;
    });
    console.log('IPC', JSON.stringify(ipc).slice(0, 2_000));

    for (const key of ['version', 'models', 'settings', 'chats', 'skills', 'rules']) {
      if (ipc[key]?.__error) throw new Error(`IPC ${key} failed: ${ipc[key].__error}`);
    }
    if (rendererErrors.length > 0) {
      throw new Error(`renderer errors:\n${rendererErrors.join('\n')}`);
    }
    console.log('SMOKE_OK');
  } finally {
    await app.close().catch(() => {});
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
