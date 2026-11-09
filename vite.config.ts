import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    modulePreload: false,
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
  plugins: [{
    name: 'play-from-disk',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Chrome blocks external module scripts on file URLs. The production
        // bundle contains the entire game and can load as a classic script.
        return html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/,
          '<script defer src="$1"></script>');
      },
    },
  }],
});
