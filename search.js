// search.js
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');

ipcMain.on('search-string', (event, searchString) => {
    // Получаем путь к выделенному файлу с помощью osascript
    exec('osascript -e \'tell application "Finder" to get POSIX path of (selection as alias)\'', (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка получения выделенных файлов: ${error.message}`);
            event.reply('search-response', 'Ошибка получения выделенных файлов');
            return;
        }

        const filePath = stdout.trim(); // Получаем путь к выделенному файлу
        if (!filePath) {
            event.reply('search-response', 'Файл не выбран');
            return;
        }
            
        // Читаем содержимое файла и ищем строку
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error(`Ошибка чтения файла: ${err.message}`);
                event.reply('search-response', 'Ошибка чтения файла');
                return;
            }

            if (data.includes(searchString)) {
                event.reply('search-response', `Строка найдена в файле: ${filePath}`);
            } else {
                event.reply('search-response', 'Строка не найдена');
            }
        });
    });
});
