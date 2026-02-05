const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { size: 180, name: 'apple-touch-icon.png', dir: 'public' },
  { size: 192, name: 'icon-192.png', dir: 'public' },
  { size: 512, name: 'icon-512.png', dir: 'public' },
  { size: 32, name: 'favicon-32x32.png', dir: 'public' },
  { size: 16, name: 'favicon-16x16.png', dir: 'public' },
];

const svgPath = path.join(__dirname, '../src/app/icon.svg');

async function generateIcons() {
  console.log('🎨 Génération des icônes...\n');

  for (const { size, name, dir } of sizes) {
    const outputPath = path.join(__dirname, '..', dir, name);

    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`✓ ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Erreur pour ${name}:`, error.message);
    }
  }

  console.log('\n✨ Icônes générées avec succès !');
}

generateIcons().catch(console.error);
