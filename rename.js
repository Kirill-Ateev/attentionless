const fs = require('fs');
const path = require('path');

// Конфигурация
const IMAGES_ROOT = path.join(__dirname, 'images');
const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
]);

// Основная функция
function renameImages() {
  try {
    // Получаем список папок первого уровня
    const folders = fs
      .readdirSync(IMAGES_ROOT, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const folder of folders) {
      const folderPath = path.join(IMAGES_ROOT, folder);

      // Получаем и фильтруем файлы
      const files = fs
        .readdirSync(folderPath)
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return ALLOWED_EXTENSIONS.has(ext);
        })
        .sort((a, b) => a.localeCompare(b)); // Сортировка по имени

      let counter = 1;

      for (const file of files) {
        const oldPath = path.join(folderPath, file);
        const extension = path.extname(file);
        const newName = `${counter}${extension}`;
        const newPath = path.join(folderPath, newName);

        try {
          fs.renameSync(oldPath, newPath);
          console.log(`✅ [${folder}] Переименован: ${file} -> ${newName}`);
        } catch (error) {
          console.error(
            `❌ [${folder}] Ошибка при переименовании ${file}:`,
            error.message
          );
        }

        counter++;
      }
    }

    console.log('Готово! Все изображения обработаны.');
  } catch (error) {
    console.error('Ошибка в основном потоке:', error.message);
  }
}

// Запуск
renameImages();
