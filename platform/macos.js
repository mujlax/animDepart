// macOS.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const tinify = require('tinify');

tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n'; // Замените на ваш реальный API ключ от TinyPNG

/**
 * Архивирует выделенные папки в Finder на macOS.
 * @param {Function} callback - функция для обработки результата.
 */
function archiveSelectedItems(callback) {
    const appleScript = `
            -- Получить выделенные элементы Finder
                tell application "Finder"
                    set selectedItems to selection
                end tell

                -- Пройти по каждому выделенному элементу
                repeat with anItem in selectedItems
                    -- Получить путь к выделенному элементу
                    set itemPath to POSIX path of (anItem as alias)
                    
                    -- Получить имя папки/файла
                    set itemName to name of anItem
                    
                    -- Определить путь для архива
                    set archivePath to POSIX path of (itemPath & "/../" & itemName & ".zip")
                    
                    -- Архивировать содержимое папки без неё самой и исключить .DS_Store
                    do shell script "cd " & quoted form of itemPath & " && zip -r " & quoted form of archivePath & " . -x '*.DS_Store' -x '*.fla'"
                end repeat

            `;

    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка архивирования: ${error.message}`);
            callback('Ошибка архивирования');
            return;
        }
        callback(stdout);
    });
}

/**
 * Ищет строку в файлах, выбранных в Finder.
 * @param {string} searchString - строка для поиска.
 * @param {Function} callback - функция для обработки результата.
 */
function searchInFiles(searchString, callback) {
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

    // exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
    //     if (error) {
    //         console.error(`Ошибка получения путей к файлам: ${error.message}`);
    //         callback('Ошибка получения путей к файлам');
    //         return;
    //     }

    //     const filePaths = stdout.trim().split(",").filter(Boolean);
    //     if (filePaths.length === 0) {
    //         callback('Файлы не выбраны или пути невалидны');
    //         return;
    //     }

    //     let filesWithMatch = [];
    //     let filesWithoutMatch = [];
    //     let filesProcessed = 0;
    //     const errors = [];

    //     filePaths.forEach((filePath) => {
    //         fs.readFile(filePath, 'utf8', (readError, data) => {
    //             if (readError) {
    //                 errors.push(`Ошибка чтения файла ${filePath}`);
    //             } else if (data.includes(searchString)) {
    //                 filesWithMatch.push(filePath);
    //             } else {
    //                 filesWithoutMatch.push(filePath);
    //             }

    //             filesProcessed++;
    //             if (filesProcessed === filePaths.length) {
    //                 callback(
    //                     filesWithMatch.length > 0
    //                         ? `Строка найдена в файлах: ${filesWithMatch.join(', ')}\nСтрока не найдена в файлах: ${filesWithoutMatch.join(', ')}`
    //                         : 'Строка не найдена ни в одном из файлов',
    //                     errors
    //                 );
    //             }
    //         });
    //     });
    // });

    
}

/**
 * Сжимает изображения, выбранные в Finder.
 * @param {Function} callback - функция для обработки результата.
 */
function compressImages(callback) {
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

    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
            callback('Ошибка получения путей к элементам');
            return;
        }

        const selectedPaths = stdout.trim().split(",").filter(Boolean);
        if (selectedPaths.length === 0) {
            callback('Файлы или папки не выбраны или пути невалидны');
            return;
        }
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

        let imagePaths = [];
        selectedPaths.forEach((filePath) => {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                imagePaths = imagePaths.concat(getImagesFromFolder(filePath));
            } else if (stats.isFile() && /\.(jpe?g|png|gif)$/i.test(filePath)) {
                imagePaths.push(filePath);
            }
        });

        if (imagePaths.length === 0) {
            callback('Не найдены изображения для сжатия');
            return;
        }

        let compressedCount = 0;
        const errors = [];
        
        imagePaths.forEach((imagePath) => {
            const outputPath = imagePath.replace(/(\.\w+)$/, '$1');
            console.log("path " + imagePath);
            tinify.fromFile(imagePath).toFile(outputPath, (compressError) => {
                if (compressError) {
                    errors.push(`Ошибка сжатия ${imagePath}`);
                }
                compressedCount++;
                if (compressedCount === imagePaths.length) {
                    callback(errors.length === 0 ? `Все изображения успешно сжаты (${compressedCount})` : `Сжатие завершено с ошибками: ${errors.join('; ')}`);
                }
            });
        });
    });

    // exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
    //     if (error) {
    //         console.error(`Ошибка получения путей к файлам: ${error.message}`);
    //         callback('Ошибка получения путей к файлам');
    //         return;
    //     }

    //     const selectedPaths = stdout.trim().split(",").filter(Boolean); // Разделяем по запятой и удаляем пустые строки
    //     if (selectedPaths.length === 0) {
    //         callback('Файлы не выбраны или пути невалидны');
    //         return;
    //     }

    //     // Рекурсивная функция для поиска всех изображений в папке
    //     const getImagesFromFolder = (folderPath) => {
    //         let images = [];
    //         const items = fs.readdirSync(folderPath);
    //         items.forEach((item) => {
    //             const itemPath = path.join(folderPath, item);
    //             const stats = fs.statSync(itemPath);
    //             if (stats.isDirectory()) {
    //                 // Рекурсивно обходим вложенные папки
    //                 images = images.concat(getImagesFromFolder(itemPath));
    //             } else if (stats.isFile() && /\.(jpe?g|png|gif)$/i.test(item)) {
    //                 // Проверяем, является ли файл изображением (JPEG, PNG, GIF)
    //                 images.push(itemPath);
    //             }
    //         });
    //         return images;
    //     };

    //     // Получаем все изображения из выбранных папок и файлов
    //     let imagePaths = [];
    //     selectedPaths.forEach((filePath) => {
    //         const stats = fs.statSync(filePath);
    //         if (stats.isDirectory()) {
    //             // Если это папка, получаем все изображения внутри нее
    //             imagePaths = imagePaths.concat(getImagesFromFolder(filePath));
    //         } else if (stats.isFile() && /\.(jpe?g|png|gif)$/i.test(filePath)) {
    //             // Если это файл, и он является изображением, добавляем его в список
    //             imagePaths.push(filePath);
    //         }
    //     });

    //     if (imagePaths.length === 0) {
    //         console.error(`Не найдены изображения для сжатия: ${error.message}`);
    //         callback('Не найдены изображения для сжатия');
    //         return;
    //     }

    //     // Сжатие каждого изображения последовательно
    //     let compressedCount = 0;
    //     const totalImages = imagePaths.length;
    //     const errors = [];

    //     imagePaths.forEach((imagePath) => {
    //         if (!imagePath) {
    //             errors.push('Путь к изображению пуст');
    //             return;
    //         }

    //         // Настраиваем выходной путь для сжатого изображения
    //         const outputPath = imagePath.replace(/(\.\w+)$/, '$1');

    //         // Используем Tinify API для сжатия изображения
    //         tinify.fromFile(imagePath).toFile(outputPath, (compressError) => {
    //             if (compressError) {
    //                 console.error(`Ошибка сжатия изображения ${imagePath}: ${compressError.message}`);
    //                 errors.push(`Ошибка сжатия ${imagePath}`);
    //             }
    //             //console.log("Compression count:", tinify.compressionCount);
    //             compressedCount++;
    //             // Проверяем, если все изображения обработаны
    //             if (compressedCount === totalImages) {
    //                 callback(
    //                     filesWithMatch.length > 0
    //                         ? `Строка найдена в файлах: ${filesWithMatch.join(', ')}\nСтрока не найдена в файлах: ${filesWithoutMatch.join(', ')}`
    //                         : 'Строка не найдена ни в одном из файлов',
    //                     errors
    //                 );
    //             }
    //         });
    //     });
    // });
}

module.exports = {
    archiveSelectedItems,
    searchInFiles,
    compressImages,
};
