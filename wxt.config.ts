import { defineConfig } from 'wxt';

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
    version: '1.0.0',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: ['<all_urls>'],
    minimum_chrome_version: '109',
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: 'Open or close the Tiltview panel',
      },
      'rotate-cw': {
        suggested_key: { default: 'Alt+R' },
        description: 'Rotate video 90° clockwise',
      },
      'rotate-ccw': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Rotate video 90° counter-clockwise',
      },
      'zoom-in': {
        suggested_key: { default: 'Alt+Equal' },
        description: 'Zoom in',
      },
      'zoom-out': {
        suggested_key: { default: 'Alt+Minus' },
        description: 'Zoom out',
      },
      'reset-transform': {
        suggested_key: { default: 'Alt+0' },
        description: 'Reset all transforms',
      },
      'toggle-autofit': {
        suggested_key: { default: 'Alt+F' },
        description: 'Toggle auto-fit mode',
      },
    },
  },
});
