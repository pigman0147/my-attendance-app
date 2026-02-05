// server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mainRoutes = require('./routes/main'); // เรียกใช้ไฟล์ Routes

const app = express();
const port = 3000;

// ตั้งค่า View Engine
app.set('view engine', 'ejs');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key-thai-attendance',
    resave: false,
    saveUninitialized: true
}));

// เรียกใช้ Routes ทั้งหมด
app.use('/', mainRoutes);

// เริ่มรัน Server
app.listen(port, () => {
    console.log(`🚀 Server เปิดแล้วที่: http://localhost:${port}`);
    console.log(`🔑 Admin Login: user=admin, pass=1234`);
});