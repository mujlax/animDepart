// windows.js
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const tinify = require('tinify');
const logCompressionToSheet = require('./statistic/logCompressionToSheet');
tinify.key = 'JvbcxzKlLyGscgvDrcSdpJxs5knj0r4n';

/**
 * Архивирует выделенные папки в Проводнике Windows.
 * @param {Function} callback - Функция для обработки результата.
 */
function archiveSelectedItems(callback) {
    // Используем PowerShell для получения выбранных путей в Проводнике
    const powershellCommand = `
        [System.Reflection.Assembly]::LoadWithPartialName("System.windows.forms") | Out-Null
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Выберите папки для архивации"
        $dialog.ShowNewFolderButton = $false
        $result = $dialog.ShowDialog()
        if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
            $dialog.SelectedPath
        } else {
            Write-Output "Отмена"
        }
    `;

    exec(`powershell.exe -command "${powershellCommand}"`, (error, stdout, stderr) => {
        if (error || stderr) {
            console.error(`Ошибка при получении путей: ${error || stderr}`);
            callback("Ошибка при получении путей");
            return;
        }

        const selectedPaths = stdout.trim().split('\n').filter(Boolean); // Массив путей к папкам

        if (selectedPaths.length === 0) {
            callback("Нет выбранных папок для архивации");
            return;
        }

        // Архивируем каждую выбранную папку
        let archivedCount = 0;

        selectedPaths.forEach((folderPath) => {
            const folderName = path.basename(folderPath);
            const outputZipPath = path.join(path.dirname(folderPath), `${folderName}.zip`);

            // Создаем поток записи для архива
            const output = fs.createWriteStream(outputZipPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Уровень сжатия
            });

            output.on('close', () => {
                archivedCount++;
                if (archivedCount === selectedPaths.length) {
                    callback(`Архивирование завершено успешно. Архивировано папок: ${archivedCount}`);
                    logCompressionToSheet(archivedCount, "Архивация");
                }
            });

            archive.on('error', (err) => {
                console.error(`Ошибка архивации папки ${folderName}: ${err.message}`);
                callback(`Ошибка архивации папки ${folderName}`);
            });

            archive.pipe(output);
            archive.glob('**/*', {
                cwd: folderPath,
                ignore: ['**/*.fla', '**/.DS_Store'] // Игнорируем файлы с расширениями
            });
            archive.finalize();
        });
    });
}

module.exports = archiveSelectedItems;