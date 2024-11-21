const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const tinify = require('tinify');
const { minify } = require('uglify-js');
const { minimatch } = require('minimatch')
const logCompressionToSheet = require('./platform/statistic/logCompressionToSheet');

// Задайте свой API-ключ для TinyPNG
tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n'; // Замените на ваш реальный API ключ от TinyPNG

function inlineJavaScript(htmlPath, jsPath) {
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл ${htmlPath} не найден`);
    }
    if (!fs.existsSync(jsPath)) {
        throw new Error(`Файл ${jsPath} не найден`);
    }

    // Чтение и минификация JavaScript
    let jsContent = fs.readFileSync(jsPath, 'utf8');
    
    // Чтение и замена в HTML
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    htmlContent = htmlContent.replace(
        /<script src="index\.js"><\/script>/,
        `<script>${jsContent}</script>`
    );

    // Запись измененного HTML обратно в файл
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`Код из ${jsPath} успешно встроен в ${htmlPath}`);
}

/**
 * Минифицирует указанные JS файлы.
 * @param {string[]} filePaths - Пути к JS файлам.
 */
async function minifyJSFiles(filePaths) {
    filePaths.forEach(filePath => {
        if (!fs.existsSync(filePath)) {
            console.warn(`Файл ${filePath} не найден`);
            return;
        }

        const code = fs.readFileSync(filePath, 'utf8');
        const result = minify(code);

        if (result.error) {
            console.error(`Ошибка минификации ${filePath}: ${result.error}`);
        } else {
            fs.writeFileSync(filePath, result.code, 'utf8');
            logCompressionToSheet(1, "Минификация");
            console.log(`Минификация завершена для ${filePath}`);
        }
    });
}

/**
 * Оптимизирует изображения через TinyPNG API.
 * @param {string[]} imagePaths - Пути к изображениям.
 */
async function compressImages(imagePaths) {
    return Promise.all(
        imagePaths.map(imagePath =>
            tinify.fromFile(imagePath).toFile(imagePath).catch(err => {
                console.error(`Ошибка сжатия для ${imagePath}: ${err.message}`);
            })
        )
    );
}

async function replaceImagesWithBase64(folderPath) {
    const htmlFilePath = path.join(folderPath, 'index.js');
    const imageFiles = [
        { fileName: 'index_atlas_NP_1.jpg', id: 'index_atlas_NP_1' },
        { fileName: 'index_atlas_P_1.png', id: 'index_atlas_P_1' }
    ];

    

    // Чтение содержимого index.html
    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

    // Обработка каждого изображения
    imageFiles.forEach(image => {
        const imagePath = path.join(folderPath, image.fileName);

       

        
        // Проверка существования изображения
        if (fs.existsSync(imagePath)) {
            // Преобразование изображения в Base64
            const imageBase64 = fs.readFileSync(imagePath).toString('base64');
            const base64String = `data:image/${path.extname(image.fileName).slice(1)};base64,${imageBase64}`;

            // Формирование строки для поиска и замены
            const searchPattern = `{src:"./${image.fileName}", id:"${image.id}"}`;
            const replacePattern = `{type:"image", src:"${base64String}", id:"${image.id}"}`;

            // Замена в HTML
            htmlContent = htmlContent.replace(searchPattern, replacePattern);
            console.log(`Изображение ${image.fileName} заменено на Base64 в ${htmlFilePath}`);
            logCompressionToSheet(2, "toBase64");
        } else {
            console.warn(`Изображение ${image.fileName} не найдено в папке ${folderPath}`);
        }
    });

    // Запись измененного содержимого обратно в index.html
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
}

function copyFolderSync(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    const items = fs.readdirSync(source);
    for (const item of items) {
        const sourcePath = path.join(source, item);
        const targetPath = path.join(target, item);

        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyFolderSync(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

async function archiveFolder (folderPath) {

    const folderName = path.basename(folderPath);
    const outputZipPath = path.join(path.dirname(folderPath), `${folderName}.zip`);

    // Создаем поток записи для архива
    const output = fs.createWriteStream(outputZipPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Уровень сжатия
    });



    archive.pipe(output);
    archive.glob('**/*', {
        cwd: folderPath,
        ignore: ['**/*.fla', '**/.DS_Store'] // Игнорируем файлы с расширениями
    });
    archive.finalize();
    
    logCompressionToSheet(1, "Архивация");
}

async function deleteFiles(folderPath, filePatterns) {
    if (!fs.existsSync(folderPath)) {
        console.error(`Папка не найдена: ${folderPath}`);
        return;
    }

    const files = fs.readdirSync(folderPath);

    filePatterns.forEach(pattern => {
        files.forEach(file => {
            // Используем minimatch для проверки соответствия шаблону
            if (minimatch(file, pattern)) {
                const filePath = path.join(folderPath, file);
                try {
                    fs.unlinkSync(filePath); // Удаляем файл
                    console.log(`Удален файл: ${filePath}`);
                } catch (err) {
                    console.error(`Ошибка удаления файла ${filePath}: ${err.message}`);
                }
            }
        });
    });
}

async function insertScriptAfterMarker(htmlPath, marker, scriptToInsert) {
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Файл ${htmlPath} не найден`);
    }

    // Чтение содержимого файла
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Поиск маркера и вставка строки
    const markerIndex = htmlContent.indexOf(marker);
    if (markerIndex === -1) {
        throw new Error(`Маркер "${marker}" не найден в ${htmlPath}`);
    }

    const insertPosition = markerIndex + marker.length;
    htmlContent = htmlContent.slice(0, insertPosition) +
        `\n${scriptToInsert}\n` +
        htmlContent.slice(insertPosition);

    // Запись измененного содержимого обратно в файл
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`Строка успешно вставлена в ${htmlPath}`);
}

module.exports = {
    minifyJSFiles,
    compressImages,
    replaceImagesWithBase64,
    inlineJavaScript,
    copyFolderSync,
    archiveFolder,
    deleteFiles,
    insertScriptAfterMarker
};
