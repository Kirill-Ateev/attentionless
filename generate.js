const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { applyGrayscale, applyHueRotate, shuffle } = require('./utils');
const webp = require('webp-wasm');

// Configurable folders and categories
const categories = [
  'animals',
  'architecture',
  'art',
  'clown',
  'drawings',
  'flowers',
  'food',
  'insect',
  'other',
  'strange',
  'surgery',
  'tools',
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
    .update(`${seed}_RAW_ATTENTION`)
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

  console.log('width: ', x, image.width, ctx.width, x + size);
  console.log('height: ', y, image.height, ctx.height, y + size);

  const originWidth = seedRand() > 0.5 ? image.width : x;
  const originHeight = seedRand() > 0.5 ? image.height : y;

  const expanded = seedRand() > 0.5;
  const width = expanded ? x + size : Math.ceil(x);
  const height = expanded ? y + size : Math.ceil(y);

  // Save the current state of the canvas
  ctx.save();

  // Move to the center of the picture to rotate and scale
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((rotation * Math.PI) / (seedRand() * 360));
  ctx.translate(-(x + size / 2), -(y + size / 2));

  // Optionally apply tone or grayscale effects
  const effect = seedRand();

  console.log('effect: ', effect, seedRand());
  if (effect < 0.1) {
    applyGrayscale(ctx, width, height);
  } else if (effect > 0.7) {
    applyHueRotate(ctx, width, height, seedRand() * 360);
  }

  if (effect < (size - 200) / 600) {
    // Устанавливаем прозрачность в диапазоне [0.25, 0.75]
    ctx.globalAlpha = seedRand() * 0.5 + 0.25;
  }

  // Draw the image with the specified size and deformation
  ctx.drawImage(image, x, y, size * (1 + deformation), size);

  // Restore the previous state of the canvas
  ctx.restore();
}

function addStrokeEffects(ctx, seedRand) {
  const lineCount = 2 + Math.floor(seedRand() * 10); // Количество линий

  const colors =
    seedRand() > 0.3
      ? [
          `hsl(${Math.floor(seedRand() * 360)}, ${Math.floor(
            seedRand() * 100
          )}%, ${Math.floor(seedRand() * 90)}%)`, // Темные цвета
          `hsl(${Math.floor(seedRand() * 360)}, ${Math.floor(
            seedRand() * 100
          )}%, ${Math.floor(seedRand() * 90)}%)`,
          `hsl(${Math.floor(seedRand() * 360)}, ${Math.floor(
            seedRand() * 100
          )}%, ${Math.floor(seedRand() * 90)}%)`,
        ]
      : ['hsl(0, 0%, 0%)'];

  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; // Режим наложения
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < lineCount; i++) {
    const startX = seedRand() * ctx.canvas.width;
    const startY = seedRand() * ctx.canvas.height;
    const segments = 10 + Math.floor(seedRand() * 15); // Сегменты кривой Безье

    ctx.beginPath();
    ctx.moveTo(startX, startY);

    let prevX = startX;
    let prevY = startY;

    for (let j = 0; j < segments; j++) {
      const length = 50 + seedRand() * 300;
      // Генерация контрольных точек для кривой Безье
      const controlX1 = prevX + (seedRand() - seedRand()) * length; // Первая контрольная точка
      const controlY1 = prevY + (seedRand() - seedRand()) * length;
      const controlX2 = controlX1 + (seedRand() - seedRand()) * length; // Вторая контрольная точка
      const controlY2 = controlY1 + (seedRand() - seedRand()) * length;
      const endX = controlX2 + (seedRand() - seedRand()) * length; // Конечная точка
      const endY = controlY2 + (seedRand() - seedRand()) * length;

      // Рисуем кривую Безье
      ctx.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, endX, endY);

      // Применяем динамическую толщину
      ctx.lineWidth = 0.5 + seedRand() * 20;

      // Обновляем предыдущие координаты
      prevX = endX;
      prevY = endY;
    }

    // Параметры линии
    ctx.strokeStyle = colors[Math.floor(seedRand() * colors.length)];
    ctx.globalAlpha = 0.2 + seedRand();

    ctx.stroke();
  }

  ctx.restore();
  return { lineCount };
}

// Create collage image
async function createImage(seed, instanceNumber) {
  const seedRand = seededRandom(seed);
  const canvas = createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d');

  // Генерация случайного основного цвета
  const hue = Math.floor(seedRand() * 360);
  const saturation = Math.floor(seedRand() * 100);
  const lightness = Math.floor(seedRand() * 90);
  const baseColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  // Создание градиента с вариациями
  const gradientType = seedRand() > 0.5 ? 'linear' : 'radial';
  let gradient;

  if (gradientType === 'linear') {
    const x0 = seedRand() * canvasSize;
    const y0 = seedRand() * canvasSize;
    const x1 = seedRand() * canvasSize;
    const y1 = seedRand() * canvasSize;
    gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  } else {
    const r = (canvasSize / 2) * (0.2 + seedRand() * 0.8);
    gradient = ctx.createRadialGradient(
      canvasSize / 2,
      canvasSize / 2,
      0,
      canvasSize / 2,
      canvasSize / 2,
      r
    );
  }

  // Добавляем цветовые остановки с вариациями
  gradient.addColorStop(0, baseColor);
  gradient.addColorStop(
    1,
    `hsl(${(hue + 50 + seedRand() * 40) % 360}, ${saturation}%, ${
      lightness + 10
    }%)`
  );

  // Заливаем фон градиентом
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Добавляем текстуру с разводами
  ctx.globalAlpha = 0.15 + seedRand() * 0.1; // Полупрозрачность
  for (let i = 0; i < 5 + seedRand() * 10; i++) {
    ctx.beginPath();
    ctx.arc(
      seedRand() * canvasSize,
      seedRand() * canvasSize,
      50 + seedRand() * 100,
      0,
      Math.PI * 2
    );

    // Случайный цвет для развода
    ctx.fillStyle = `hsl(${(hue + 50 + seedRand() * 100) % 360}, ${
      saturation - 20
    }%, ${lightness + 20}%)`;
    ctx.fill();
  }

  // Восстанавливаем настройки
  ctx.globalAlpha = 1.0;

  const shuffledCategories = shuffle(categories, seedRand());

  // Load images from each category
  const imagesByCategory = {};
  for (const category of shuffledCategories) {
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

  // Добавляем эффект рукописных пометок
  const { lineCount } = addStrokeEffects(finalCtx, seedRand); // Уникальный seed для эффекта

  // extract modified pixels from canvas
  let finalImgData = finalCtx.getImageData(0, 0, finalSize, finalSize);

  // compress back to WebP
  let buffer = await webp.encode(finalImgData, {
    quality: 100, // Баланс между качеством и размером
    // method: 6,   // Максимальная оптимизация
    lossless: true, // С потерями дает лучшее сжатие для коллажей
    alphaQuality: 100, // Качество альфа-канала
  });

  // Save the image to the output folder
  const outputImagePath = path.join(outputImagesPath, `${instanceNumber}.webp`);

  if (!buffer) {
    throw new Error('Failed to generate image buffer');
  }

  await fs.ensureDir(outputImagesPath);
  await fs.writeFile(outputImagePath, buffer);

  return { outputImagePath, lineCount };
}

// Create metadata for the image
async function createMetadata(instanceNumber, seed, selectedImages, lineCount) {
  const metadata = {
    name: `Raw Attention #${instanceNumber}`,
    description: 'Raw Attention collection',
    image: `${instanceNumber}.webp`,
    attributes: [
      {
        trait_type: 'stroke count',
        value: lineCount,
      },
    ],
    seed,
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
    const { outputImagePath, lineCount } = await createImage(seed, i);

    // Create the metadata
    const metadata = await createMetadata(i, seed, selectedImages, lineCount);

    console.log(`Generated image: ${outputImagePath}`);
    // console.log(`Generated metadata: ${JSON.stringify(metadata, null, 2)}`);
  }
}

// Run the generation process
const instanceCount = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
generateImagesAndMetadata(instanceCount)
  .then(() => console.log('Generation completed!'))
  .catch((err) => console.error('Error during generation:', err));
