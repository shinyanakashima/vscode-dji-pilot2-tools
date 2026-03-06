import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/webview/index.tsx'],
  bundle: true,
  outfile: 'out/webview/bundle.js',
  format: 'iife',
  platform: 'browser',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  loader: {
    '.css': 'text',
  },
  alias: {
    'react': 'preact/compat',
    'react-dom': 'preact/compat',
  },
  external: [],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching webview...');
} else {
  await esbuild.build(options);
}
