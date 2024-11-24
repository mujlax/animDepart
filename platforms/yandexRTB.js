module.exports = {
    name: 'YandexRTB',
    process: async (paths, options, userLink, browserWindow) => {
        console.log(`Обработка для платформы YandexRTB: ${paths}`);
        for (const folderPath of paths) {
            console.log(`Обрабатываем папку: ${folderPath}`);
            // Логика обработки
        }
    }
};
