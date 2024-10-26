// search.js
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');

ipcMain.on('search-string', (event, searchString) => {
    // Выполняем AppleScript для получения путей к выбранным файлам
    const appleScript = `
        tell application "Finder"
            set selectedItems to selection
            if (count of selectedItems) is 0 then
                display dialog "Выберите файлы в Finder." buttons {"OK"} default button 1
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
            console.error(`Ошибка получения путей к файлам: ${error.message}`);
            event.reply('search-response', 'Ошибка получения путей к файлам');
            return;
        }

        const filePaths = stdout.trim().split(",").filter(Boolean); // Массив путей к выбранным файлам
        if (filePaths.length === 0) {
            event.reply('search-response', 'Файлы не выбраны или пути невалидны');
            return;
        }

        // Переменные для отслеживания результатов поиска
        let filesWithMatch = [];
        let filesWithoutMatch = [];
        let filesProcessed = 0;
        const totalFiles = filePaths.length;
        const errors = [];

        filePaths.forEach((filePath) => {
            if (!filePath) {
                errors.push('Путь к файлу пуст');
                return;
            }

            // Чтение содержимого файла и поиск строки
            fs.readFile(filePath, 'utf8', (readError, data) => {
                if (readError) {
                    console.error(`Ошибка чтения файла ${filePath}: ${readError.message}`);
                    errors.push(`Ошибка чтения файла ${filePath}`);
                } else if (data.includes(searchString)) {
                    filesWithMatch.push(filePath);
                } else {
                    filesWithoutMatch.push(filePath);
                }

                filesProcessed++;
                // Проверка, все ли файлы обработаны
                if (filesProcessed === totalFiles) {
                    if (errors.length === 0) {
                        if (filesWithMatch.length > 0) {
                            event.reply(
                                'search-response',
                                `Строка найдена в файлах: \r\n ${filesWithMatch.join(', \r\n')} \r\n \r\n Строка не найдена в файлах: \r\n ${filesWithoutMatch.join(', \r\n')}`
                               
                            );
                        } else {
                            event.reply('search-response', 'Строка не найдена ни в одном из файлов');
                        }
                    } else {
                        event.reply(
                            'search-response',
                            `Поиск завершен с ошибками: ${errors.join('; ')}`
                        );
                    }
                }
            });
        });
    });
});
