// windows.js
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const tinify = require('tinify');
tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n';

function archiveSelectedItems(selectedItems) {
    selectedItems.forEach(item => {
        const output = fs.createWriteStream(`${item}.zip`);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        archive.directory(item, false);
        archive.finalize();
    });
}

function searchInFiles(searchString, filePaths) {
    // аналогичная логика поиска в содержимом файлов на Windows
}

function compressImages(imagePaths) {
    imagePaths.forEach(imagePath => {
        const outputPath = path.join(path.dirname(imagePath), `compressed_${path.basename(imagePath)}`);
        tinify.fromFile(imagePath).toFile(outputPath, err => {
            if (err) console.error('Error compressing image:', err);
        });
    });
}

module.exports = {
    archiveSelectedItems,
    searchInFiles,
    compressImages,
};
