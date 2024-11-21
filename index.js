const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const platformAPI = require('./platform');
const logCompressionToSheet = require('./platform/statistic/logCompressionToSheet');

const { processAvitoNaAvito } = require('./processes/processAvitoNaAvito');
const { processYandexRTB } = require('./processes/processYandexRTB');


function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
        },
    });

    win.loadFile('index.html');
    // win.webContents.openDevTools();
}

app.on('ready', createWindow);

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

ipcMain.on('process-folders', async (event, { platform, paths }) => {
    try {
        console.log(`Выбрана площадка: ${platform}`);
        console.log(`Пути папок: ${paths}`);
        logCompressionToSheet(paths.length, "Прошивка: " + platform);

        for (const folderPath of paths) {
            if (platform === 'АвитоНаАвито') {
                await processAvitoNaAvito(folderPath);
                event.reply('process-folders-response', `Папка обработана: ${folderPath}`);
            } else if (platform === 'YandexRTB') {
                await processYandexRTB(folderPath);
                event.reply('process-folders-response', `Папка обработана: ${folderPath}`);
            }
        }

        event.reply('process-folders-response', 'Обработка завершена!');
    } catch (error) {
        console.error('Ошибка при обработке папок:', error);
        event.reply('process-folders-response', `Ошибка: ${error.message}`);
    }
});

