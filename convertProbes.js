const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// Конфигурация путей
const SOURCE_DIR = path.join(__dirname, 'probes/5');
const TARGET_DIR = path.join(__dirname, 'probes/6');

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
    const outputPath = path.join(targetDir, `${fileName}.png`);

    await sharp(filePath).png({ quality: 100 }).toFile(outputPath);

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
