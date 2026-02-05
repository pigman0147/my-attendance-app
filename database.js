const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./my_attendance.db');

db.serialize(() => {
    // ตาราง Users (เหมือนเดิม)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT, 
        name TEXT
    )`);

    // ตาราง Attendance (แก้ใหม่ เพิ่ม check_out_time)
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT, -- เก็บวันที่แยก เพื่อใช้ง่ายๆ (Format: YYYY-MM-DD)
        check_in_time TEXT,
        check_out_time TEXT,
        status TEXT
    )`);

    // สร้าง Admin เริ่มต้น
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (username, password, role, name) VALUES ('admin', '1234', 'admin', 'ผู้ดูแลระบบ')");
        }
    });
});

module.exports = db;