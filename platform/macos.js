// macOS.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const tinify = require('tinify');
const uglifyJS = require('uglify-js');
const logCompressionToSheet = require('./statistic/logCompressionToSheet');

tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n'; // Замените на ваш реальный API ключ от TinyPNG

/**
 * Архивирует выделенные папки в Finder на macOS.
 * @param {Function} callback - функция для обработки результата.
 */
function archiveSelectedItems(callback) {
    const appleScript = `
        tell application "Finder"
            set selectedItems to selection
        end tell

        set archivedCount to 0

        repeat with anItem in selectedItems
            set itemPath to POSIX path of (anItem as alias)
            set itemName to name of anItem
            set archivePath to POSIX path of (itemPath & "/../" & itemName & ".zip")
            do shell script "cd " & quoted form of itemPath & " && zip -r " & quoted form of archivePath & " . -x '*.DS_Store' -x '*.fla'"
            set archivedCount to archivedCount + 1
        end repeat

        return archivedCount
    `;

    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка архивирования: ${error.message}`);
            callback('Ошибка архивирования');
            return;
        }

        // Парсим количество архивированных папок из stdout
        const archivedFoldersCount = parseInt(stdout.trim(), 10) || 0;
        
        // Логируем результат в Google Sheets
        logCompressionToSheet(archivedFoldersCount, "Архивация");
        
        callback(`Архивирование завершено успешно. Архивировано папок: ${archivedFoldersCount}`);
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

    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка получения путей к файлам: ${error.message}`);
            callback('Ошибка получения путей к файлам');
            return;
        }

        const filePaths = stdout.trim().split(",").filter(Boolean);
        if (filePaths.length === 0) {
            callback('Файлы не выбраны или пути невалидны');
            return;
        }

        let filesWithMatch = [];
        let filesWithoutMatch = [];
        let filesProcessed = 0;
        const errors = [];

        filePaths.forEach((filePath) => {
            fs.readFile(filePath, 'utf8', (readError, data) => {
                if (readError) {
                    errors.push(`Ошибка чтения файла ${filePath}`);
                } else if (data.includes(searchString)) {
                    filesWithMatch.push(filePath);
                } else {
                    filesWithoutMatch.push(filePath);
                }

                filesProcessed++;
                if (filesProcessed === filePaths.length) {
                    callback(
                        filesWithMatch.length > 0
                            ? `Строка найдена в файлах: \r\n ${filesWithMatch.join(', \r\n')} \r\n \r\n Строка не найдена в файлах: \r\n ${filesWithoutMatch.join(', \r\n')}`
                            : 'Строка не найдена ни в одном из файлов',
                        errors
                    );
                }
            });
        });
    });

    
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
        const res = [];
        
        imagePaths.forEach((imagePath) => {
            const outputPath = imagePath.replace(/(\.\w+)$/, '$1');
            console.log("path " + imagePath);
            tinify.fromFile(imagePath).toFile(outputPath, (compressError) => {
                if (compressError) {
                    errors.push(`Ошибка сжатия ${imagePath}`);
                }
                compressedCount++;
                if (compressedCount === imagePaths.length) {
                    res.push(errors.length === 0 ? `Все изображения успешно сжаты (${compressedCount})` : `Сжатие завершено с ошибками: ${errors.join('; ')}`)
                    res.push(tinify.compressionCount);
                    callback(res);
                    logCompressionToSheet(compressedCount, "Сжатие изображения");
                }
            });
        });
    });
}

/**
 * Минимизирует выделенные JS файлы в Finder.
 * @param {Function} callback - функция для обработки результата.
 */
function minifyJSFiles(callback) {
    const appleScript = `
        tell application "Finder"
            set selectedItems to selection
            if (count of selectedItems) is 0 then
                display dialog "Выберите файлы .js в Finder." buttons {"OK"} default button 1
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

    // Запускаем AppleScript для получения путей к файлам
    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка получения путей к файлам: ${error.message}`);
            callback('Ошибка получения путей к файлам');
            return;
        }

        const filePaths = stdout.trim().split(",").filter(Boolean);
        if (filePaths.length === 0) {
            callback('Файлы не выбраны или пути невалидны');
            return;
        }

        let minifiedFiles = [];
        const errors = [];

        filePaths.forEach((filePath) => {
            try {
                // Читаем содержимое JS файла
                const code = fs.readFileSync(filePath, 'utf8');

                // Минифицируем код
                const result = uglifyJS.minify(code);
                if (result.error) throw result.error;

                // Записываем минифицированный код в файл с суффиксом ".min.js"
                const minFilePath = filePath.replace(/\.js$/, '.js');
                fs.writeFileSync(minFilePath, result.code, 'utf8');

                minifiedFiles.push(minFilePath);
            } catch (err) {
                console.error(`Ошибка минификации файла ${filePath}: ${err.message}`);
                errors.push(`Ошибка минификации файла ${filePath}`);
            }
        });

        if (errors.length > 0) {
            callback(`Минификация завершена с ошибками: ${errors.join('; ')}`);
        } else {
            logCompressionToSheet(minifiedFiles.length, "Минификация");
            callback(`Минификация завершена успешно. Минифицированные файлы:\r\n ${minifiedFiles.join(', \r\n')}`);
        }
    
    });
}

/**
 * Заменяет изображения в index.html на Base64-строкиии.
 * @param {Function} callback - функция для обработки результата.
 */
function replaceImagesWithBase64(callback) {
    // AppleScript для получения выбранных папок в Finder
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

    exec(`osascript -e '${appleScript}'`, (error, stdout) => {
        if (error) {
            console.error("Ошибка при получении выбранных папок:", error);
            callback("Ошибка при получении выбранных папок");
            return;
        }

        // Разделяем пути к папкам
        const folderPaths = stdout.trim().split(",").map(p => p.trim());

        if (folderPaths.length === 0) {
            callback("Нет выбранных папок для обработки");
            return;
        }

        let processedCount = 0;

        // Обработка каждой папки
        folderPaths.forEach(folderPath => {
            const htmlFilePath = path.join(folderPath, 'index.html');
            const imageFiles = [
                { fileName: 'index_atlas_NP_1.jpg', id: 'index_atlas_NP_1' },
                { fileName: 'index_atlas_P_1.png', id: 'index_atlas_P_1' }
            ];

            // Проверка наличия index.html
            if (!fs.existsSync(htmlFilePath)) {
                console.warn(`Файл index.html не найден в папке ${folderPath}`);
                processedCount++;
                if (processedCount === folderPaths.length) {
                    callback("Обработка завершена. Не все папки содержат файл index.html.");
                }
                return;
            }

            // Чтение содержимого index.html
            let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

            // Обработка каждого изображения
            imageFiles.forEach(image => {
                const imagePath = path.join(folderPath, image.fileName);

                // Проверка существования изображения
                if (fs.existsSync(imagePath)) {
                    // Преобразование изображения в Base64
                    const imageBase64 = fs.readFileSync(imagePath).toString('base64');
                    const base64String = `data:image/${path.extname(image.fileName).slice(1)};base64,${imageBase64}`;

                    // Формирование строки для поиска и замены
                    const searchPattern = `{src:"./${image.fileName}", id:"${image.id}"}`;
                    const replacePattern = `{type:"image", src:"${base64String}", id:"${image.id}"}`;

                    // Замена в HTML
                    htmlContent = htmlContent.replace(searchPattern, replacePattern);
                    logCompressionToSheet(1, "toBase64");
                } else {
                    console.warn(`Изображение ${image.fileName} не найдено в папке ${folderPath}`);
                }
            });

            // Запись измененного содержимого обратно в index.html
            fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
            processedCount++;

            if (processedCount === folderPaths.length) {
                callback("Замена изображений на Base64 завершена успешно");
            }
        });
    });
}

module.exports = {
    archiveSelectedItems,
    searchInFiles,
    compressImages,
    minifyJSFiles,
    replaceImagesWithBase64,
};
