output.textContent = `Пути перетащенных папок:\n${folderPaths.join('\n')}`;

git checkout 97d40d2b4cef5218a92b34b0577b17a98eb5dcf0

const { minifyJSFiles, compressImages, replaceImagesWithBase64 } = require('./bannerUtils');
const fs = require('fs');
const path = require('path');

async function processAvitoNaAvito(folderPath) {
    const files = fs.readdirSync(folderPath);
    const htmlFile = files.find(file => file === 'index.html');
    const jsFile = files.find(file => file === 'index.js');
    const images = files.filter(file => /\.(jpe?g|png)$/i.test(file));

    if (!htmlFile || !jsFile) {
        throw new Error('Файл index.html или index.js не найден в папке');
    }

    const htmlPath = path.join(folderPath, htmlFile);
    const jsPath = path.join(folderPath, jsFile);

    // Минификация JS
    await minifyJSFiles([jsPath]);

    // Оптимизация изображений
    await compressImages(images.map(img => path.join(folderPath, img)));

    // Замена изображений на Base64
    replaceImagesWithBase64(htmlPath, images.map(img => path.join(folderPath, img)));

    // Чтение и модификация HTML
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Вставка минифицированного JS
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    htmlContent = htmlContent.replace(
        /<script src="index.js"><\/script>/,
        `<script>${jsContent}</script>`
    );

    // Вставка метаданных
    const sizeMatch = folderPath.match(/(\d+)x(\d+)/);
    if (sizeMatch) {
        const [_, width, height] = sizeMatch;
        htmlContent = htmlContent.replace(
            /<meta charset="UTF-8">/,
            `<meta charset="UTF-8">\n<meta name="ad.size" content="width=${width},height=${height}">`
        );
    }

    // Обертка div с id="animation_container"
    htmlContent = htmlContent.replace(
        /<div id="animation_container">([\s\S]*?)<\/div>/,
        `<div onclick="window.open('Нужная ссылка'); buzzTrack('click');">\n<div id="animation_container">$1</div>\n</div>`
    );

    // Добавление скрипта в body
    htmlContent = htmlContent.replace(
        /<\/body>/,
        `<script type="text/javascript">buzzTrack('loaded');</script>\n</body>`
    );

    // Сохранение изменений
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
}

module.exports = {
    processAvitoNaAvito
};


/**
 * Заменяет изображения в index.html на Base64-строки.
 * @param {string} htmlFilePath - Путь к index.html.
 * @param {string[]} imagePaths - Пути к изображениям.
 */
function replaceImagesWithBase64(htmlFilePath, imagePaths) {
    if (!fs.existsSync(htmlFilePath)) {
        console.error(`Файл ${htmlFilePath} не найден`);
        return;
    }

    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

    imagePaths.forEach(imagePath => {
        if (!fs.existsSync(imagePath)) {
            console.warn(`Изображение ${imagePath} не найдено`);
            return;
        }

        const base64 = fs.readFileSync(imagePath).toString('base64');
        const ext = path.extname(imagePath).slice(1); // Получаем расширение (без точки)
        const base64String = `data:image/${ext};base64,${base64}`;

        const fileName = path.basename(imagePath);
        const searchPattern = `{src:"./${fileName}"`;
        const replacePattern = `{src:"${base64String}"`;

        htmlContent = htmlContent.replace(searchPattern, replacePattern);
    });

    fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
    console.log(`Заменены изображения на Base64 в ${htmlFilePath}`);
}