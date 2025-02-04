const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Конфигурация
const SHEETS_TO_SEARCH = ["сумочкиД", "парасольки", "гаманці"];
const SPREADSHEET_ID = '1igXH4QWYkwn0shFAFbJVyw2qn76J1KRXUDR2k-088fg';

// Инициализация аутентификации
const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// Middleware
app.use(express.json());
app.use(express.static('dropminiapp')); // Убедитесь, что папка существует

// Маршруты
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/search', async (req, res) => {
  try {
    const partialCode = req.query.code?.toLowerCase();
    if (!partialCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Не указан код для поиска' 
      });
    }

    // Инициализация клиента и документа
    const client = await auth.getClient();
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, client);
    
    await doc.loadInfo();
    const foundProducts = [];

    for (const sheetName of SHEETS_TO_SEARCH) {
      try {
        const sheet = doc.sheetsByTitle[sheetName];
        if (!sheet) {
          console.warn(`Лист "${sheetName}" не найден`);
          continue;
        }

        const rows = await sheet.getRows();
        const headers = sheet.headerValues.map(h => h.toLowerCase());

        // Получение индексов колонок
        const indices = {
          code: headers.indexOf('код'),
          quantity: headers.indexOf('кількість'),
          dropPrice: headers.indexOf('ціна дроп'),
          retailPrice: headers.indexOf('наша ціна роздріб'),
          img: headers.indexOf('img')
        };

        // Проверка обязательных колонок
        if (indices.code === -1 || indices.quantity === -1 || indices.dropPrice === -1) {
          console.warn(`В листе ${sheetName} отсутствуют обязательные колонки`);
          continue;
        }

        // Поиск по строкам
        for (const row of rows) {
          try {
            const code = row._rawData[indices.code]?.toLowerCase().trim();
            if (code && code.includes(partialCode.toLowerCase().trim())) {
              foundProducts.push({
                category: sheetName,
                code: row._rawData[indices.code],
                quantity: row._rawData[indices.quantity],
                dropPrice: row._rawData[indices.dropPrice],
                retailPrice: indices.retailPrice !== -1 ? row._rawData[indices.retailPrice] : 'N/A',
                img: indices.img !== -1 ? row._rawData[indices.img]?.trim() : null
              });
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
      error: error.message || 'Внутренняя ошибка сервера' 
    });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});