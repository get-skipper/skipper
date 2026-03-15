import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['cypress'],
  },
  {
    // support.ts is a side-effect file — no DTS needed
    entry: ['src/support.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    sourcemap: true,
    external: ['cypress'],
  },
]);
