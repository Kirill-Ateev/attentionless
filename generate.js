const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// Configurable folders and categories
const categories = [
  'food',
  'clown',
  'childrendrawings',
  'surgery',
  'architecture',
  'tools',
  'graffiti',
  'insect',
  'painting',
  'flowers',
];
const imageFolderPath = './images'; // Update this path as per your folder structure
const outputImagesPath = './output/images';
const outputMetadataPath = './output/metadata';

const canvasSize = 1000;
const finalSize = 1024;

// Helper function to generate deterministic random values based on a seed
function seededRandom(seed) {
  const hash = crypto
    .createHash('sha256')
    .update(seed.toString())
    .digest('hex');
  let rand = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  return () => {
    rand = (rand * 9301 + 49297) % 233280;
    return rand / 233280;
  };
}

// Helper function to generate random seed
function generateSeed() {
  return crypto.randomBytes(16).toString('hex');
}

// Load images from each category
async function loadImagesFromCategory(category) {
  const categoryPath = path.join(imageFolderPath, category);
  const files = await fs.readdir(categoryPath);
  const images = files
    .filter((file) => file.endsWith('.png'))
    .map((file) => ({
      path: path.join(categoryPath, file),
      fileName: file,
    }));

  if (images.length === 0) {
    throw new Error(`No images found in category: ${category}`);
  }

  return images;
}

// Apply transformations like rotation, scaling, and effects
function applyImageTransformations(ctx, image, seedRand, x, y) {
  const size = 200 + seedRand() * 600; // Size between 200px and 800px
  const rotation = seedRand() * 360; // Rotation between 0 and 360 degrees
  const deformation = seedRand(); // Deformation factor (0 to 1)

  // Save the current state of the canvas
  ctx.save();

  // Move to the center of the picture to rotate and scale
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-(x + size / 2), -(y + size / 2));

  // Optionally apply tone or grayscale effects
  const effect = seedRand();
  if (effect < 0.33) {
    ctx.filter = 'grayscale(100%)';
  } else if (effect < 0.66) {
    ctx.filter = 'hue-rotate(90deg)';
  }

  // Draw the image with the specified size and deformation
  ctx.drawImage(image, x, y, size * (1 + deformation), size);

  // Restore the previous state of the canvas
  ctx.restore();
}

// Create collage image
async function createImage(seed, instanceNumber) {
  const seedRand = seededRandom(seed);
  const canvas = createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d');

  // Fill canvas with white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Load images from each category
  const imagesByCategory = {};
  for (const category of categories) {
    imagesByCategory[category] = await loadImagesFromCategory(category);
  }

  // Place each category's image on the canvas
  for (const category of categories) {
    const images = imagesByCategory[category];
    const randomImage = images[Math.floor(seedRand() * images.length)];

    console.log(`[createImage]: Loading image: ${randomImage.path}`);
    const image = await loadImage(randomImage.path).catch((err) => {
      console.error(`Failed to load image: ${randomImage.path}`, err);
      throw err;
    });
    const x = seedRand() * (canvasSize - 200);
    const y = seedRand() * (canvasSize - 200);

    // Log the position and size for debugging
    console.log(`[createImage]: Drawing image at x: ${x}, y: ${y}`);

    applyImageTransformations(ctx, image, seedRand, x, y);
    console.log(`[createImage]: Transform applied`);
  }

  // Create a larger canvas with 1024x1024 for white frame
  const finalCanvas = createCanvas(finalSize, finalSize);
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.fillStyle = '#FFFFFF';
  finalCtx.fillRect(0, 0, finalSize, finalSize);

  // Draw the 1000x1000 image at the center of the 1024x1024 canvas
  finalCtx.drawImage(canvas, 12, 12);
  // Save the image to the output folder
  const outputImagePath = path.join(outputImagesPath, `${instanceNumber}.jpeg`);
  const buffer = finalCanvas.toBuffer('image/jpeg');

  if (!buffer) {
    throw new Error('Failed to generate image buffer');
  }

  await fs.ensureDir(outputImagesPath);
  await fs.writeFile(outputImagePath, buffer);

  return outputImagePath;
}

// Create metadata for the image
async function createMetadata(instanceNumber, seed, selectedImages) {
  const metadata = {
    name: `Raw Attention #${instanceNumber}`,
    description: 'Raw Attention collection',
    image: `${instanceNumber}.webp`,
    attributes: [],
  };

  // Add image attributes based on selected images
  for (const [category, imageData] of Object.entries(selectedImages)) {
    const imageNumber = path.basename(imageData.fileName, '.webp'); // Extract number from file name
    metadata.attributes.push({
      trait_type: category,
      value: imageNumber,
    });
  }

  // Save the metadata to the output folder
  const outputMetadataPathFull = path.join(
    outputMetadataPath,
    `${instanceNumber}.json`
  );
  await fs.ensureDir(outputMetadataPath);
  await fs.writeFile(outputMetadataPathFull, JSON.stringify(metadata, null, 2));

  return metadata;
}

// Main function to generate the collage and metadata
async function generateImagesAndMetadata(instanceCount = 1) {
  for (let i = 1; i <= instanceCount; i++) {
    const seed = generateSeed();
    console.log(`Generating instance #${i} with seed: ${seed}`);

    // Load images from each category and prepare metadata
    const selectedImages = {};
    for (const category of categories) {
      const images = await loadImagesFromCategory(category);
      const seedRand = seededRandom(seed);
      selectedImages[category] = images[Math.floor(seedRand() * images.length)];
    }

    // Create the image
    const imagePath = await createImage(seed, i);

    // Create the metadata
    const metadata = await createMetadata(i, seed, selectedImages);

    console.log(`Generated image: ${imagePath}`);
    // console.log(`Generated metadata: ${JSON.stringify(metadata, null, 2)}`);
  }
}

// Run the generation process
const instanceCount = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
generateImagesAndMetadata(instanceCount)
  .then(() => console.log('Generation completed!'))
  .catch((err) => console.error('Error during generation:', err));
