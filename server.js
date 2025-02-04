const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

// Настройка Google Sheets
const SHEETS_TO_SEARCH = ["сумочкиД", "парасольки", "гаманці"];
const SPREADSHEET_ID = '1igXH4QWYkwn0shFAFbJVyw2qn76J1KRXUDR2k-088fg';

// Конфигурация аутентификации через переменные окружения
const credentials = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

// Middleware для обработки JSON
app.use(express.json());
app.use(express.static('public'));

// Корневой маршрут
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html'); // Отправляем HTML-файл
});

// Маршрут для поиска товаров
app.get('/search', async (req, res) => {
    const partialCode = req.query.code?.toLowerCase();
    
    if (!partialCode) {
        return res.status(400).json({ 
            success: false, 
            error: 'Не указан код для поиска' 
        });
    }

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

    try {
        await doc.useServiceAccountAuth(credentials);
        await doc.loadInfo();

        const foundProducts = [];

        for (const sheetName of SHEETS_TO_SEARCH) {
            try {
                const sheet = doc.sheetsByTitle[sheetName];
                const rows = await sheet.getRows();
                const headers = sheet.headerValues.map(h => h.toLowerCase());

                const codeIdx = headers.indexOf('код');
                const quantityIdx = headers.indexOf('кількість');
                const dropPriceIdx = headers.indexOf('ціна дроп');
                const retailPriceIdx = headers.indexOf('наша ціна роздріб');
                const imgIdx = headers.indexOf('img');

                if (codeIdx === -1 || quantityIdx === -1 || dropPriceIdx === -1) {
                    console.warn(`В листе ${sheetName} отсутствуют обязательные колонки`);
                    continue;
                }

                for (const row of rows) {
                    try {
                        const code = row._rawData[codeIdx]?.toLowerCase();
                        if (code && code.includes(partialCode)) {
                            const product = {
                                category: sheetName,
                                code: row._rawData[codeIdx],
                                quantity: row._rawData[quantityIdx],
                                dropPrice: row._rawData[dropPriceIdx],
                                retailPrice: retailPriceIdx !== -1 ? row._rawData[retailPriceIdx] : 'N/A',
                                img: imgIdx !== -1 ? row._rawData[imgIdx] : null
                            };
                            foundProducts.push(product);
                        }
                    } catch (e) {
                        console.error(`Ошибка обработки строки в листе ${sheetName}:`, e);
                    }
                }
            } catch (e) {
                console.error(`Ошибка в листе ${sheetName}:`, e);
            }
        }

        res.json({ 
            success: true, 
            data: foundProducts.slice(0, 50)
        });

    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});