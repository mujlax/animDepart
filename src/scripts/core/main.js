const { app, BrowserWindow, ipcMain, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const axios = require('axios'); // Для загрузки файлов
const vm = require('vm'); // Для безопасного выполнения скриптов
const tinify = require('tinify');
const puppeteer = require('puppeteer');
const { minify } = require('terser');

const GIFEncoder = require('gifencoder');
const { Jimp } = require('jimp');

tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n';

const CLOUD_URL = 'https://api.github.com/repos/mujlax/animDepartPlatforms/contents/platforms';
const { platformAPI } = require('../../../platform');
const logCompressionToSheet = require('../statistic/logCompressionToSheet');

let localPlatforms = [];
let cloudPlatforms = [];
let useCloud = false;
let win; //Окно
let soundSequences = {}; // Словарь звуков
let lastPlayedSound = null; // Последний проигранный звук
let platformSettings = { repeat: 0, quality: 10, useGif: false }; // Настройки по умолчанию
let platformWindow = null;

function createWindow() {

    win = new BrowserWindow({
        width: 900,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
            enableRemoteModule: true
        },

    });

    win.loadFile('./src/scripts/core/index.html');
    // win.webContents.openDevTools();
}

app.on('ready', async () => {
    loadSounds();
    await initializePlatforms();
    createWindow();
});



app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});



// Инициализация платформ при запуске приложения
async function initializePlatforms() {
    localPlatforms = loadLocalPlatforms();
    cloudPlatforms = await fetchCloudPlatforms();
    console.log('Локальные платформы:', localPlatforms.map((p) => p.name));
    console.log('Облачные платформы:', cloudPlatforms.map((p) => p.name));
}
async function fetchCloudPlatforms() {
    try {
        const response = await axios.get(CLOUD_URL, {
            headers: { Accept: 'application/vnd.github.v3+json' }
        });

        const platforms = [];
        for (const file of response.data) {
            if (file.name.endsWith('.js')) {
                const fileResponse = await axios.get(file.download_url);

                // Создаём контекст с доступом к модулям
                const context = vm.createContext({
                    module: { exports: {} },
                    exports: {},
                    require: (moduleName) => {
                        if (moduleName === './utils/bannerUtils') {
                            return require(path.join(__dirname, '../platforms/utils/bannerUtils')); // Корректный путь к модулю
                        }
                        return require(moduleName);
                    },
                });

                const script = new vm.Script(fileResponse.data);
                script.runInContext(context);

                const platform = context.module.exports;
                platforms.push(platform);
            }
        }

        return platforms;
    } catch (error) {
        console.error('Ошибка загрузки платформ из облака:', error.message);
        return [];
    }
}
// Функция загрузки локальных платформ
function loadLocalPlatforms() {
    const platformsDir = path.join(__dirname, '../platforms');
    const platforms = [];
    const files = fs.readdirSync(platformsDir);

    files.forEach((file) => {
        const platformPath = path.join(platformsDir, file);
        if (path.extname(file) === '.js') {
            const platform = require(platformPath);
            platforms.push(platform);
        }
    });

    return platforms;
}
// Загрузка звуков из папки /sounds
function loadSounds() {
    const soundDirectory = path.join(__dirname, '../../assets/sounds');
    const soundFiles = fs.readdirSync(soundDirectory).filter(file => file.endsWith('.mp3'));

    soundSequences = {}; // Очищаем словарь перед загрузкой

    soundFiles.forEach(file => {
        const sequence = file.split('.')[0].toUpperCase(); // Имя файла без расширения
        soundSequences[sequence] = path.join(soundDirectory, file); // Связываем комбинацию с файлом
    });

    console.log('Звуки загружены:', soundSequences);
}

// Обработка запроса на загрузку звуков
ipcMain.on('get-sound-sequences', (event) => {
    event.reply('sound-sequences', soundSequences); // Отправляем словарь звуков в рендер
});

ipcMain.on('play-sound', (event, soundPath) => {
    if (soundPath) {
        lastPlayedSound = soundPath; // Обновляем путь к последнему звуку
        console.log(`Сохранён последний звук: ${lastPlayedSound}`);
        event.sender.send('play-sound', soundPath);
    } else {
        console.error('Попытка воспроизвести пустой звук');
    }
});

ipcMain.on('play-last-sound', (event) => {
    if (lastPlayedSound) {
        console.log(`Воспроизведение последнего звука: ${lastPlayedSound}`);
        event.sender.send('play-sound', lastPlayedSound);
    } else {
        console.log('Последний звук ещё не проигрывался.');
        event.sender.send('play-sound', null); // Отправляем null для обработки в рендере
    }
});


// Отправляем сообщение в рендер, чтобы оно отобразилось в интерфейсе
ipcMain.on('log-message', (event, message) => {

    win.webContents.send('log-message', message);
});
// Обработчик для запроса платформ
ipcMain.on('get-platforms', async (event) => {
    const platforms = useCloud ? cloudPlatforms : localPlatforms;
    event.reply('platforms-list', platforms.map((platform) => platform.name));
});

// Обработчик переключения чекбокса
ipcMain.on('toggle-cloud', (event, enabled) => {
    useCloud = enabled;
    console.log(`Использование облачных прошивок: ${useCloud}`);
    const platforms = useCloud ? cloudPlatforms : localPlatforms;
    event.reply('platforms-list', platforms.map((platform) => platform.name));
});


ipcMain.on('toggle-always-on-top', (event, enable) => {
    win.setAlwaysOnTop(enable);
});

ipcMain.on('register-platform-window', (event) => {
    platformWindow = BrowserWindow.getFocusedWindow();
    console.log('Окно platform.html зарегистрировано.');
});

ipcMain.on('get-platform-window', (event) => {
    if (platformWindow) {
        event.reply('platform-window-registered', true);
    } else {
        event.reply('platform-window-registered', false);
    }
});

// Обработка вызова AppleScript
ipcMain.on('run-archive', async (event) => {
    platformAPI.archiveSelectedItems(response => event.reply('archive-response', response));
});

ipcMain.on('run-search', async (event, searchString) => {
    platformAPI.searchInFiles(searchString, response => event.reply('search-response', response));
});

ipcMain.on('run-compress', async (event) => {
    platformAPI.compressImages(response => event.reply('compress-response', response));
});

ipcMain.on('run-minify', async (event) => {
    platformAPI.minifyJSFiles((response) => {
        event.reply('minify-response', response);
    });
});


ipcMain.on('replace-images-base64', (event) => {
    platformAPI.replaceImagesWithBase64((response) => {
        event.reply('replace-images-response', response);
    });
});

ipcMain.on('open-modal', (event) => {
    const webContents = event.sender;
    if (webContents) {
        webContents.send('open-modal'); // Отправляем событие для показа модального окна
    } else {
        console.error('Ошибка: webContents не определён.');
    }
});


ipcMain.on('apply-gif-settings', (event, settings) => {
    platformSettings = settings;
    console.log('Настройки GIF обновлены:', platformSettings);
});


ipcMain.on('process-platform', async (event, { platformName, paths }) => {
    if (!platformWindow) {
        event.reply('platform-process-response', 'Ошибка: Окно platform.html не зарегистрировано.');
        return;
    }

    const currentPlatforms = useCloud ? cloudPlatforms : localPlatforms;

    const platform = currentPlatforms.find((p) => p.name === platformName);
    if (platform) {
        let userLink = null;

        console.log("Передаем пути:" + paths)
        await platform.process(paths, userLink, platformWindow, platformSettings);
        console.log('ОТПРАВЛЯЕМ НАСТРОЙКИ ГИФ', platformSettings);
        event.reply('platform-process-response', `Обработка завершена для платформы ${platformName}`);
    } else {
        event.reply('platform-process-response', `Платформа ${platformName} не найдена`);
    }
});



ipcMain.on('archive-button', async (event, paths) => {
    if (!paths || paths.length === 0) {
        event.reply('archive-response', 'Не выбраны папки для архивации.');
        return;
    }

    let archivedCount = 0;

    paths.forEach(folderPath => {
        const folderName = path.basename(folderPath);
        const outputZipPath = path.join(path.dirname(folderPath), `${folderName}.zip`);

        // Создаем поток записи для архива
        const output = fs.createWriteStream(outputZipPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Уровень сжатия
        });

        output.on('close', () => {
            archivedCount++;
            logMessage('success', `Архивиравано: ${getLastTwoDirectories(folderPath)}`, '📁');
            if (archivedCount === paths.length) {
                logMessage('success', `Архивиравно папок: ${archivedCount}`);
                logCompressionToSheet(archivedCount, "Архивация");
            }
        });

        archive.on('error', (err) => {
            logMessage('error', `Ошибка архивации: ${folderName} Ошибка: ${err.message}`, '📁');
            //console.error(`Ошибка архивации папки ${folderName}: ${err.message}`);
            //callback(`Ошибка архивации папки ${folderName}`);
        });

        archive.pipe(output);
        archive.glob('**/*', {
            cwd: folderPath,
            ignore: ['**/*.fla', '**/.DS_Store'] // Игнорируем файлы с расширениями
        });
        archive.finalize();
    });
});

// ipcMain.on('default_archive-button', async (event, paths) => {
//     if (!paths || paths.length === 0) {
//         event.reply('archive-response', 'Не выбраны файлы или папки для архивации.');
//         return;
//     }

//     // Определяем имя ZIP-архива
//     let archiveName;
//     if (paths.length === 1 && fs.statSync(paths[0]).isDirectory()) {
//         // Если выбрана одна папка
//         archiveName = `${path.basename(paths[0])}.zip`;
//     } else {
//         // Если выбраны файлы или несколько элементов
//         const parentFolder = path.dirname(paths[0]); // Папка первого элемента
//         const folderName = path.basename(parentFolder);
//         archiveName = `${folderName}.zip`;
//     }

//     const outputZipPath = path.join(path.dirname(paths[0]), archiveName);

//     // Создаем поток записи для архива
//     const output = fs.createWriteStream(outputZipPath);
//     const archive = archiver('zip', {
//         zlib: { level: 9 } // Уровень сжатия
//     });

//     output.on('close', () => {
//         event.reply(
//             'archive-response',
//             `Архивирование завершено успешно. Архив создан: ${archiveName}`
//         );
//         logCompressionToSheet(paths.length, "Архивация");
//     });

//     archive.on('error', (err) => {
//         console.error(`Ошибка архивации: ${err.message}`);
//         event.reply('archive-response', `Ошибка архивации: ${err.message}`);
//     });

//     archive.pipe(output);

//     // Добавляем выбранные файлы и папки в архив
//     for (const itemPath of paths) {
//         const itemName = path.basename(itemPath);

//         if (fs.statSync(itemPath).isDirectory()) {
//             // Если это папка, добавляем её содержимое
//             archive.glob('**/*', {
//                 cwd: itemPath,

//             });
//         } else {
//             // Если это файл, добавляем его в архив
//             archive.file(itemPath, { name: itemName });
//         }
//     }

//     await archive.finalize();
// });

ipcMain.on('default_archive-button', async (event, paths) => {
    if (!paths || paths.length === 0) {
        logMessage('error', `Не выбраны файлы или папки для архивации.`, '📁');
        //event.reply('archive-response', 'Не выбраны файлы или папки для архивации.');
        return;
    }

    // Определяем имя ZIP-архива
    let archiveName;
    if (paths.length === 1 && fs.statSync(paths[0]).isDirectory()) {
        // Если выбрана одна папка
        archiveName = `${path.basename(paths[0])}.zip`;
    } else {
        // Если выбраны файлы или несколько элементов
        const parentFolder = path.dirname(paths[0]); // Папка первого элемента
        const folderName = path.basename(parentFolder);
        archiveName = `${folderName}.zip`;
    }

    const outputZipPath = path.join(path.dirname(paths[0]), archiveName);

    // Создаем поток записи для архива
    const output = fs.createWriteStream(outputZipPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Уровень сжатия
    });

    output.on('close', () => {
        // event.reply(
        //     'archive-response',
        //     `Архивирование завершено успешно. Архив создан: ${archiveName}`
        // );
        logMessage('success', `Архивиравано: ${archiveName}`, '📁');
        logCompressionToSheet(paths.length, "Архивация");
    });

    archive.on('error', (err) => {
        //console.error(`Ошибка архивации: ${err.message}`);
        logMessage('error', `Ошибка архивации: ${folderName} Ошибка: ${err.message}`, '📁');
       //event.reply('archive-response', `Ошибка архивации: ${err.message}`);
    });

    archive.pipe(output);

    // Добавляем выбранные файлы и папки в архив
    for (const itemPath of paths) {
        const itemName = path.basename(itemPath);

        if (fs.statSync(itemPath).isDirectory()) {
            // Если это папка, добавляем её как отдельную папку в архив
            archive.directory(itemPath, itemName);
        } else {
            // Если это файл, добавляем его в архив
            archive.file(itemPath, { name: itemName });
        }
    }

    await archive.finalize();
});

ipcMain.on('compress-button', async (event, paths) => {
    if (!paths || paths.length === 0) {
        logMessage('error', `Не выбраны папки для сжатия фото.`, '🖼️');
        //event.reply('compress-response', 'Не выбраны папки для сжатия фото.');
        return;
    }
    const response = [];


    paths.forEach(folderPath => {
        const imageExtensions = ['.jpg', '.png'];
        const imagePaths = getFilePathsByExtensions(folderPath, imageExtensions);
        console.log(`imagePaths ${imagePaths}`);
        return Promise.all(
            imagePaths.map(imagePath =>
                tinify.fromFile(imagePath).toFile(imagePath, (compressError) => {
                    if (compressError) {
                        logMessage('error', `Ошибка при минификации файла: ${getLastTwoDirectories(imagePath)}`, '🖼️');
                    }
                    logCompressionToSheet(imagePaths.length, "Сжатие изображения");
                    response.push(tinify.compressionCount);
                    event.reply('compress-response', response);

                    // Логируем успех
                    logMessage('success', `Картинки успешно сжаты: ${getLastTwoDirectories(imagePath)}`, '🖼️');
                    
                })
            ),

        );


    });


});

ipcMain.on('image-button', async (event, paths) => {
    if (!paths || paths.length === 0) {
        //event.reply('compress-response', 'Не выбраны папки для сжатия фото.');
        console.log("Не выбраны папки для генерации картинок");
        return;
    }
    const response = [];
    response.push('Все изображения успешно выведены (наверно пхе)');

    createScreenshotWithTrigger(paths);


});

ipcMain.on('minify-button', async (event, paths) => {
    minifyJavaScript(paths);
});

async function createScreenshotWithTrigger(paths) {

    for (const folderPath of paths) {
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
            await generateGif(releasePath);
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

        console.log('Ожидание триггеров для создания скриншотов...');
    }

}

async function prepareReleaseFolder(folderPath, name = 'release') {
    const parentDirectory = path.dirname(folderPath);
    const folderName = path.basename(folderPath);
    const releasePath = path.join(parentDirectory, name, folderName);

    copyFolderSync(folderPath, releasePath);
    console.log(`Папка скопирована в ${releasePath}`);
    return releasePath;
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



async function generateGif(releasePath) {
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
    console.log(`GIFEncoder` + encoder);
    const gifStream = fs.createWriteStream(gifPath);
    encoder.createReadStream().pipe(gifStream);
    console.log(`createReadStream`);
    encoder.start();
    encoder.setRepeat(platformSettings.repeat);
    encoder.setDelay(3000);
    encoder.setQuality(platformSettings.repeat);

    console.log(`add settings gif`);
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

function getFilePathsByExtensions(folderPath, extensions) {

    return fs
        .readdirSync(folderPath)
        .filter(file => extensions.includes(path.extname(file).toLowerCase()))
        .map(file => path.join(folderPath, file));
}







ipcMain.on('resize-images', async (event, paths) => {
    if (!paths || paths.length === 0) {
        //event.reply('compress-response', 'Не выбраны папки для сжатия фото.');
        console.log("Не выбраны папки для генерации СПРАЙТКАРТЫ");
        return;
    }

    // await cropImage('/Users/deniszablincev/Documents/2024/Backup/Adobe_Projects/Animate/_SHABLON/Sripts/test/archive/image_qualitu/index_atlas_NP_1.jpg',0,0,100,150,'/Users/deniszablincev/Documents/2024/Backup/Adobe_Projects/Animate/_SHABLON/Sripts/test/archive/out');
    await optimizeSprites(paths);

});


async function optimizeSprites(paths) {

    for (const folderPath of paths) {
        const releasePath = await prepareReleaseFolder(folderPath, 'resize');
        const jsPath = path.join(releasePath, 'index.js');

        if (!fs.existsSync(jsPath)) {
            throw new Error(`Файл index.js не найден в папке: ${releasePath}`);
        }

        const jsContent = fs.readFileSync(jsPath, 'utf8');

        const framesRegex = /{name:"(.*?)", frames: (\[\[.*?\]\])}/;
        const match = jsContent.match(framesRegex);

        if (!match) {
            throw new Error('Строка с frames не найдена в index.js');
        }

        const imageName = match[1];
        const frames = JSON.parse(match[2]);

        console.log(`Обнаружено изображение: ${imageName}`);
        console.log(`Координаты:`, frames);

        const imagePath = path.join(releasePath, `${imageName}.jpg`);

        if (!fs.existsSync(imagePath)) {
            throw new Error(`Изображение ${imageName}.jpg не найдено`);
        }

        const originalImage = await Jimp.read(imagePath);

        // Создаем временную папку temp
        const tempFolderPath = path.join(releasePath, 'temp');
        if (!fs.existsSync(tempFolderPath)) {
            fs.mkdirSync(tempFolderPath, { recursive: true });
            console.log(`Временная папка создана: ${tempFolderPath}`);
        }

        const optimizedFrames = [];
        const optimizedFrames2 = [];
        for (const [x, y, width, height] of frames) {
            console.log(`Координаты: ${x} ${y} ${width} ${height} originalImage: ${originalImage}`);
            // Убедитесь, что координаты передаются корректно
            const croppedImage = originalImage.clone().crop({ x: x, y: y, w: width, h: height });

            croppedImage.resize({ w: width / 2, h: height / 2 });


            const outputFilePath = path.join(tempFolderPath, `${x}_${y}.png`);
            await croppedImage.write(outputFilePath);

            optimizedFrames.push([
                Number(x),
                Number(y),
                Number(width) / 2,
                Number(height) / 2,
            ]);

            optimizedFrames2.push([
                optimizedFrames2.length === 0 ? 0 : optimizedFrames[optimizedFrames.length - 1][0] + Number(width) / 2,
                0,
                Number(width) / 2,
                Number(height) / 2,
            ]);
        }

        const spriteWidth = optimizedFrames.reduce((acc, frame) => {
            if (!Array.isArray(frame) || frame.length < 4) {
                throw new Error(`Некорректный формат фрейма: ${JSON.stringify(frame)}`);
            }
            const [, , width] = frame;
            return acc + Number(width);
        }, 0);

        const spriteHeight = Math.max(...optimizedFrames.map(frame => {
            if (!Array.isArray(frame) || frame.length < 4) {
                throw new Error(`Некорректный формат фрейма: ${JSON.stringify(frame)}`);
            }
            const [, , , height] = frame;
            return Number(height);
        }));

        console.log(`Ширина спрайта: ${spriteWidth}, Высота спрайта: ${spriteHeight}`);
        const spriteSheet = new Jimp({ width: spriteWidth, height: spriteHeight });

        let currentX = 0;
        for (const [x, y, width, height] of optimizedFrames) {
            const croppedImagePath = path.join(tempFolderPath, `${x}_${y}.png`);
            console.log(`Ищееееем ${optimizedFrames}`);
            console.log(`Ищееееем ${croppedImagePath}`);
            const croppedImage = await Jimp.read(croppedImagePath);
            spriteSheet.composite(croppedImage, currentX, 0);
            currentX += Number(width);
        }

        const newSpriteSheetPath = path.join(releasePath, `${imageName}_optimized.png`);
        await spriteSheet.write(newSpriteSheetPath);

        const newFramesString = JSON.stringify(optimizedFrames2);
        const updatedJsContent = jsContent.replace(framesRegex, `{name:"${imageName}", frames: ${newFramesString}}`);
        fs.writeFileSync(jsPath, updatedJsContent, 'utf8');

    }

}



async function cropImage(imagePath, x, y, width, height, outputPath) {
    try {
        // Загружаем изображение
        const image = await Jimp.read(imagePath);
        console.log(`Coord ${x}, ${y}, ${width}, ${height},`);
        // Выполняем обрезку
        const croppedImage = image.crop({ x: x, y: y, w: width, h: height });

        // Сохраняем обрезанное изображение
        await croppedImage.writeAsync(outputPath);

        console.log(`Обрезанное изображение сохранено в: ${outputPath}`);
    } catch (error) {
        console.error('Ошибка при обрезке изображения:', error.message);
    }
}



/**
 * Минифицирует JavaScript файлы из папок или отдельные файлы
 * @param {string[]} paths - Пути к папкам или JS файлам
 */
async function minifyJavaScript(paths) {
    for (const inputPath of paths) {
        try {
            const stat = fs.statSync(inputPath);

            if (stat.isDirectory()) {
                // Если это папка, ищем все файлы .js
                const jsFiles = fs.readdirSync(inputPath)
                    .filter(file => path.extname(file) === '.js')
                    .map(file => path.join(inputPath, file));

                for (const jsFile of jsFiles) {
                    await minifyFile(jsFile);
                }
            } else if (stat.isFile() && path.extname(inputPath) === '.js') {
                // Если это JS-файл
                await minifyFile(inputPath);
            } else {
                logMessage('error', `Пропущен некорректный путь: ${getLastTwoDirectories(inputPath)}`, '#️⃣');
                //console.warn(`Пропущен некорректный путь: ${inputPath}`);
            }
        } catch (err) {
            logMessage('error', `Ошибка обработки пути ${getLastTwoDirectories(inputPath)}: err.message`, '#️⃣');
            //console.error(`Ошибка обработки пути ${inputPath}:`, err.message);
        }
    }
}

/**
 * Минифицирует один JavaScript файл
 * @param {string} filePath - Путь к JavaScript файлу
 */
async function minifyFile(filePath) {
    try {
        console.log(`Минификация файла: ${filePath}`);

        const code = fs.readFileSync(filePath, 'utf8');
        const result = await minify(code);

        if (result.error) {
            throw new Error(`Ошибка минификации: ${result.error}`);
        }

        const minifiedPath = filePath.replace(/\.js$/, '.min.js');
        fs.writeFileSync(minifiedPath, result.code, 'utf8');

        // Логируем успех
        logMessage('success', `Файл успешно минифицирован: ${getLastTwoDirectories(minifiedPath)}`, '#️⃣');

    } catch (err) {
        // Логируем ошибку
        logMessage('error', `Ошибка при минификации файла: ${getLastTwoDirectories(filePath)} Ошибка: ${err.message}`);
    }
}

// Универсальная функция логирования
function logMessage(type, message, emoji = '') {
    if (win && win.webContents) {
        win.webContents.send('log-message', { type, message, emoji });
    } else {
        console.warn(`[${type.toUpperCase()}]: ${message}`);
    }
}

function getLastTwoDirectories(fullPath) {
    const parts = fullPath.split(path.sep); // Разделяем путь по разделителю (Windows или Unix)
    return parts.slice(-2).join(path.sep); // Берём последние 3 элемента и соединяем обратно
}

ipcMain.on('log-message', (event, log) => {
    if (win && win.webContents) {
        win.webContents.send('log-message', log);
    }
});

module.exports = {
    logMessage,
};