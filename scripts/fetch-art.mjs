// Downloads the period artwork behind each chapter from Wikimedia Commons (public domain / CC0 / free licences)
// into public/art and stores credits in src/data/chapters.json. Usage: npm run fetch-art
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = path.join(ROOT, 'src/data/chapters.json');
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const UA = { 'User-Agent': 'paris-through-our-lens/1.0 (student project)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res;
    await sleep(8000 * (i + 1));
  }
  throw new Error(`HTTP error for ${url}`);
}
await fs.mkdir(path.join(ROOT, 'public/art'), { recursive: true });

for (const [id, ch] of Object.entries(data.chapters)) {
  const art = ch.art;
  if (!art.commons && !art.image) continue;
  const out = path.join(ROOT, 'public/art', `${id}-1600.webp`);
  if (art.image && (await fs.stat(out).catch(() => null))) continue;
  const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', titles: `File:${art.commons}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1920',
  });
  const page = Object.values((await (await get(api)).json()).query.pages)[0];
  const info = page.imageinfo?.[0];
  if (!info) { console.log(`✗ ${id}: ${art.commons}`); continue; }
  const img = sharp(Buffer.from(await (await get(info.thumburl)).arrayBuffer())).rotate();
  const meta = await img.metadata();
  await img.clone().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
  await img.clone().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 70 }).toFile(path.join(ROOT, 'public/art', `${id}-900.webp`));
  const { dominant } = await img.clone().resize(64).stats();
  const m = info.extmetadata ?? {};
  Object.assign(art, {
    image: `${id}-1600.webp`, mid: `${id}-900.webp`, width: meta.width, height: meta.height,
    color: `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`,
    credit: strip(m.Artist?.value).slice(0, 120) || 'Auteur inconnu', license: strip(m.LicenseShortName?.value), source: info.descriptionurl,
  });
  console.log(`✓ ${id}  ${meta.width}x${meta.height}  ${art.license}`);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
  await sleep(2500);
}
