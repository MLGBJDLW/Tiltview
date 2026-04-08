import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tiltview',
    description: 'Rotate, zoom, pan, and mirror HTML5 videos on any website',
    permissions: ['activeTab'],
    commands: {
      'rotate-cw': {
        suggested_key: { default: 'Alt+R' },
        description: 'Rotate video 90° clockwise',
      },
      'rotate-ccw': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Rotate video 90° counter-clockwise',
      },
      'zoom-in': {
        suggested_key: { default: 'Alt+Plus' },
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
