const { contextBridge, webUtils, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getFilePath: (file) => webUtils.getPathForFile(file), // Безопасно возвращает путь
    processFolders: (data) => ipcRenderer.send('process-folders', data),
    onProcessFoldersResponse: (callback) => ipcRenderer.on('process-folders-response', (event, response) => callback(response)),
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
});
