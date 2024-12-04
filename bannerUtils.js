const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const tinify = require('tinify');
const axios = require('axios');
const { minify } = require('uglify-js');
const { minimatch } = require('minimatch')
const { ipcMain } = require('electron');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const GIFEncoder = require('gifencoder');
const { Jimp } = require('jimp');
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

async function createScreenshotWithTrigger(folderPath, createGif = true, gifSettings) {

    
    const releasePath = await prepareReleaseFolder(folderPath, 'gifs');
    const htmlPath = path.join(releasePath, 'index.html');
    const outputDir = path.join(releasePath, 'img');

    // Проверяем наличие index.html
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл index.html не найден по пути: ${htmlPath}`);
    }

    // Создаём папку для скриншотов, если её нет
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    let screenshotCounter = 1; // Счётчик для названий файлов
    let stopTriggerReceived = false; // Флаг для остановки

    // Открываем браузер Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Загружаем index.html
    await page.goto(`file://${htmlPath}`);

    // Устанавливаем обработчик для скриншотов
    await page.exposeFunction('triggerScreenshot', async () => {
        if (stopTriggerReceived) return;

        const canvasElement = await page.$('canvas#canvas');
        if (!canvasElement) {
            console.error('<canvas> с id="canvas" не найден!');
            return;
        }

        const outputPath = path.join(outputDir, `screenshot_${screenshotCounter}.png`);
        await canvasElement.screenshot({ path: outputPath });
        console.log(`Скриншот ${screenshotCounter} сохранён в ${outputPath}`);
        screenshotCounter++;
    });

    // Устанавливаем обработчик для остановки
    await page.exposeFunction('triggerScreenshotStop', async () => {
        console.log('Получен сигнал остановки.');
        stopTriggerReceived = true;
        await browser.close(); // Закрываем браузер
        if (createGif) {
            await generateGif(releasePath, gifSettings);
        }
        
        deleteAllExceptImg(releasePath);
        
    });

    // Добавляем обработчик для консольных триггеров
    await page.evaluate(() => {
        const originalConsoleLog = console.debug;
        console.debug = (...args) => {
            originalConsoleLog(...args);

            if (args.includes('gif')) {
                window.triggerScreenshot();
            } else if (args.includes('gif-stop')) {
                window.triggerScreenshotStop();
                
            }
        };
    });

    setTimeout(async () => {
        console.log('Таймер остановки сработал.');
        stopTriggerReceived = true;
        await browser.close();
        deleteAllExceptImg(releasePath);
    }, 30000);

    console.log('Ожидание триггеров для создания скриншотов...');
    
}

async function  createScreenshotWithTriggerAdaptive(folderPath, createGif = true, gifSettings, maxWidth = '400') {

 
    const releasePath = await prepareReleaseFolder(folderPath, 'gifs');
    const htmlPath = path.join(releasePath, 'index.html');
    const outputDir = path.join(releasePath, 'img');

    // Проверяем наличие index.html
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл index.html не найден по пути: ${htmlPath}`);
    }

    // Чтение и обновление HTML с помощью cheerio
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const $ = cheerio.load(htmlContent);

    const bannerDiv = $('#banner');
    if (bannerDiv.length === 0) {
        console.error('Div с id="banner" не найден.');
    } else {
        bannerDiv.attr('style', `max-width: ${maxWidth}px;`);
        console.log(`Стиль "max-width: ${maxWidth}px;" добавлен к div#banner`);
    }

    // Запись изменённого HTML обратно в файл
    fs.writeFileSync(htmlPath, $.html(), 'utf8');

    // Создаём папку для скриншотов, если её нет
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    let screenshotCounter = 1; // Счётчик для названий файлов
    let stopTriggerReceived = false; // Флаг для остановки

    // Открываем браузер Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Загружаем index.html
    await page.goto(`file://${htmlPath}`);

    // Устанавливаем обработчик для скриншотов
    await page.exposeFunction('triggerScreenshot', async () => {
        if (stopTriggerReceived) return;

        const canvasElement = await page.$('canvas#canvas');
        if (!canvasElement) {
            console.error('<canvas> с id="canvas" не найден!');
            return;
        }

        const outputPath = path.join(outputDir, `screenshot_${screenshotCounter}.png`);
        await canvasElement.screenshot({ path: outputPath });
        console.log(`Скриншот ${screenshotCounter} сохранён в ${outputPath}`);
        screenshotCounter++;
    });

    // Устанавливаем обработчик для остановки
    await page.exposeFunction('triggerScreenshotStop', async () => {
        console.log('Получен сигнал остановки.');
        stopTriggerReceived = true;
        await browser.close(); // Закрываем браузер
        if (createGif) {
            await generateGif(releasePath, gifSettings);
        }
        
        deleteAllExceptImg(releasePath);
        
    });

    // Добавляем обработчик для консольных триггеров
    await page.evaluate(() => {
        const originalConsoleLog = console.debug;
        console.debug = (...args) => {
            originalConsoleLog(...args);

            if (args.includes('gif')) {
                window.triggerScreenshot();
            } else if (args.includes('gif-stop')) {
                window.triggerScreenshotStop();
                
            }
        };
    });

    setTimeout(async () => {
        console.log('Таймер остановки сработал.');
        stopTriggerReceived = true;
        await browser.close();
        deleteAllExceptImg(releasePath);
    }, 30000);

    console.log('Ожидание триггеров для создания скриншотов...');
    
}



async function generateGif(releasePath, gifSettings) {
    const imgDir = path.join(releasePath, 'img');

    if (!fs.existsSync(imgDir)) {
        throw new Error(`Папка img не найдена по пути: ${imgDir}`);
    }

    const files = fs.readdirSync(imgDir).filter((file) => file.endsWith('.png') || file.endsWith('.jpg'));

    if (files.length === 0) {
        throw new Error(`Нет изображений в папке ${imgDir}`);
    }

    console.log('Список изображений для GIF:', files);

    let firstImage;
    const firstImagePath = path.join(imgDir, files[0]);

    try {
        console.log('Проверяем путь к первому изображению:', firstImagePath);
        firstImage = await Jimp.read(firstImagePath);
    } catch (error) {
        throw new Error(`Ошибка загрузки первого изображения (${firstImagePath}): ${error.message}`);
    }

    const width = firstImage.bitmap.width;
    const height = firstImage.bitmap.height;
    const gifPath = path.join(path.dirname(releasePath), `${width}x${height}.gif`);
    console.log(`Размеры GIF: ${width}x${height}`);

    
    const encoder = new GIFEncoder(width, height);
    const gifStream = fs.createWriteStream(gifPath);
    encoder.createReadStream().pipe(gifStream);

    encoder.start();
    encoder.setRepeat(gifSettings.repeat);
    encoder.setDelay(3000);
    encoder.setQuality(gifSettings.quality);

    for (const file of files) {
        const imgPath = path.join(imgDir, file);

        try {
            console.log(`Загружаем изображение: ${imgPath}`);
            const image = await Jimp.read(imgPath);
            encoder.addFrame(image.bitmap.data);
            console.log(`Изображение добавлено: ${file}`);
        } catch (error) {
            console.error(`Ошибка загрузки изображения ${file}: ${error.message}`);
        }
    }

    encoder.finish();
    console.log(`GIF успешно создан: ${gifPath}`);
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

async function prepareReleaseFolder(folderPath, name = 'release') {
    const parentDirectory = path.dirname(folderPath);
    const folderName = path.basename(folderPath);
    const releasePath = path.join(parentDirectory, name, folderName);

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

function deleteAllExceptImg(folderPath) {
    if (!fs.existsSync(folderPath)) {
        throw new Error(`Папка ${folderPath} не найдена`);
    }

    const items = fs.readdirSync(folderPath);

    items.forEach((item) => {
        const itemPath = path.join(folderPath, item);

        // Если это папка и её имя "img", пропускаем её
        if (fs.statSync(itemPath).isDirectory() && item === 'img') {
            console.log(`Папка ${itemPath} сохранена`);
            return;
        }
        // Пропускаем файлы с расширением ".gif"
        if (!fs.statSync(itemPath).isDirectory() && path.extname(item).toLowerCase() === '.gif') {
            console.log(`Файл ${itemPath} сохранён`);
            return;
        }

        // Удаляем файлы и папки
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`Удалено: ${itemPath}`);
    });

    console.log(`Очистка папки ${folderPath} завершена, папка img сохранена`);
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
    getCanvasSize,
    deleteAllExceptImg,
    generateGif,
    createScreenshotWithTrigger,
    createScreenshotWithTriggerAdaptive
};
