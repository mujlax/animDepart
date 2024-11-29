const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const tinify = require('tinify');
const axios = require('axios');
const { minify } = require('uglify-js');
const { minimatch } = require('minimatch')
const { ipcMain } = require('electron');
const cheerio = require('cheerio');
const logCompressionToSheet = require('./platform/statistic/logCompressionToSheet');

// Задайте свой API-ключ для TinyPNG
tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n'; // Замените на ваш реальный API ключ от TinyPNG

function inlineJavaScript(folderPath) {
    const jsPath = path.join(folderPath, 'index.js');
    const htmlPath = path.join(folderPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл ${htmlPath} не найден`);
    }
    if (!fs.existsSync(jsPath)) {
        throw new Error(`Файл ${jsPath} не найден`);
    }

    // Чтение и минификация JavaScript
    let jsContent = fs.readFileSync(jsPath, 'utf8');

    // Чтение и замена в HTML
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    htmlContent = htmlContent.replace(
        /<script src="index\.js"><\/script>/,
        `<script>${jsContent}</script>`
    );

    // Запись измененного HTML обратно в файл
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`Код из ${jsPath} успешно встроен в ${htmlPath}`);
}

function getCanvasSize(folderPath) {
    const htmlPath = path.join(folderPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл ${htmlPath} не найден`);
    }

    // Чтение содержимого index.html
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Регулярное выражение для извлечения width и height
    const canvasSizeRegex = /<canvas id="canvas"[^>]*width="(\d+)"[^>]*height="(\d+)"/i;
    const sizeMatch = htmlContent.match(canvasSizeRegex);

    if (!sizeMatch) {
        throw new Error('Размеры canvas не найдены в index.html');
    }

    const [, width, height] = sizeMatch;
    return { width, height };
}


async function downloadAndReplaceScript(folderPath) {
    const htmlPath = path.join(folderPath, 'index.html');
    const scriptPath = path.join(folderPath, 'createjs.min.js');
    const externalUrl = 'https://code.createjs.com/1.0.0/createjs.min.js';

    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл ${htmlPath} не найден`);
    }

    // Загрузка содержимого из внешней ссылки
    let externalScriptContent;
    try {
        const response = await axios.get(externalUrl);
        externalScriptContent = response.data;
        console.log(`Скрипт загружен с ${externalUrl}`);
    } catch (error) {
        throw new Error(`Ошибка при загрузке скрипта: ${error.message}`);
    }

    // Сохранение загруженного скрипта в файл
    try {
        fs.writeFileSync(scriptPath, externalScriptContent, 'utf8');
        console.log(`Скрипт сохранён в ${scriptPath}`);
    } catch (error) {
        throw new Error(`Ошибка при сохранении файла: ${error.message}`);
    }

    // Чтение HTML и замена строки
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    htmlContent = htmlContent.replace(
        /<script src="https:\/\/code\.createjs\.com\/1\.0\.0\/createjs\.min\.js"><\/script>/,
        '<script src="createjs.min.js"></script>'
    );

    // Запись изменённого HTML обратно в файл
    try {
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        console.log(`HTML обновлён: ссылка на createjs.min.js добавлена в ${htmlPath}`);
    } catch (error) {
        throw new Error(`Ошибка при обновлении HTML: ${error.message}`);
    }
}



/**
 * Минифицирует указанные JS файлы.
 * @param {string[]} filePaths - Пути к JS файлам.
 */
async function minifyJSFiles(folderPath) {
    const jsPath = path.join(folderPath, 'index.js');

    if (!fs.existsSync(jsPath)) {
        console.warn(`Файл ${jsPath} не найден`);
        return;
    }

    const code = fs.readFileSync(jsPath, 'utf8');
    const result = minify(code);

    if (result.error) {
        console.error(`Ошибка минификации ${jsPath}: ${result.error}`);
    } else {
        fs.writeFileSync(jsPath, result.code, 'utf8');
        logCompressionToSheet(1, "Минификация");
        console.log(`Минификация завершена для ${jsPath}`);
    }

}

/**
 * Оптимизирует изображения через TinyPNG API.
 * @param {string[]} imagePaths - Пути к изображениям.
 */
async function compressImages(folderPath) {
    const imageExtensions = ['.jpg', '.png'];
    const imagePaths = getFilePathsByExtensions(folderPath, imageExtensions);
    console.log(`imagePaths ${imagePaths}`);
    return Promise.all(
        imagePaths.map(imagePath =>
            tinify.fromFile(imagePath).toFile(imagePath).catch(err => {
                console.error(`Ошибка сжатия для ${imagePath}: ${err.message}`);
            })
        )
    );
}

function getFilePathsByExtensions(folderPath, extensions) {

    return fs
        .readdirSync(folderPath)
        .filter(file => extensions.includes(path.extname(file).toLowerCase()))
        .map(file => path.join(folderPath, file));
}

async function replaceImagesWithBase64(folderPath) {
    const htmlFilePath = path.join(folderPath, 'index.js');
    const imageFiles = [
        { fileName: 'index_atlas_NP_1.jpg', id: 'index_atlas_NP_1' },
        { fileName: 'index_atlas_P_1.png', id: 'index_atlas_P_1' }
    ];



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
            const searchPattern = new RegExp(`{\\s*src:"(\\.\\/)?${image.fileName}",\\s*id:"${image.id}"\\s*}`, "g");
            const replacePattern = `{type:"image", src:"${base64String}", id:"${image.id}"}`;
            console.log(`searchPattern ${searchPattern}`);
            // Замена в HTML
            htmlContent = htmlContent.replace(searchPattern, replacePattern);
            console.log(`Изображение ${image.fileName} заменено на Base64 в ${htmlFilePath}`);
            logCompressionToSheet(2, "toBase64");
        } else {
            console.warn(`Изображение ${image.fileName} не найдено в папке ${folderPath}`);
        }
    });

    // Запись измененного содержимого обратно в index.html
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
}

function copyFolderSync(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    const items = fs.readdirSync(source);
    for (const item of items) {
        const sourcePath = path.join(source, item);
        const targetPath = path.join(target, item);

        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyFolderSync(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

function copyFolderSync(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    const items = fs.readdirSync(source);
    for (const item of items) {
        const sourcePath = path.join(source, item);
        const targetPath = path.join(target, item);

        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyFolderSync(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

async function archiveFolder(folderPath) {

    const folderName = path.basename(folderPath);
    const outputZipPath = path.join(path.dirname(folderPath), `${folderName}.zip`);

    // Создаем поток записи для архива
    const output = fs.createWriteStream(outputZipPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Уровень сжатия
    });



    archive.pipe(output);
    archive.glob('**/*', {
        cwd: folderPath,
        ignore: ['**/*.fla', '**/.DS_Store'] // Игнорируем файлы с расширениями
    });
    archive.finalize();

    logCompressionToSheet(1, "Архивация");
}

async function deleteFiles(folderPath, filePatterns) {
    if (!fs.existsSync(folderPath)) {
        console.error(`Папка не найдена: ${folderPath}`);
        return;
    }

    const files = fs.readdirSync(folderPath);

    filePatterns.forEach(pattern => {
        files.forEach(file => {
            // Используем minimatch для проверки соответствия шаблону
            if (minimatch(file, pattern)) {
                const filePath = path.join(folderPath, file);
                try {
                    fs.unlinkSync(filePath); // Удаляем файл
                    console.log(`Удален файл: ${filePath}`);
                } catch (err) {
                    console.error(`Ошибка удаления файла ${filePath}: ${err.message}`);
                }
            }
        });
    });
}

async function insertScriptAfterMarker(folderPath, marker, scriptToInsert, deleteMarker = false) {
    const htmlPath = path.join(folderPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл ${htmlPath} не найден`);
    }

    console.log(`scriptToInsert: ${scriptToInsert}`);

    // Чтение содержимого файла
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Поиск маркера и вставка строки
    const markerIndex = htmlContent.indexOf(marker);
    if (markerIndex === -1) {
        throw new Error(`Маркер "${marker}" не найден в ${htmlPath}`);
    }

    const insertPosition = markerIndex + marker.length;
    htmlContent = htmlContent.slice(0, insertPosition) +
        `\n${scriptToInsert}\n` +
        htmlContent.slice(insertPosition);

    if (deleteMarker) {
        htmlContent = htmlContent.replace(marker, '');
    }

    // Запись измененного содержимого обратно в файл
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`Строка успешно вставлена в ${htmlPath}`);
}

async function wrapDiv(folderPath, targetDivId, wrapperDiv) {
    const htmlPath = path.join(folderPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл ${htmlPath} не найден`);
    }

    // Чтение содержимого HTML
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const $ = cheerio.load(htmlContent);

    // Находим div с указанным id
    const targetDiv = $(`#${targetDivId}`);
    if (targetDiv.length === 0) {
        throw new Error(`Div с id="${targetDivId}" не найден в ${htmlPath}`);
    }

    // Извлекаем имя тега из wrapperDiv
    const tagMatch = wrapperDiv.match(/^<([a-zA-Z0-9]+)/);
    if (!tagMatch) {
        throw new Error('Некорректный wrapperDiv. Убедитесь, что это валидный HTML-тег.');
    }

    const wrapperTag = tagMatch[1]; // Имя тега (например, "a", "p", "div");

    // Оборачиваем найденный div
    targetDiv.wrap(wrapperDiv);

    // Записываем обновлённый HTML обратно в файл
    fs.writeFileSync(htmlPath, $.html(), 'utf8');
    console.log(`Div с id="${targetDivId}" успешно обёрнут в ${htmlPath}`);
}

async function prepareReleaseFolder(folderPath) {
    const parentDirectory = path.dirname(folderPath);
    const folderName = path.basename(folderPath);
    const releasePath = path.join(parentDirectory, 'release', folderName);

    copyFolderSync(folderPath, releasePath);
    console.log(`Папка скопирована в ${releasePath}`);
    return releasePath;
}

async function checkRequestLink(requestLink, userLink, browserWindow) {
    if (requestLink && !userLink) {
        if (!browserWindow) {
            throw new Error('Не передано окно для взаимодействия с рендером.');
        }

        userLink = await new Promise((resolve) => {
            ipcMain.once('modal-response', (event, link) => {
                resolve(link || 'https://example.com'); // Значение по умолчанию
            });

            console.log('Отправка события open-modal в рендер');
            browserWindow.webContents.send('open-modal');
        });
    }
    return userLink;
}

module.exports = {
    minifyJSFiles,
    compressImages,
    replaceImagesWithBase64,
    inlineJavaScript,
    copyFolderSync,
    archiveFolder,
    deleteFiles,
    insertScriptAfterMarker,
    wrapDiv,
    prepareReleaseFolder,
    checkRequestLink,
    downloadAndReplaceScript,
    getCanvasSize
};
