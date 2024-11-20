const { contextBridge, webUtils, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getFilePath: (file) => webUtils.getPathForFile(file), // Безопасно возвращает путь
    processFolders: (data) => ipcRenderer.send('process-folders', data),
    onProcessFoldersResponse: (callback) => ipcRenderer.on('process-folders-response', (event, response) => callback(response))
});
