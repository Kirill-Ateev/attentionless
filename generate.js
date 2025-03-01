const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const {
  applyGrayscale,
  applyHueRotate,
  shuffle,
  capitalizeFirstLetter,
  clamp,
  applyBackgroundNoise,
  loadImageWithSharp,
} = require('./utils');
const webp = require('webp-wasm');
const sharp = require('sharp');

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
const imageFolderPath = './imagesConverted';
const outputImagesPath = './output/images';
const outputMetadataPath = './output/metadata';

// Использовать с предварительно конвертированными в webp картинками в imagesConverted
const isUsingSharp = true;
const isUsingCachedImages = false;

const resolutionCoefficient = 4;
const canvasSize = 1000 * resolutionCoefficient;
const finalSize = 1024 * resolutionCoefficient;
const signSize = finalSize - canvasSize;
const maxHarmonicColors = 6;

const imageMinSize = (finalSize * 200 * resolutionCoefficient) / finalSize;
const imageMaxSize = (finalSize * 700 * resolutionCoefficient) / finalSize;

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
  // lossless: 1,
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

const webpConfigSharp = {
  quality: 90,
  effort: 6,
  smartSubsample: true,
  // nearLossless: true,
  // lossless: 1,
};

const imageCache = new Map();

async function cachedLoadImage(imagePath) {
  if (!isUsingCachedImages) {
    let image;
    if (isUsingSharp) {
      // Загружаем буфер webp в canvas
      image = await loadImageWithSharp(imagePath);
    } else {
      image = await loadImage(imagePath);
    }
    return image;
  }

  if (imageCache.has(imagePath)) {
    return imageCache.get(imagePath);
  }
  let image;
  if (isUsingSharp) {
    // Загружаем буфер webp в canvas
    image = await loadImageWithSharp(imagePath);
  } else {
    image = await loadImage(imagePath);
  }

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
    .filter((file) => file.endsWith('.webp') || file.endsWith('.png'))
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
  const lineCount = seedRand() > 0.45 ? 0 : Math.floor(seedRand() * 12); // Количество линий

  const colors =
    seedRand() > 0.3
      ? [
          `hsl(${Math.floor(seedRand() * 360)}, ${Math.floor(
            seedRand() * 100
          )}%, ${Math.floor(seedRand() * 90)}%)`,
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
    ctx.globalAlpha = 0.3 + seedRand();

    ctx.stroke();
  }

  ctx.restore();
  return { lineCount };
}

function generateHarmonicParams(baseSat, baseLight, seedRand) {
  return {
    schemeType: Math.floor(seedRand() * 5),
    hueVariance: 15 + seedRand() * 30, // Максимум 45°
    satVariance: 10 + seedRand() * 10, // Максимум 20%
    baseSat: clamp(baseSat, 30, 70), // Исключаем крайние значения
    baseLight: clamp(baseLight, 25, 75),
    patternDensity: Math.floor(seedRand() * 3), // 0-2
    accentChance: seedRand() * 0.3, // Макс 30% шанс акцента
  };
}

function getDynamicHarmonicHues(baseHue, params, seedRand) {
  const MAX_COLORS = maxHarmonicColors; // Максимум цветов в палитре
  const hues = new Set([baseHue]);

  const maxHueVariance = 45;
  const angleVariations = Math.min(
    params.hueVariance * (params.dynamicAngles ? seedRand() : 1),
    maxHueVariance
  );

  // Мягкие схемы
  switch (params.schemeType % 5) {
    case 0: // Аналогичная схема
      [1, -1, 2, -2].forEach((offset) => {
        if (hues.size >= MAX_COLORS) return;
        hues.add((baseHue + (offset * angleVariations) / 2) % 360);
      });
      break;

    case 1: // Мягкая комплементарная
      const comp = (baseHue + 180) % 360;
      hues.add(comp);
      [comp + 15, comp - 15].forEach((h) => hues.add(h % 360));
      break;

    case 2: // Триада с вариациями
      const triadStep = 120 + (seedRand() * 40 - 20);
      for (let i = 1; i <= 2; i++) {
        const triadHue = (baseHue + triadStep * i) % 360;
        hues.add(triadHue);
        [triadHue + 10, triadHue - 10].forEach((h) => hues.add(h % 360));
      }
      break;

    case 3: // Монохроматическая с акцентами
      for (let i = 0; i < 3; i++) {
        hues.add((baseHue + seedRand() * 20 - 10) % 360);
      }
      break;

    case 4: // Сложная гармония
      const angles = [30, 60, 90, 120, 150, 180];
      angles.slice(0, 3 + params.patternDensity).forEach((angle) => {
        hues.add((baseHue + angle * (seedRand() > 0.5 ? 1 : -1)) % 360);
      });
      break;
  }

  // Ограничиваем максимальное количество цветов
  const finalHues = Array.from(hues).slice(0, MAX_COLORS);

  return finalHues.map((h) => ({
    hue: h,
    saturation: clamp(
      params.baseSat + (seedRand() * 20 - 10),
      Math.max(20, params.baseSat - 15),
      Math.min(80, params.baseSat + 15)
    ),
    lightness: params.baseLight,
  }));
}

function prepareImageTransformation(
  ctx,
  image,
  seedRand,
  centerX,
  centerY,
  options
) {
  // Вычисляем основные параметры
  const size = imageMinSize + seedRand() * imageMaxSize;
  const rotation = seedRand() * 360; // Поворот от 0 до 360 градусов
  const deformation = seedRand(); // Коэффициент деформации (0...1)

  // Сохраним остальные случайные значения, чтобы не вызывать seedRand() повторно при отрисовке
  const effect = seedRand();
  const originWidth = seedRand() > 0.5 ? image.width : ctx.canvas.width;
  const originHeight = seedRand() > 0.5 ? image.height : ctx.canvas.height;

  // Cкейл картинки для 99% вариантов
  const scale = size / Math.max(image.width, image.height);
  const newWidth =
    deformation > 0.99 ? size * seedRand() : Math.max(image.width, 1) * scale;
  const newHeight =
    deformation > 0.99 ? size : Math.max(image.height, 1) * scale;

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
  const finalX = centerX - newWidth / 2;
  const finalY = centerY - newHeight / 2;

  // Возвращаем объект с вычисленной площадью и функцией отрисовки
  return {
    area: newWidth * newHeight,
    draw: () => {
      ctx.save();

      // Перенос для поворота
      ctx.translate(finalX + newWidth / 2, finalY + newHeight / 2);
      ctx.rotate((rotation * Math.PI) / 360);
      ctx.translate(-(finalX + newWidth / 2), -(finalY + newHeight / 2));

      // Применяем эффекты
      if (seedRand() > 0.95) {
        applyGrayscale(
          ctx,
          finalX,
          finalY,
          effectParams.val1 * newWidth,
          effectParams.val2 * newHeight
        );
      }

      if (seedRand() > 0.8) {
        applyBackgroundNoise(ctx, width, height, seedRand);
        ctx.drawImage(image, finalX, finalY, newWidth, newHeight);
      }

      // добавление пунктирных линий
      if (seedRand() > 0.7) {
        options.onDashedLine();
        const length =
          (5 + Math.floor(seedRand() * 30)) * resolutionCoefficient;
        ctx.save();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4 * resolutionCoefficient;
        ctx.setLineDash([length, length]);
        ctx.strokeRect(0, 0, width, height);
        ctx.restore();
      }

      if (effect > 0.65) {
        if (options.colorStrategy === 'harmonic') {
          const color =
            options.harmonicHues[
              Math.floor(seedRand() * options.harmonicHues.length)
            ];
          const hueShift = color.hue;
          const satShift = color.saturation;

          applyHueRotate(ctx, width, height, hueShift, satShift);
        } else {
          applyHueRotate(ctx, width, height, seedRand() * 360);
        }
      }

      if (effect < (size - imageMinSize) / imageMaxSize) {
        ctx.globalAlpha = alpha;
      }

      // Отрисовка изображения с учётом деформации
      ctx.drawImage(image, finalX, finalY, newWidth, newHeight);
      ctx.restore();
    },
  };
}

// Create collage image
async function createImage(seed, instanceNumber) {
  const seedRand = seededRandom(seed);
  let canvas = createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d');
  const drawQueue = [];
  let dashedLinesCount = 0;

  // Генерация случайного основного цвета
  const hue = Math.floor(seedRand() * 360);
  const saturation = Math.floor(seedRand() * 100);
  const lightness = Math.floor(seedRand() * 90);
  const baseColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  const colorStrategy = seedRand() > 0.3 ? 'harmonic' : 'chaotic';
  const harmonicParams = generateHarmonicParams(
    saturation,
    lightness,
    seedRand
  );
  const harmonicHues = getDynamicHarmonicHues(hue, harmonicParams, seedRand);

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
      [ARCHITECTURE]: 2,
      [ART]: 3,
      [FOOD]: 4,
      [INSECT]: 2,
      [OTHER]: 7,
      [STRANGE]: 2,
      [SURGERY]: 2,
    };
    const factor = {
      [ANIMALS]: 3,
      [ARCHITECTURE]: 5,
      [ART]: 8,
      [FOOD]: 15,
      [INSECT]: 8,
      [OTHER]: 22,
      [STRANGE]: 8,
      [SURGERY]: 5,
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
          const centerX = seedRand() * canvasSize;
          const centerY = seedRand() * canvasSize;
          const element = prepareImageTransformation(
            ctx,
            image,
            seedRand,
            centerX,
            centerY,
            {
              colorStrategy,
              harmonicHues,
              harmonicParams,
              onDashedLine: () => dashedLinesCount++,
            }
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
      // Формируем ключ для выбранного изображения
      const key = `${capitalizeFirstLetter(category)} image №${fileName.slice(
        0,
        isUsingSharp ? -5 : -4
      )}`;
      // Увеличиваем счетчик для каждого вхождения (если изображение выбрано более одного раза, оно учитывается столько раз)
      selectedImages[key] = (selectedImages[key] || 0) + 1;
    });
  }

  // После подготовки всех элементов сортируем их по убыванию площади и отрисовываем:
  drawQueue.sort((a, b) => b.area - a.area);
  drawQueue.forEach((item) => item.draw());

  // Create a larger canvas with 1024x1024 for white frame
  let finalCanvas = createCanvas(finalSize, finalSize);
  let finalCtx = finalCanvas.getContext('2d');
  finalCtx.fillStyle = '#FFFFFF';
  finalCtx.fillRect(0, 0, finalSize, finalSize);

  // Draw the 1000x1000 image at the center of the 1024x1024 canvas
  finalCtx.drawImage(canvas, centerOffset, centerOffset);

  // Добавляем эффект рукописных пометок
  const { lineCount } = addStrokeEffects(finalCtx, seedRand); // Уникальный seed для эффекта

  // Читаем .webp как буфер
  const initialsBuffer = fs.readFileSync(path.join(__dirname, 'initials.webp'));

  let data, width, height;
  if (isUsingSharp) {
    // Декодирование через sharp
    const sharpInstance = sharp(initialsBuffer);
    const metadata = await sharpInstance.metadata();
    width = metadata.width;
    height = metadata.height;
    const rawBuffer = await sharpInstance
      .ensureAlpha() // Добавляем альфа-канал
      .raw()
      .toBuffer();
    data = new Uint8ClampedArray(rawBuffer.buffer);
  } else {
    // Cпособ с webp-wasm
    const decoded = await webp.decode(initialsBuffer);
    data = decoded.data;
    width = decoded.width;
    height = decoded.height;
  }

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

  let buffer;
  if (isUsingSharp) {
    const finalImgData = finalCtx.getImageData(0, 0, finalSize, finalSize);

    buffer = await sharp(Buffer.from(finalImgData.data.buffer), {
      raw: {
        width: finalSize,
        height: finalSize,
        channels: 4,
      },
    })
      .toFormat('webp', webpConfigSharp)
      .toBuffer();
  } else {
    const finalImgData = finalCtx.getImageData(0, 0, finalSize, finalSize);
    buffer = await webp.encode(finalImgData, webpConfig);
  }

  // Save the image to the output folder
  const outputImagePath = path.join(outputImagesPath, `${instanceNumber}.webp`);

  if (!buffer) {
    throw new Error('Failed to generate image buffer');
  }

  await fs.ensureDir(outputImagesPath);
  await fs.writeFile(outputImagePath, buffer);

  // принудительное очищение кэша
  // buffer = null;
  // finalCanvas = null;
  // canvas = null;
  // imageCache.clear(); // Добавляем принудительную очистку кеша

  return {
    outputImagePath,
    lineCount,
    selectedImages,
    dashedLinesCount,
    harmonicType: harmonicParams.schemeType,
  };
}

// Create metadata for the image
async function createMetadata(
  instanceNumber,
  seed,
  selectedImages,
  lineCount,
  dashedLinesCount,
  harmonicType
) {
  const imageEntries = Object.entries(selectedImages);
  const totalImageCount = imageEntries.reduce(
    (sum, [, count]) => sum + count,
    0
  );
  const metadata = {
    name: `Attentionless №${instanceNumber}`,
    description: 'Attentionless collection by Kirill Ateev',
    image: `${instanceNumber}.webp`,
    external_url: 'https://ateev.art',
    seed,
    attributes: [
      {
        trait_type: 'Harmonic type',
        value: harmonicType,
      },
      {
        trait_type: 'Number of images',
        value: totalImageCount,
      },
      {
        trait_type: 'Number of strokes',
        value: lineCount,
      },
      {
        trait_type: 'Number of dashed frames',
        value: dashedLinesCount,
      },
    ],
  };

  // Add image attributes based on selected images
  for (const [category, count] of imageEntries) {
    metadata.attributes.push({
      trait_type: category,
      value: count,
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
async function generateImagesAndMetadata(instanceCount = 1, from) {
  for (let i = from || 1; i <= instanceCount; i++) {
    const seed = generateSeed();
    console.log(`Generating instance #${i} with seed: ${seed}`);
    console.log(`Start time: ${new Date().toLocaleString()}`);

    // Create the image
    const {
      outputImagePath,
      lineCount,
      selectedImages,
      dashedLinesCount,
      harmonicType,
    } = await createImage(seed, i);

    // Create the metadata
    const metadata = await createMetadata(
      i,
      seed,
      selectedImages,
      lineCount,
      dashedLinesCount,
      harmonicType
    );

    console.log(`Generated image: ${outputImagePath}`);
    // console.log(`Generated metadata: ${JSON.stringify(metadata, null, 2)}`);
  }
}

// Run the generation process
const instanceCount = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
const startFrom = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
generateImagesAndMetadata(instanceCount, startFrom)
  .then(() => console.log('Generation completed!'))
  .catch((err) => console.error('Error during generation:', err));
