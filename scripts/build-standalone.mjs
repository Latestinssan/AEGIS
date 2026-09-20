import { build } from 'esbuild';
import { readFileSync } from 'fs';
const config = JSON.parse(readFileSync('./sea-config.json', 'utf8'));


(async () => {
  try {
    await build({
      entryPoints: [config.entry],
      outfile: config.output,
      bundle: config.bundle,
      platform: 'node',
      format: config.format,
      target: config.target,
      minify: config.minify,
      external: config.external,
    });
    console.log('SEA build complete:', config.output);
  } catch (e) {
    console.error('SEA build failed', e);
    process.exit(1);
  }
})();
