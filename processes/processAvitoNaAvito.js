const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { minifyJSFiles, 
    compressImages, 
    replaceImagesWithBase64, 
    inlineJavaScript, 
    copyFolderSync, 
    archiveFolder, 
    deleteFiles, 
    insertScriptAfterMarker, 
    wrapDiv,
    prepareReleaseFolder
} = require('../bannerUtils');



async function processAvitoNaAvito(folderPath) {
    

    const releasePath = await prepareReleaseFolder(folderPath);

    const files = fs.readdirSync(releasePath);
    const htmlFile = files.find(file => file === 'index.html');

    if (!htmlFile) {
        throw new Error('Файл index.html или index.js не найден в папке');
    }
    

    const htmlPath = path.join(releasePath, htmlFile);
    //const jsPath = path.join(releasePath, jsFile);
    const sizeMatch = releasePath.match(/(\d+)x(\d+)/);
    const [_, width, height] = sizeMatch || [null, '0', '0'];

    console.log(`Обрабатываем папку: ${folderPath}`);
    console.log(`Папка скопирована в ${releasePath}`);

    await insertScriptAfterMarker(releasePath, 
        '<!-- write your code here -->', 
        '<script type="text/javascript" src="https://tube.buzzoola.com/new/js/lib/banner.js"></script>'
        );
   
    await insertScriptAfterMarker(releasePath, 
        '<meta charset="UTF-8">', 
        `<meta name="ad.size" content="width=${width},height=${height}">`
        );

    await insertScriptAfterMarker(releasePath, 
        '</body>', 
        `<script type="text/javascript">buzzTrack('loaded');</script>\n</body>`,
        true
        );

    try {
        await wrapDiv(htmlPath, 'animation_container', `<div onclick="window.open('https://example.com'); buzzTrack('click');">`);
        console.log('Div успешно обёрнут.');
    } catch (error) {
        console.error('Ошибка:', error.message);
    }

    await compressImages(releasePath);
    await replaceImagesWithBase64(releasePath);
    await minifyJSFiles(releasePath);
    inlineJavaScript(releasePath);
    await deleteFiles(releasePath, ['index.js', 'index_atlas_P_1.png', 'index_atlas_NP_1.jpg', '*.fla']);
    await archiveFolder(releasePath);
}

module.exports = {
    processAvitoNaAvito
};
