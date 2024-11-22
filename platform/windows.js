const { dialog } = require('electron');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

/**
 * Архивирует выбранные папки в проводнике Windows.
 * @param {Function} callback - Функция для обработки результата.
 */
async function archiveSelectedItems(callback) {
    // Показываем диалоговое окно для выбора папок
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'multiSelections'], // Позволяет выбирать несколько папок
        title: "Выберите папки для архивации"
    });

    if (result.canceled || result.filePaths.length === 0) {
        callback("Нет выбранных папок для архивации");
        return;
    }

    const folderPaths = result.filePaths; // Массив путей к выбранным папкам
    let archivedCount = 0;

    folderPaths.forEach(folderPath => {
        const folderName = path.basename(folderPath);
        const outputZipPath = path.join(path.dirname(folderPath), `${folderName}.zip`);

        // Создаем поток записи для архива
        const output = fs.createWriteStream(outputZipPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Уровень сжатия
        });

        output.on('close', () => {
            archivedCount++;
            if (archivedCount === folderPaths.length) {
                callback(`Архивирование завершено успешно. Архивировано папок: ${archivedCount}`);
            }
        });

        archive.on('error', (err) => {
            console.error(`Ошибка архивации папки ${folderName}: ${err.message}`);
            callback(`Ошибка архивации папки ${folderName}`);
        });

        archive.pipe(output);
        archive.glob('**/*', {
            cwd: folderPath,
            ignore: ['**/*.fla', '**/.DS_Store'] // Игнорируем файлы с расширениями
        });
        archive.finalize();
    });
}
module.exports = {
    archiveSelectedItems
};