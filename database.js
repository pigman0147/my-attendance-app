// database.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./my_attendance.db'); // สร้างไฟล์ DB ที่นี่

db.serialize(() => {
    // 1. สร้างตาราง User
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT, 
        name TEXT
    )`);

    // 2. สร้างตาราง Attendance
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        check_in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT
    )`);

    // 3. สร้าง Admin เริ่มต้น (ถ้ายังไม่มี)
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (username, password, role, name) VALUES ('admin', '1234', 'admin', 'ผู้ดูแลระบบ')");
            console.log(">> สร้าง User 'admin' (pass: 1234) เรียบร้อยแล้ว");
        }
    });
});

module.exports = db;