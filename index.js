const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// Импортируем наши модули
//require('./archive');
require('./search');
require('./tinify');

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    win.loadFile('index.html');
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
ipcMain.on('run-applescript', (event, script) => {
    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Стандартная ошибка: ${stderr}`);
            return;
        }
        console.log(`Результат: ${stdout}`);
        event.reply('applescript-response', stdout);
    });
});
