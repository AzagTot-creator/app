console.log('[1/10] 🚦 Запуск приложения. Проверка окружения...');

const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

console.log('[2/10] ✅ Основные модули загружены:');
console.log('  - express:', express ? 'OK' : 'FAIL');
console.log('  - GoogleSpreadsheet:', GoogleSpreadsheet ? 'OK' : 'FAIL');
console.log('  - GoogleAuth:', GoogleAuth ? 'OK' : 'FAIL');

const app = express();
const port = process.env.PORT || 3000;

console.log('[3/10] 🛠️ Express инициализирован. Порт:', port);

console.log('[4/10] 🔐 Проверка переменных окружения:');
console.log('  - GOOGLE_CLIENT_EMAIL:', process.env.GOOGLE_CLIENT_EMAIL ? '****' + process.env.GOOGLE_CLIENT_EMAIL.slice(-10) : 'MISSING');
console.log('  - GOOGLE_PRIVATE_KEY:', process.env.GOOGLE_PRIVATE_KEY ? '****' + process.env.GOOGLE_PRIVATE_KEY.slice(-10) : 'MISSING');
console.log('  - SPREADSHEET_ID:', process.env.SPREADSHEET_ID || 'MISSING');
console.log('  - SHEETS_TO_SEARCH:', process.env.SHEETS_TO_SEARCH || 'MISSING');

// Проверка критических переменных
let criticalError = false;

if (!process.env.GOOGLE_CLIENT_EMAIL) {
  console.error('❌ FATAL: GOOGLE_CLIENT_EMAIL не установлен');
  criticalError = true;
}

if (!process.env.GOOGLE_PRIVATE_KEY) {
  console.error('❌ FATAL: GOOGLE_PRIVATE_KEY не установлен');
  criticalError = true;
}

if (!process.env.SPREADSHEET_ID) {
  console.error('❌ FATAL: SPREADSHEET_ID не установлен');
  criticalError = true;
}

if (criticalError) {
  console.error('⛔ Критические ошибки конфигурации. Завершение работы.');
  process.exit(1);
}

console.log('[5/10] 🔑 Инициализация аутентификации Google...');
console.log('[AUTH] Инициализация аутентификации Google...');
try {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  console.log('✅ Аутентификация успешно настроена');
} catch (authError) {
  console.error('❌ Ошибка инициализации аутентификации:', authError);
  process.exit(1);
}

console.log('[6/10] 📂 Подготовка к работе с Google Sheets');
const SHEETS_TO_SEARCH = process.env.SHEETS_TO_SEARCH ? 
  process.env.SHEETS_TO_SEARCH.split(',').map(s => s.trim()) : 
  [];
console.log('  - Идентификатор таблицы:', process.env.SPREADSHEET_ID);
console.log('  - Листы для поиска:', SHEETS_TO_SEARCH.length > 0 ? SHEETS_TO_SEARCH : 'НЕ ЗАДАНО');

if (SHEETS_TO_SEARCH.length === 0) {
  console.error('❌ FATAL: Не указаны листы для поиска (SHEETS_TO_SEARCH)');
  process.exit(1);
}

console.log('[7/10] 🛠️ Настройка middleware Express');
app.use(express.json());
app.use((req, res, next) => {
  console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use(express.static('public'));

console.log('[8/10] 🗺️ Настройка маршрутов');
app.get('/', (req, res) => {
  console.log('🏠 Запрос к корневому маршруту');
  res.sendFile(__dirname + '/index.html');
});

app.get('/healthcheck', (req, res) => {
  console.log('🩺 Healthcheck запрос');
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: {
      sheets_api: !!GoogleSpreadsheet,
      auth: !!GoogleAuth,
      sheets_configured: !!process.env.SPREADSHEET_ID
    }
  });
});

app.get('/search', async (req, res) => {
  const requestId = Date.now();
  console.log(`\n=== 🔍 НОВЫЙ ЗАПРОС [${requestId}] ===`);
  console.log('Параметры запроса:', {
    code: req.query.code,
    ip: req.ip,
    headers: req.headers
  });

  try {
    const partialCode = req.query.code?.toLowerCase().trim();
    console.log(`[${requestId}] Поиск кода:`, partialCode || 'НЕ УКАЗАН');

    if (!partialCode) {
      console.warn(`[${requestId}] ⚠️ Отсутствует код для поиска`);
      return res.status(400).json({ 
        success: false, 
        error: 'Не указан код для поиска' 
      });
    }

    console.log(`[${requestId}] 🚀 Инициализация клиента Google Sheets...`);
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const client = await auth.getClient();
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, client);
    await doc.loadInfo();
    
    const foundProducts = [];
    console.log(`[${requestId}] 🔍 Начало поиска в ${SHEETS_TO_SEARCH.length} листах`);

    for (const [index, sheetName] of SHEETS_TO_SEARCH.entries()) {
      console.log(`[${requestId}] 📑 Лист ${index + 1}/${SHEETS_TO_SEARCH.length}: ${sheetName}`);
      
      try {
        const sheet = doc.sheetsByTitle[sheetName];
        if (!sheet) {
          console.warn(`[${requestId}] ⚠️ Лист "${sheetName}" не найден`);
          continue;
        }

        const rows = await sheet.getRows();
        const headers = sheet.headerValues.map(h => h.toLowerCase());
        const indices = {
          code: headers.indexOf('код'),
          quantity: headers.indexOf('кількість'),
          dropPrice: headers.indexOf('ціна дроп'),
          retailPrice: headers.indexOf('наша ціна роздріб'),
          img: headers.indexOf('img')
        };

        if ([indices.code, indices.quantity, indices.dropPrice].some(i => i === -1)) {
          console.warn(`[${requestId}] ⚠️ Отсутствуют обязательные колонки в листе ${sheetName}`);
          continue;
        }

        for (const row of rows) {
          const code = row._rawData[indices.code]?.toLowerCase().trim();
          if (code && code.includes(partialCode)) {
            foundProducts.push({
              sheetName: sheetName,  // Добавляем название листа
              code: row._rawData[indices.code],
              quantity: row._rawData[indices.quantity],
              dropPrice: row._rawData[indices.dropPrice],
              retailPrice: row._rawData[indices.retailPrice],
              img: row._rawData[indices.img]
            });
          }
        }
      } catch (sheetError) {
        console.error(`[${requestId}] ❌ Ошибка обработки листа "${sheetName}":`, sheetError);
      }
    }

    console.log(`[${requestId}] 🎉 Поиск завершен. Найдено: ${foundProducts.length} товаров`);
    res.json({ 
      success: true, 
      data: foundProducts.slice(0, 50) 
    });

  } catch (error) {
    console.error(`[${requestId}] ❌ Критическая ошибка:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Внутренняя ошибка сервера',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

console.log('[9/10] 🚀 Подготовка к запуску сервера');
app.listen(port, () => {
  console.log(`[10/10] 🎉 Сервер запущен на порту ${port}`);
  console.log('✅ Проверьте доступность:');
  console.log(`   - Локально: http://localhost:${port}`);
  console.log(`   - Healthcheck: http://localhost:${port}/healthcheck`);
});

process.on('uncaughtException', (err) => {
  console.error('‼️ НЕОБРАБОТАННАЯ ОШИБКА:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('‼️ НЕОБРАБОТАННЫЙ ПРОМИС:', reason);
  process.exit(1);
});
