// compress.js
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const tinify = require('tinify');
tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n'; // Замените 'YOUR_API_KEY_HERE' на ваш реальный API ключ от Tinify

ipcMain.on('compress-images', (event) => {
    // Выполняем AppleScript для получения путей к выбранным файлам
    const appleScript = `
        tell application "Finder"
            set selectedItems to selection
            if (count of selectedItems) is 0 then
                display dialog "Выберите изображения в Finder." buttons {"OK"} default button 1
                return
            end if
            set filePaths to {}
            repeat with theItem in selectedItems
                -- Проверяем, является ли элемент файлом
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
            console.error(`Ошибка получения путей к изображениям: ${error.message}`);
            event.reply('compress-response', 'Ошибка получения путей к изображениям');
            return;
        }
        console.log("stdout" + stdout);
        const imagePaths = stdout.trim().split(",").filter(Boolean); // Разделяем по запятой и удаляем пустые строки
        if (imagePaths.length === 0) {
            event.reply('compress-response', 'Изображения не выбраны или пути невалидны');
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