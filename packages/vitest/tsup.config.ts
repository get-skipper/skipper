import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['vitest'],
  },
  {
    // setup.ts is a side-effect file — no DTS needed
    entry: ['src/setup.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    sourcemap: true,
    external: ['vitest'],
  },
]);
