const { contextBridge, webUtils, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getFilePath: (file) => webUtils.getPathForFile(file), // Безопасно возвращает путь
    processFolders: (data) => ipcRenderer.send('process-folders', data),
    onProcessFoldersResponse: (callback) => ipcRenderer.on('process-folders-response', (event, response) => callback(response)),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
    send: (channel, data) => ipcRenderer.send(channel, data),
    openModal: () => {
        ipcRenderer.send('open-modal');
    },
    onModalResponse: (callback) => {
        ipcRenderer.on('modal-response', (event, link) => {
            callback(link);
        });
    },
});
