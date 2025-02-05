require('dotenv').config();
const { JWT } = require('google-auth-library');
if (!process.env.GOOGLE_PRIVATE_KEY) {
  throw new Error('Переменная окружения GOOGLE_PRIVATE_KEY не определена.');
}
const keys = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

const client = new JWT({
  email: keys.client_email,
  key: keys.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function testAuth() {
  try {
    await client.request({
      url: 'https://www.googleapis.com/drive/v3/files',
    });
    console.log('Аутентификация успешна!');
  } catch (err) {
    console.error('Ошибка аутентификации:', err.message);
  }
}

testAuth();