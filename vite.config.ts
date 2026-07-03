import { defineConfig } from 'vite';

// The hosted landing + live demo site for auditor.apicommons.org.
// Entry is the repo-root index.html; the demo imports the SAME shared
// src/audit.js + src/report-html.js the CLI uses, so the live score and report
// are byte-identical to a CI run. Output goes to dist/, uploaded by Pages.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
