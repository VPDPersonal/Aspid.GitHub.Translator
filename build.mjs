import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });

const context = await esbuild.context({
  entryPoints: {
    background: 'src/background.js',
    bridge: 'src/bridge.js',
    content: 'src/content.js',
    options: 'src/options.js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome138',
  outdir: 'dist',
  logLevel: 'info',
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
