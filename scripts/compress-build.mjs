// Generated variants retain .js/.css extensions so express.static preserves MIME/HEAD/ETag behavior.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const defaultDirectory = fileURLToPath(new URL('../frontend/dist/', import.meta.url));

export async function compressBuild(frontendDirectory = defaultDirectory) {
  const assets = path.join(frontendDirectory, 'assets');
  const encoded = path.join(frontendDirectory, '.encoded');
  const files = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile() && /\.(js|css)$/.test(entry.name)) files.push(file);
    }
  }
  await collect(assets);
  // This directory belongs only to this generator; never remove source assets/media/fonts.
  await rm(encoded, { recursive: true, force: true });
  const bytes = { identity: 0, br: 0, gzip: 0 };
  for (const file of files) {
    const source = await readFile(file);
    bytes.identity += source.length;
    const variants = {
      br: brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
      gzip: gzipSync(source, { level: 9 }),
    };
    for (const [encoding, content] of Object.entries(variants)) {
      const destination = path.join(encoded, encoding, path.relative(frontendDirectory, file));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
      bytes[encoding] += content.length;
    }
  }
  return { files: files.length, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Static asset compression:', await compressBuild());
}
