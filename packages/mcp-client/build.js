import esbuild from 'esbuild';

try {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/index.js',
    format: 'esm',
    target: 'es2022',
    minify: true,
    sourcemap: true,
    external: [],
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });
  console.log('Build completed successfully');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
