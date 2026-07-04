// Generate all PWA icon variants from the JKKN logo (app/icon.png).
//
// Outputs to public/icons/:
//   icon-192.png, icon-512.png                 — purpose "any"  (transparent, contain)
//   icon-maskable-192.png, icon-maskable-512.png — purpose "maskable" (logo padded into
//                                                  the ~80% safe zone on brand green)
//   apple-touch-icon.png (180x180)             — opaque white bg (iOS ignores transparency)
//
// Run: node scripts/generate-pwa-icons.js
// Requires `sharp` (already present via Next's image pipeline; also declared as a devDep).

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'app', 'icon.png');
const OUT = path.join(__dirname, '..', 'public', 'icons');

const GREEN = { r: 22, g: 163, b: 74, alpha: 1 }; // #16a34a (brand green)
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Square "any" icon: logo scaled to fit, transparent background. */
async function anyIcon(size) {
  await sharp(SRC)
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toFile(path.join(OUT, `icon-${size}.png`));
}

/** Maskable icon: logo padded into the ~80% safe zone, centered on a solid brand field
 *  so Android's adaptive-icon mask never clips the logo. */
async function maskableIcon(size) {
  const inner = Math.round(size * 0.8);
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: GREEN } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, `icon-maskable-${size}.png`));
}

/** apple-touch-icon: 180x180 on an opaque white field (iOS composites onto black otherwise). */
async function appleIcon() {
  const size = 180;
  const inner = Math.round(size * 0.85);
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, 'apple-touch-icon.png'));
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Source icon not found: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  await anyIcon(192);
  await anyIcon(512);
  await maskableIcon(192);
  await maskableIcon(512);
  await appleIcon();
  console.log('✓ PWA icons generated to public/icons/');
})().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
