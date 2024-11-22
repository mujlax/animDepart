const { ipcRenderer } = require('electron');

// Обработчик для кнопки архивирования
document.getElementById('archive-button').addEventListener('click', () => {
    ipcRenderer.send('run-archive');
    сonsole.log("ARCHIVE BUTTOn");
});

ipcRenderer.on('archive-response', (event, response) => {
    document.getElementById('output').textContent = response;
});

// Обработчик для кнопки поиска
document.getElementById('search-button').addEventListener('click', () => {
    const searchString = document.getElementById('search-input').value;
    ipcRenderer.send('run-search', searchString);
});

ipcRenderer.on('search-response', (event, response) => {
    document.getElementById('output').textContent = response;
});

// Обработчик для кнопки сжатия изображений
document.getElementById('compress-button').addEventListener('click', () => {
    ipcRenderer.send('run-compress');
});

ipcRenderer.on('compress-response', (event, response) => {
    document.getElementById('output').textContent = response[0];
    // Обновляем счётчик сжатий (предполагаем, что он возвращается)
    document.getElementById('countMonths').textContent = response[1] + "/500 сжатий";
});

// Обработчик для кнопки минимизации JS
document.getElementById('minify-button').addEventListener('click', () => {
    ipcRenderer.send('run-minify');
});

ipcRenderer.on('minify-response', (event, response) => {
    document.getElementById('output').textContent = response;
});

document.getElementById('replace-images-button').addEventListener('click', () => {
    ipcRenderer.send('replace-images-base64');
});

ipcRenderer.on('replace-images-response', (event, response) => {
    document.getElementById('output').textContent = response;
});