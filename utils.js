const { createCanvas } = require('canvas');
const sharp = require('sharp');

function applyGrayscale(ctx, x, y, width, height) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  // Если запрошенная область полностью вне canvas, просто выходим
  if (
    x >= canvasWidth ||
    y >= canvasHeight ||
    x + width <= 0 ||
    y + height <= 0
  ) {
    return;
  }

  // Обрезаем координаты, чтобы они не выходили за пределы canvas
  const clampedX = Math.max(0, x);
  const clampedY = Math.max(0, y);
  const clampedWidth = Math.min(width, canvasWidth - clampedX);
  const clampedHeight = Math.min(height, canvasHeight - clampedY);

  // проверка достаточно ли пространства
  if (clampedWidth < 1 || clampedHeight < 1) return;

  const imageData = ctx.getImageData(
    clampedX,
    clampedY,
    clampedWidth,
    clampedHeight
  );
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  ctx.putImageData(imageData, clampedX, clampedY);
}

// Преобразование RGB -> HSL
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // Нет насыщенности, оттенок не определён
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return [h, s, l];
}

// Преобразование HSL -> RGB
function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r * 255, g * 255, b * 255];
}

// Функция для применения эффекта hue-rotate
function applyHueRotate(ctx, width, height, degrees, satDelta = 0) {
  // Убираем lightDelta
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const hueShift = degrees / 360;
  const satMod = 1 + satDelta / 100;

  for (let i = 0; i < data.length; i += 4) {
    let [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);

    // Применяем ТОЛЬКО hue и saturation
    h = (h + hueShift) % 1;
    s = clamp(s * satMod, 0, 1);

    // Lightness остаётся оригинальной
    const [nr, ng, nb] = hslToRgb(h, s, l); // l не меняется
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }

  ctx.putImageData(imageData, 0, 0);
}

function applyBackgroundNoise(ctx, width, height, seedRand) {
  const intensity = 0.4 + seedRand() * 0.7;
  const alpha = 0.1 + seedRand() * 0.3;
  const noiseCanvas = createCanvas(width, height);
  const noiseCtx = noiseCanvas.getContext('2d');
  const imageData = noiseCtx.createImageData(width, height);

  // Градиентный шум
  for (let i = 0; i < imageData.data.length; i += 4) {
    const value = Math.floor(seedRand() * 55 + 200); // Светлые оттенки 200-255
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
    imageData.data[i + 3] = seedRand() < intensity ? alpha * 255 : 0;
  }

  noiseCtx.putImageData(imageData, 0, 0);

  // Рисуем без масштабирования
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(noiseCanvas, 0, 0);
  ctx.restore();
}

async function loadImageWithSharp(imagePath) {
  try {
    const sharpInstance = sharp(imagePath);
    const metadata = await sharpInstance.metadata();
    const width = metadata.width;
    const height = metadata.height;
    const rawBuffer = await sharpInstance
      .ensureAlpha() // Добавляем альфа-канал
      .raw()
      .toBuffer();

    // Создаём временное изображение из данных RGBA
    const initialCanvas = createCanvas(width, height);
    const initialCtx = initialCanvas.getContext('2d');
    const imageData = initialCtx.createImageData(width, height);
    imageData.data.set(new Uint8ClampedArray(rawBuffer));
    initialCtx.putImageData(imageData, 0, 0);

    return initialCanvas;
  } catch (err) {
    console.error(`[loadImageWithSharp] Critical error with ${imagePath}:`, {
      message: err.message,
      stack: err.stack,
    });
    throw new Error(`Failed to process image: ${imagePath}`);
  }
}

function shuffle(arr, randomNumber) {
  const newArr = arr.slice();
  for (let i = newArr.length - 1; i > 0; i--) {
    const rand = Math.floor(randomNumber * (i + 1));
    [newArr[i], newArr[rand]] = [newArr[rand], newArr[i]];
  }
  return newArr;
}

function cubicBezier(t, p0, p1, p2, p3) {
  return (
    Math.pow(1 - t, 3) * p0 +
    3 * Math.pow(1 - t, 2) * t * p1 +
    3 * (1 - t) * Math.pow(t, 2) * p2 +
    Math.pow(t, 3) * p3
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function capitalizeFirstLetter(string) {
  return string[0].toUpperCase() + string.slice(1);
}

module.exports = {
  applyGrayscale,
  applyHueRotate,
  applyBackgroundNoise,
  loadImageWithSharp,
  shuffle,
  cubicBezier,
  clamp,
  capitalizeFirstLetter,
};
