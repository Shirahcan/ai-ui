import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // CJS too, so a product's jest (CommonJS, node_modules untransformed) can require it.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom', 'react-markdown', 'remark-gfm'],
  // Every export is a client component or a hook: mark the bundle for the
  // Next.js app router, or a product importing it from a server component gets
  // a build error that names this package rather than their own file.
  banner: { js: "'use client';" },
});
