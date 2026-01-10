// Script to generate PWA icons
// Run with: node scripts/generate-icons.js

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create SVG with gradient background and emoji
const createIconSvg = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#grad)" rx="${size * 0.2}"/>
  <text x="${size / 2}" y="${size * 0.625}" font-size="${size * 0.6}" text-anchor="middle" fill="white" font-family="Arial, sans-serif">😊</text>
</svg>`;

async function generateIcons() {
  try {
    const sizes = [192, 512];
    
    for (const size of sizes) {
      const svg = createIconSvg(size);
      const outputPath = path.join(publicDir, `icon-${size}.png`);
      
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Created icon-${size}.png`);
    }
    
    // Also create apple-touch-icon (180x180)
    const appleSvg = createIconSvg(180);
    const applePath = path.join(publicDir, 'apple-touch-icon.png');
    await sharp(Buffer.from(appleSvg))
      .resize(180, 180)
      .png()
      .toFile(applePath);
    console.log('✅ Created apple-touch-icon.png');
    
    console.log('\n🎉 All icons generated successfully!');
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();

