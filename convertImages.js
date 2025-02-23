const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// interface WebpOptions extends OutputOptions, AnimationOptions {
//     /** Quality, integer 1-100 (optional, default 80) */
//     quality?: number | undefined;
//     /** Quality of alpha layer, number from 0-100 (optional, default 100) */
//     alphaQuality?: number | undefined;
//     /** Use lossless compression mode (optional, default false) */
//     lossless?: boolean | undefined;
//     /** Use near_lossless compression mode (optional, default false) */
//     nearLossless?: boolean | undefined;
//     /** Use high quality chroma subsampling (optional, default false) */
//     smartSubsample?: boolean | undefined;
//     /** Level of CPU effort to reduce file size, integer 0-6 (optional, default 4) */
//     effort?: number | undefined;
//     /** Prevent use of animation key frames to minimise file size (slow) (optional, default false) */
//     minSize?: boolean;
//     /** Allow mixture of lossy and lossless animation frames (slow) (optional, default false) */
//     mixed?: boolean;
//     /** Preset options: one of default, photo, picture, drawing, icon, text (optional, default 'default') */
//     preset?: keyof PresetEnum | undefined;
// }

const webpConfig = {
  quality: 100,
  effort: 6,
  smartSubsample: true,
  // nearLossless: true,
  //   lossless: true
};

// Конфигурация путей
const SOURCE_DIR = path.join(__dirname, 'images');
const TARGET_DIR = path.join(__dirname, 'imagesConverted');

// Поддерживаемые форматы изображений
const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.tiff',
  '.avif',
  '.heic',
  '.svg',
]);

async function processDirectory(sourcePath, targetPath) {
  // Создаем целевую директорию если не существует
  await fs.mkdir(targetPath, { recursive: true });

  // Читаем содержимое исходной директории
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  // Обрабатываем каждый элемент в директории
  await Promise.all(
    entries.map(async (entry) => {
      const entrySourcePath = path.join(sourcePath, entry.name);
      const entryTargetPath = path.join(targetPath, entry.name);

      if (entry.isDirectory()) {
        // Рекурсивная обработка поддиректорий
        await processDirectory(entrySourcePath, entryTargetPath);
      } else if (entry.isFile()) {
        // Обработка файлов
        await processFile(entrySourcePath, targetPath);
      }
    })
  );
}

async function processFile(filePath, targetDir) {
  try {
    const extension = path.extname(filePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      console.log(`Skipping unsupported file: ${filePath}`);
      return;
    }

    // Формируем новое имя файла с расширением webp
    const fileName = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(targetDir, `${fileName}.webp`);

    // Конвертация в WebP с исходным качеством
    await sharp(filePath)
      .webp(webpConfig) // 100 = максимальное качество
      .toFile(outputPath);

    console.log(`Converted: ${filePath} -> ${outputPath}`);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error.message);
  }
}

async function main() {
  console.time('Conversion completed in');

  try {
    await processDirectory(SOURCE_DIR, TARGET_DIR);
    console.log('All images converted successfully!');
  } catch (error) {
    console.error('Fatal error:', error.message);
  }

  console.timeEnd('Conversion completed in');
}

// Запуск программы
main();
