// compress.js
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const tinify = require('tinify');
const fs = require('fs');
const path = require('path');

tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n'; // Замените 'YOUR_API_KEY_HERE' на ваш реальный API ключ от Tinify


ipcMain.on('compress-images', (event) => {
    // Выполняем AppleScript для получения путей к выбранным файлам и папкам
    const appleScript = `
    tell application "Finder"
        set selectedItems to selection
        if (count of selectedItems) is 0 then
            display dialog "Выберите файлы или папки в Finder." buttons {"OK"} default button 1
            return
        end if
        set filePaths to {}
        repeat with theItem in selectedItems
            try
                set theFilePath to POSIX path of (theItem as alias)
                set theFilePath to theFilePath & ","
                copy theFilePath to the end of filePaths
            end try
        end repeat

        return filePaths as string
    end tell

    `;

    // Выполняем osascript для запуска AppleScript
    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка получения путей к элементам: ${error.message}`);
            event.reply('compress-response', 'Ошибка получения путей к элементам');
            return;
        }
        var test = stdout;
        const selectedPaths = stdout.trim().split(",").filter(Boolean); // Разделяем по запятой и удаляем пустые строки
        if (selectedPaths.length === 0) {
            event.reply('compress-response', 'Файлы или папки не выбраны или пути невалидны' + test);
            return;
        }

        // Рекурсивная функция для поиска всех изображений в папке
        const getImagesFromFolder = (folderPath) => {
            let images = [];
            const items = fs.readdirSync(folderPath);
            items.forEach((item) => {
                const itemPath = path.join(folderPath, item);
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                    // Рекурсивно обходим вложенные папки
                    images = images.concat(getImagesFromFolder(itemPath));
                } else if (stats.isFile() && /\.(jpe?g|png|gif)$/i.test(item)) {
                    // Проверяем, является ли файл изображением (JPEG, PNG, GIF)
                    images.push(itemPath);
                }
            });
            return images;
        };

        // Получаем все изображения из выбранных папок и файлов
        let imagePaths = [];
        selectedPaths.forEach((filePath) => {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                // Если это папка, получаем все изображения внутри нее
                imagePaths = imagePaths.concat(getImagesFromFolder(filePath));
            } else if (stats.isFile() && /\.(jpe?g|png|gif)$/i.test(filePath)) {
                // Если это файл, и он является изображением, добавляем его в список
                imagePaths.push(filePath);
            }
        });

        if (imagePaths.length === 0) {
            event.reply('compress-response', 'Не найдены изображения для сжатия');
            return;
        }

        // Сжатие каждого изображения последовательно
        let compressedCount = 0;
        const totalImages = imagePaths.length;
        const errors = [];

        imagePaths.forEach((imagePath) => {
            if (!imagePath) {
                errors.push('Путь к изображению пуст');
                return;
            }

            // Настраиваем выходной путь для сжатого изображения
            const outputPath = imagePath.replace(/(\.\w+)$/, '$1');

            // Используем Tinify API для сжатия изображения
            tinify.fromFile(imagePath).toFile(outputPath, (compressError) => {
                if (compressError) {
                    console.error(`Ошибка сжатия изображения ${imagePath}: ${compressError.message}`);
                    errors.push(`Ошибка сжатия ${imagePath}`);
                }

                compressedCount++;
                // Проверяем, если все изображения обработаны
                if (compressedCount === totalImages) {
                    if (errors.length === 0) {
                        event.reply('compress-response', `Все изображения успешно сжаты (${totalImages})`);
                    } else {
                        event.reply('compress-response', `Сжатие завершено с ошибками: ${errors.join('; ')}`);
                    }
                }
            });
        });
    });
});