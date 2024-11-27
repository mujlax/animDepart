const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { ipcMain } = require('electron');
const { minifyJSFiles, 
    compressImages, 
    replaceImagesWithBase64, 
    inlineJavaScript, 
    copyFolderSync, 
    archiveFolder, 
    deleteFiles, 
    insertScriptAfterMarker, 
    wrapDiv,
    prepareReleaseFolder,
    checkRequestLink,
    downloadAndReplaceScript,
    getCanvasSize
} = require('../bannerUtils');

module.exports = {
    name: 'Mail_Main',
    process: async (paths, userLink, platformWindow) => {
        userLink = await checkRequestLink(requestLink = false, userLink, platformWindow);

        for (const folderPath of paths) {
            const releasePath = await prepareReleaseFolder(folderPath);
            const { width, height } = getCanvasSize(releasePath);
            console.log(`height ${height}`);

            console.log(`Обрабатываем папку: ${folderPath}`);
            console.log(`Папка скопирована в ${releasePath}`);
            console.log(`Используемая ссылка: ${userLink}`);

            


            await insertScriptAfterMarker(releasePath,
                '<meta charset="UTF-8">',
                `<meta name="ad.size" content="width=100%,height=${height}">`
            );
            

            await downloadAndReplaceScript(releasePath);

            try {
                await wrapDiv(releasePath, 'banner', `<a href="%link1%" target="_blank">`);
                console.log('Div успешно обёрнут.');
            } catch (error) {
                console.error('Ошибка:', error.message);
            }


            await compressImages(releasePath);
            // await replaceImagesWithBase64(releasePath);
            await minifyJSFiles(releasePath);
            // inlineJavaScript(releasePath);
            await deleteFiles(releasePath, ['*.fla']);
            await archiveFolder(releasePath);
        }
    }
};
