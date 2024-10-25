// compress.js
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const tinify = require('tinify');
tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n'; // Замените 'YOUR_API_KEY_HERE' на ваш реальный API ключ от Tinify

ipcMain.on('compress-image', (event) => {
    // Выполняем AppleScript для получения пути к выбранному файлу
    const appleScript = `
        tell application "Finder"
            set selectedItems to selection
            if (count of selectedItems) is 0 then
                display dialog "Выберите изображение в Finder." buttons {"OK"} default button 1
                return
            end if
            set theFile to first item of selectedItems as alias
            set theFilePath to POSIX path of theFile
            return theFilePath
        end tell
    `;

    // Выполняем osascript для запуска AppleScript
    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка получения пути к изображению: ${error.message}`);
            event.reply('compress-response', 'Ошибка получения пути к изображению');
            return;
        }

        const imagePath = stdout.trim(); // Путь к выбранному изображению
        if (!imagePath) {
            event.reply('compress-response', 'Изображение не выбрано');
            return;
        }

        // Настраиваем выходной путь для сжатого изображения
        const outputPath = imagePath.replace(/(\.\w+)$/, '-compressed$1');

        // Используем Tinify API для сжатия изображения
        tinify.fromFile(imagePath).toFile(outputPath, (compressError) => {
            if (compressError) {
                console.error(`Ошибка сжатия изображения: ${compressError.message}`);
                event.reply('compress-response', 'Ошибка сжатия изображения');
                return;
            }

            event.reply('compress-response', `Изображение успешно сжато и сохранено в ${outputPath}`);
        });
    });
});
