import { defineConfig } from 'wxt';
import { toManifestCommands } from './lib/shortcuts';

/**
 * Manifest notes (all three were bugs in v0.1.0):
 *
 * 1. `<all_urls>` host permissions are declared explicitly. The content script
 *    itself is registered for `<all_urls>` too, so "any HTML5 video" in the
 *    README is now true instead of only applying to 4 hostnames.
 * 2. `scripting` is needed so the background worker can inject the content
 *    script on tabs that were already open at install time.
 * 3. Shortcut fixes: `Alt+Plus` never fires in Chrome (it resolves to
 *    `Alt+=` on most layouts), and `Alt+Shift+T` is added as a one-key way to
 *    open the panel. Everything else stays backwards compatible.
 */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tiltview',
    description: 'Rotate, zoom, pan, and mirror any HTML5 video on any website',
    version: '1.0.5',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: ['<all_urls>'],
    minimum_chrome_version: '109',
    // At most four commands may declare a `suggested_key` (Chrome limit) — see
    // lib/shortcuts.ts. Declaring more makes Chrome refuse to load the
    // extension outright with "Too many shortcuts specified for 'commands'".
    commands: toManifestCommands(),
  },
});
