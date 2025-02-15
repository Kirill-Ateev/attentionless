const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const {
  applyGrayscale,
  applyHueRotate,
  shuffle,
  capitalizeFirstLetter,
} = require('./utils');
const webp = require('webp-wasm');

const ANIMALS = 'animals';
const ARCHITECTURE = 'architecture';
const ART = 'art';
const FOOD = 'food';
const INSECT = 'insect';
const OTHER = 'other';
const STRANGE = 'strange';
const SURGERY = 'surgery';

// Configurable folders and categories
const categories = [
  ANIMALS,
  ARCHITECTURE,
  ART,
  FOOD,
  INSECT,
  OTHER,
  STRANGE,
  SURGERY,
];
const imageFolderPath = './images';
const outputImagesPath = './output/images';
const outputMetadataPath = './output/metadata';

const resolutionCoefficient = 4;
const canvasSize = 1000 * resolutionCoefficient;
const finalSize = 1024 * resolutionCoefficient;
const signSize = finalSize - canvasSize;

const withDeformation = false;

const imageMinSize = (finalSize * 200 * resolutionCoefficient) / finalSize;
const imageMaxSize = (finalSize * 600 * resolutionCoefficient) / finalSize;

const arcMinSize = (finalSize * 50 * resolutionCoefficient) / finalSize;
const arcMaxSize = (finalSize * 100 * resolutionCoefficient) / finalSize;

const lineMinWidth = (finalSize * 0.5 * resolutionCoefficient) / finalSize;
const lineMaxWidth = (finalSize * 20 * resolutionCoefficient) / finalSize;
const lineMinLength = (finalSize * 50 * resolutionCoefficient) / finalSize;
const lineMaxLength = (finalSize * 300 * resolutionCoefficient) / finalSize;

const centerOffset = (canvasSize * ((finalSize - canvasSize) / 2)) / canvasSize;

const webpConfig = {
  quality: 85,
  method: 6,
  pass: 10,
  exact: 1,
  alpha_compression: 1,
  alpha_filtering: 2,
  alpha_quality: 100,
  partitions: 3,
  autofilter: 1,
  use_sharp_yuv: 1, // если требуется максимально точная цветопередача
  // Остальные параметры оставляем по умолчанию
};

const imageCache = new Map();

async function cachedLoadImage(imagePath) {
  if (imageCache.has(imagePath)) {
    return imageCache.get(imagePath);
  }
  const image = await loadImage(imagePath);
  imageCache.set(imagePath, image);
  return image;
}

// Helper function to generate deterministic random values based on a seed
function seededRandom(seed) {
  const hash = crypto
    .createHash('sha256')
    .update(`${seed}_ATTENTIONLESS`)
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

function addStrokeEffects(ctx, seedRand) {
  const lineCount = seedRand() > 0.3 ? 0 : Math.floor(seedRand() * 10); // Количество линий

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
      const length = lineMinLength + seedRand() * lineMaxLength;
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
      ctx.lineWidth = lineMinWidth + seedRand() * lineMaxWidth;

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

function prepareImageTransformation(ctx, image, seedRand, x, y) {
  // Вычисляем основные параметры
  const size = imageMinSize + seedRand() * imageMaxSize; // Размер от 200 до 800
  const rotation = seedRand() * 360; // Поворот от 0 до 360 градусов
  const deformation = withDeformation ? 1 + seedRand() : 1; // Коэффициент деформации (0...1)

  // Приблизительная площадь (можно настроить по желанию)
  const computedArea = size * size * deformation;

  // Сохраним остальные случайные значения, чтобы не вызывать seedRand() повторно при отрисовке
  const rotationDivisor = seedRand() * 360;
  const effect = seedRand();
  const originWidth = seedRand() > 0.5 ? image.width : ctx.canvas.width;
  const originHeight = seedRand() > 0.5 ? image.height : ctx.canvas.height;

  const expanded = seedRand() > 0.5;
  const width = expanded
    ? originWidth + size
    : Math.max(Math.ceil(originWidth), 1);
  const height = expanded
    ? originHeight + size
    : Math.max(Math.ceil(originHeight), 1);

  const alpha = seedRand() * 0.5 + 0.25;

  const effectParams = {
    val1: seedRand(),
    val2: seedRand(),
  };

  // Возвращаем объект с вычисленной площадью и функцией отрисовки
  return {
    area: computedArea,
    draw: () => {
      ctx.save();

      // Перенос для поворота
      ctx.translate(x + size / 4, y + size / 4);
      ctx.rotate((rotation * Math.PI) / (rotationDivisor || 1));
      ctx.translate(-(x + size / 4), -(y + size / 4));

      // Применяем эффекты
      if (seedRand() < 0.05) {
        applyGrayscale(
          ctx,
          effectParams.val1 * image.width,
          effectParams.val2 * image.height
        );
      }

      if (effect > 0.65) {
        applyHueRotate(ctx, width, height, seedRand() * 360);
      }

      if (effect < (size - imageMinSize) / imageMaxSize) {
        ctx.globalAlpha = alpha;
      }

      // Отрисовка изображения с учётом деформации
      ctx.drawImage(image, x, y, size * deformation, size);
      ctx.restore();
    },
  };
}

// Create collage image
async function createImage(seed, instanceNumber) {
  const seedRand = seededRandom(seed);
  const canvas = createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d');
  const drawQueue = [];

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
      arcMinSize + seedRand() * arcMaxSize,
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

  // Load images from each category in parallel
  const imagesByCategoryEntries = await Promise.all(
    shuffledCategories.map(async (category) => {
      const images = await loadImagesFromCategory(category);
      return [category, images];
    })
  );
  const imagesByCategory = Object.fromEntries(imagesByCategoryEntries);

  const selectedImages = {};

  // Place each category's image on the canvas with parallel image loading
  for (const category of shuffledCategories) {
    const images = imagesByCategory[category];
    const min = {
      [ANIMALS]: 1,
      [ARCHITECTURE]: 1,
      [ART]: 3,
      [FOOD]: 4,
      [INSECT]: 3,
      [OTHER]: 6,
      [STRANGE]: 2,
      [SURGERY]: 2,
    };
    const factor = {
      [ANIMALS]: 5,
      [ARCHITECTURE]: 5,
      [ART]: 8,
      [FOOD]: 15,
      [INSECT]: 8,
      [OTHER]: 20,
      [STRANGE]: 8,
      [SURGERY]: 6,
    };
    const selectedImagesCount =
      min[category] + Math.floor(seedRand() * factor[category]);

    // Собираем массив промисов для загрузки изображений параллельно
    const promises = [];
    for (let k = 0; k < selectedImagesCount; k++) {
      const randomImage = images[Math.floor(seedRand() * images.length)];
      console.log(`[createImage]: Loading image: ${randomImage.path}`);
      const promise = cachedLoadImage(randomImage.path)
        .then((image) => {
          // Генерация случайных координат для изображения после загрузки
          const x = seedRand() * (canvasSize - imageMinSize);
          const y = seedRand() * (canvasSize - imageMinSize);
          const element = prepareImageTransformation(
            ctx,
            image,
            seedRand,
            x,
            y
          );
          return { element, category, fileName: randomImage.fileName };
        })
        .catch((err) => {
          console.error(`Failed to load image: ${randomImage.path}`, err);
          throw err;
        });
      promises.push(promise);
    }
    // Ожидаем, пока загрузятся все изображения для данной категории
    const loadedImages = await Promise.all(promises);
    loadedImages.forEach(({ element, category, fileName }) => {
      drawQueue.push(element);
      selectedImages[
        `${capitalizeFirstLetter(category)} image №${fileName.slice(0, -4)}`
      ] = 'Present';
    });
  }

  // После подготовки всех элементов сортируем их по убыванию площади и отрисовываем:
  drawQueue.sort((a, b) => b.area - a.area);
  drawQueue.forEach((item) => item.draw());

  // Create a larger canvas with 1024x1024 for white frame
  const finalCanvas = createCanvas(finalSize, finalSize);
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.fillStyle = '#FFFFFF';
  finalCtx.fillRect(0, 0, finalSize, finalSize);

  // Draw the 1000x1000 image at the center of the 1024x1024 canvas
  finalCtx.drawImage(canvas, centerOffset, centerOffset);

  // Добавляем эффект рукописных пометок
  const { lineCount } = addStrokeEffects(finalCtx, seedRand); // Уникальный seed для эффекта

  // Читаем .webp как буфер
  const initialsBuffer = fs.readFileSync(path.join(__dirname, 'initials.webp'));

  // Декодируем в RGBA-массив
  const { data, width, height } = await webp.decode(initialsBuffer);

  // Создаём временное изображение из данных RGBA
  const initialsCanvas = createCanvas(width, height);
  const initialsCtx = initialsCanvas.getContext('2d');
  const imageData = initialsCtx.createImageData(width, height);
  imageData.data.set(data);
  initialsCtx.putImageData(imageData, 0, 0);

  // Рисуем на финальном холсте
  finalCtx.save();
  finalCtx.globalAlpha = 0.7;
  finalCtx.drawImage(
    initialsCanvas,
    finalSize - signSize - signSize,
    finalSize - signSize - signSize,
    signSize,
    signSize
  );
  finalCtx.restore();

  // extract modified pixels from canvas
  let finalImgData = finalCtx.getImageData(0, 0, finalSize, finalSize);

  // compress back to WebP
  let buffer = await webp.encode(finalImgData, webpConfig);

  // Save the image to the output folder
  const outputImagePath = path.join(outputImagesPath, `${instanceNumber}.webp`);

  if (!buffer) {
    throw new Error('Failed to generate image buffer');
  }

  await fs.ensureDir(outputImagesPath);
  await fs.writeFile(outputImagePath, buffer);

  return { outputImagePath, lineCount, selectedImages };
}

// Create metadata for the image
async function createMetadata(instanceNumber, seed, selectedImages, lineCount) {
  const metadata = {
    name: `Attentionless №${instanceNumber}`,
    description: 'Attentionless collection by Kirill Ateev',
    image: `${instanceNumber}.webp`,
    attributes: [
      {
        trait_type: 'Stroke count',
        value: lineCount,
      },
    ],
    external_url: 'ateev.art',
    seed,
  };

  // Add image attributes based on selected images
  for (const [category, imageData] of Object.entries(selectedImages)) {
    // const imageNumber = path.basename(imageData.fileName, '.webp'); // Extract number from file name
    metadata.attributes.push({
      trait_type: category,
      value: imageData,
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

    // Create the image
    const { outputImagePath, lineCount, selectedImages } = await createImage(
      seed,
      i
    );

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
