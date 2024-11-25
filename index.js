const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const archiver = require('archiver');
const axios = require('axios'); // Для загрузки файлов
const vm = require('vm'); // Для безопасного выполнения скриптов
const tinify = require('tinify');
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
        width: 800,
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

app.on('ready', () => {
    //await initializePlatforms();
    createWindow;
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
        await platform.process(paths, userLink, platformWindow);
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

function getFilePathsByExtensions(folderPath, extensions) {

    return fs
        .readdirSync(folderPath)
        .filter(file => extensions.includes(path.extname(file).toLowerCase()))
        .map(file => path.join(folderPath, file));
}



