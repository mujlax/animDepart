const fs = require('fs');
const path = require('path');
const { minifyJSFiles, compressImages, replaceImagesWithBase64, inlineJavaScript, copyFolderSync } = require('../bannerUtils');

async function processAvitoNaAvito(folderPath) {
    console.log(`Обрабатываем папку: ${folderPath}`);

    const parentDirectory = path.dirname(folderPath);
    const folderName = path.basename(folderPath);
    const releasePath = path.join(parentDirectory, 'release', folderName);

    copyFolderSync(folderPath, releasePath);
    console.log(`Папка скопирована в ${releasePath}`);

    const files = fs.readdirSync(releasePath);
    const htmlFile = files.find(file => file === 'index.html');
    const jsFile = files.find(file => file === 'index.js');
    const images = files.filter(file => /\.(jpe?g|png)$/i.test(file));

    if (!htmlFile || !jsFile) {
        throw new Error('Файл index.html или index.js не найден в папке');
    }

    const htmlPath = path.join(releasePath, htmlFile);
    const jsPath = path.join(releasePath, jsFile);
    
    await compressImages(images.map(img => path.join(releasePath, img)));
    await replaceImagesWithBase64(releasePath);
    await minifyJSFiles([jsPath]);
    inlineJavaScript(htmlPath, jsPath);
   
    const sizeMatch = releasePath.match(/(\d+)x(\d+)/);
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    if (sizeMatch) {
        const [_, width, height] = sizeMatch;
        htmlContent = htmlContent.replace(
            /<meta charset="UTF-8">/,
            `<meta charset="UTF-8">\n<meta name="ad.size" content="width=${width},height=${height}">`
        );
    }

    htmlContent = htmlContent.replace(
        /<div id="animation_container"([\s\S]*?)<\/div>/,
        `<div onclick="window.open('Нужная ссылка'); buzzTrack('click');">\n<div id="animation_container"$1</div>\n</div>`
    );

    htmlContent = htmlContent.replace(
        /<\/body>/,
        `<script type="text/javascript">buzzTrack('loaded');</script>\n</body>`
    );

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
}

module.exports = {
    processAvitoNaAvito
};
