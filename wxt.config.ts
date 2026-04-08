import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tiltview',
    description: 'Rotate, zoom, pan, and mirror HTML5 videos on any website',
    permissions: ['activeTab'],
  },
});
