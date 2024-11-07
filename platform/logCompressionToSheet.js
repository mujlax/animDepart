

// logCompressionToSheet.js
const { google } = require('googleapis');
const path = require('path');
const os = require('os');
const sheets = google.sheets('v4');

async function authenticate() {
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, 'google-sheets-credentials.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return await auth.getClient();
}

/**
 * Логирует данные об операции в Google Sheets, обновляя строку для уникального имени компьютера.
 * @param {number} count - Количество выполненных операций.
 * @param {string} operationType - Тип операции: "Сжатие изображения", "Архивация" или "Минификация".
 */
async function logCompressionToSheet(count, operationType) {
    const authClient = await authenticate();
    const spreadsheetId = '1MOozD7tdpTKjOBV6mAAj8lHvhVtwVolU__TUEgkYhtI'; // замените на ID вашего Google Sheets документа
    const computerName = os.hostname(); // Уникальное имя компьютера

    try {
        // Сначала считываем все строки, чтобы проверить наличие записи для текущего компьютера и типа операции
        const response = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: spreadsheetId,
            range: 'Sheet1!A:C',
        });

        const rows = response.data.values;
        let rowIndex = -1;

        // Поиск строки для текущего компьютера и типа операции
        if (rows) {
            rowIndex = rows.findIndex(row => row[0] === computerName && row[2] === operationType);
        }

        if (rowIndex !== -1) {
            // Обновление существующей записи (увеличение количества операций)
            const currentCount = parseInt(rows[rowIndex][1]) || 0;
            await sheets.spreadsheets.values.update({
                auth: authClient,
                spreadsheetId: spreadsheetId,
                range: `Sheet1!B${rowIndex + 1}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[currentCount + count]], // Увеличиваем количество операций
                },
            });
            console.log("Запись для компьютера и операции обновлена в Google Sheets.");
        } else {
            // Добавление новой записи
            await sheets.spreadsheets.values.append({
                auth: authClient,
                spreadsheetId: spreadsheetId,
                range: 'Sheet1!A:C',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[computerName, count, operationType]],
                },
            });
            console.log("Новая запись добавлена в Google Sheets.");
        }
    } catch (error) {
        console.error("Ошибка при записи в Google Sheets:", error);
    }
}

module.exports = logCompressionToSheet;
