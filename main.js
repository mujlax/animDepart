const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const archiver = require('archiver');
const axios = require('axios'); // Для загрузки файлов
const vm = require('vm'); // Для безопасного выполнения скриптов
const tinify = require('tinify');
const puppeteer = require('puppeteer');

const GIFEncoder = require('gifencoder');
const { Jimp } = require('jimp');

tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n';

const CLOUD_URL = 'https://api.github.com/repos/mujlax/animDepartPlatforms/contents/platforms';



const { platformAPI } = require('./platform');
const logCompressionToSheet = require('./platform/statistic/logCompressionToSheet');

const { processAvitoNaAvito } = require('./processes/processAvitoNaAvito');
const { processYandexRTB } = require('./processes/processYandexRTB');


let localPlatforms = [];
let cloudPlatforms = [];
let useCloud = false;

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
                        if (moduleName === '../bannerUtils') {
                            return require(path.join(__dirname, 'bannerUtils')); // Корректный путь к модулю
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

let soundSequences = {}; // Словарь звуков
let lastPlayedSound = null; // Последний проигранный звук

// Загрузка звуков из папки /sounds
function loadSounds() {
    const soundDirectory = path.join(__dirname, 'sounds');
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

// Функция загрузки локальных платформ
function loadLocalPlatforms() {
    const platformsDir = path.join(__dirname, 'platforms');
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

// Инициализация платформ при запуске приложения
async function initializePlatforms() {
    localPlatforms = loadLocalPlatforms();
    cloudPlatforms = await fetchCloudPlatforms();
    console.log('Локальные платформы:', localPlatforms.map((p) => p.name));
    console.log('Облачные платформы:', cloudPlatforms.map((p) => p.name));
}



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





function createWindow() {

    const win = new BrowserWindow({
        width: 600,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
            enableRemoteModule: true
        },
    });

    win.loadFile('index.html');
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

let platformWindow = null;



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

let gifSettings = { repeat: 0, quality: 10 }; // Настройки по умолчанию

ipcMain.on('apply-gif-settings', (event, settings) => {
    gifSettings = settings;
    console.log('Настройки GIF обновлены:', gifSettings);
});


ipcMain.on('process-platform', async (event, { platformName, paths }) => {
    if (!platformWindow) {
        event.reply('platform-process-response', 'Ошибка: Окно platform.html не зарегистрировано.');
        return;
    }

    const currentPlatforms = useCloud ? cloudPlatforms : localPlatforms;

    const platform = currentPlatforms.find((p) => p.name === platformName);
    if (platform) {
        //platformWindow.webContents.send('open-modal');
        let userLink = null;


        console.log("Передаем пути:" + paths)
        await platform.process(paths, userLink, platformWindow, gifSettings);
        console.log('ОТПРАВЛЯЕМ НАСТРОЙКИ ГИФ', gifSettings);
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
            if (archivedCount === paths.length) {
                //callback(`Архивирование завершено успешно. Архивировано папок: ${archivedCount}`);
                logCompressionToSheet(archivedCount, "Архивация");
            }
        });

        archive.on('error', (err) => {
            console.error(`Ошибка архивации папки ${folderName}: ${err.message}`);
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

ipcMain.on('compress-button', async (event, paths) => {
    if (!paths || paths.length === 0) {
        event.reply('compress-response', 'Не выбраны папки для сжатия фото.');
        return;
    }
    const response = [];
    response.push('Все изображения успешно сжаты (наверно пхе)');



    paths.forEach(folderPath => {
        const imageExtensions = ['.jpg', '.png'];
        const imagePaths = getFilePathsByExtensions(folderPath, imageExtensions);
        console.log(`imagePaths ${imagePaths}`);
        return Promise.all(
            imagePaths.map(imagePath =>
                tinify.fromFile(imagePath).toFile(imagePath, () => {
                    logCompressionToSheet(imagePaths.length, "Сжатие изображения");
                    response.push(tinify.compressionCount),
                        event.reply('compress-response', response)
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



