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

const sourcePath = path.join(__dirname, '../public/icon.png');

async function generateIcons() {
  console.log('🎨 Génération des icônes depuis icon.png (2048x2048)...\n');

  for (const { size, name, dir } of sizes) {
    const outputPath = path.join(__dirname, '..', dir, name);

    try {
      await sharp(sourcePath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 1 }
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Erreur pour ${name}:`, error.message);
    }
  }

  // Générer favicon.ico
  try {
    await sharp(sourcePath)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      })
      .toFile(path.join(__dirname, '../public/favicon.ico'));
    console.log('✓ favicon.ico (32x32)');
  } catch (error) {
    console.error('✗ Erreur pour favicon.ico:', error.message);
  }

  console.log('\n✨ Icônes générées avec succès !');
}

generateIcons().catch(console.error);
