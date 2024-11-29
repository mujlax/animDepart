const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const { 
    checkRequestLink,
    prepareReleaseFolder,
    getCanvasSize,
    insertScriptAfterMarker,
    wrapDiv,
    compressImages,
    replaceImagesWithBase64,
    minifyJSFiles,
    inlineJavaScript,
    deleteFiles,
    archiveFolder,
    downloadAndReplaceScript
} = require('../bannerUtils');

async function createScreenshotWithTrigger(releasePath) {
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
    });

    // Добавляем обработчик для консольных триггеров
    await page.evaluate(() => {
        const originalConsoleLog = console.log;
        console.log = (...args) => {
            originalConsoleLog(...args);

            if (args.includes('trigger-screenshot')) {
                window.triggerScreenshot();
            } else if (args.includes('trigger-screenshot-stop')) {
                window.triggerScreenshotStop();
            }
        };
    });

    console.log('Ожидание триггеров для создания скриншотов...');
}

module.exports = {
    name: 'YandexRTB',
    process: async (paths, userLink, platformWindow) => {
        userLink = await checkRequestLink(requestLink = false, userLink, platformWindow);

        for (const folderPath of paths) {
            const releasePath = await prepareReleaseFolder(folderPath);
            const { width, height } = getCanvasSize(releasePath);

            console.log(`Обрабатываем папку: ${folderPath}`);
            console.log(`Папка скопирована в ${releasePath}`);
            console.log(`Используемая ссылка: ${userLink}`);

            await insertScriptAfterMarker(releasePath,
                '<meta charset="UTF-8">',
                `<meta name="ad.size" content="width=${width},height=${height}">`
            );

            await insertScriptAfterMarker(releasePath,
                '</body>',
                `<script>document.getElementById("click_area").href = yandexHTML5BannerApi.getClickURLNum(1);</script>\n</body>`,
                true
            );

            try {
                await wrapDiv(releasePath, 'animation_container', `<a id="click_area" href="#" target="_blank">`);
                console.log('Div успешно обёрнут.');
            } catch (error) {
                console.error('Ошибка:', error.message);
            }

            await compressImages(releasePath);
            //await replaceImagesWithBase64(releasePath);
            await minifyJSFiles(releasePath);
            //inlineJavaScript(releasePath);
            try {
                await createScreenshotWithTrigger(releasePath);
            } catch (error) {
                console.error('Ошибка при создании скриншота:', error.message);
            }
            await deleteFiles(releasePath, ['*.fla']);
            await archiveFolder(releasePath);
        }
    }
};