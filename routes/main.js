// routes/main.js
const express = require('express');
const router = express.Router();
const db = require('../database'); // เรียกใช้ database จากไฟล์ที่แยกไว้

// Middleware เช็คว่า Login หรือยัง
const requireLogin = (req, res, next) => {
    if (!req.session.loggedin) {
        return res.redirect('/');
    }
    next();
};

// --- Route: Login ---
router.get('/', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) {
            req.session.loggedin = true;
            req.session.username = row.username;
            req.session.role = row.role;
            req.session.userId = row.id;
            req.session.name = row.name;

            if (row.role === 'admin') res.redirect('/admin');
            else res.redirect('/checkin');
        } else {
            res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านผิด!' });
        }
    });
});

// --- Route: Admin Dashboard ---
router.get('/admin', requireLogin, (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/checkin');

    // ดึงข้อมูลการเข้างาน + ชื่อพนักงาน
    const sql = `SELECT attendance.check_in_time, attendance.status, users.name 
                 FROM attendance 
                 JOIN users ON attendance.user_id = users.id 
                 ORDER BY attendance.check_in_time DESC`;

    db.all(sql, (err, rows) => {
        res.render('admin', { 
            data: rows, 
            adminName: req.session.name 
        });
    });
});

// --- Route: Add User (Admin Only) ---
router.post('/add-user', requireLogin, (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/');
    
    const { username, password, name } = req.body;
    db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, 'user', ?)", [username, password, name], (err) => {
        if (err) console.log(err);
        res.redirect('/admin');
    });
});

// --- Route: Check-in (User) ---
router.get('/checkin', requireLogin, (req, res) => {
    res.render('checkin', { 
        name: req.session.name, 
        message: null 
    });
});

router.post('/do-checkin', requireLogin, (req, res) => {
    // Logic คำนวณสาย (ตัวอย่าง: เข้าหลัง 09:00 = สาย)
    const now = new Date();
    const isLate = now.getHours() >= 9 && now.getMinutes() > 0 ? 'สาย' : 'ปกติ';

    db.run("INSERT INTO attendance (user_id, status) VALUES (?, ?)", [req.session.userId, isLate], (err) => {
        let msg = `บันทึกสำเร็จ! เวลา: ${now.toLocaleTimeString('th-TH')} สถานะ: ${isLate}`;
        res.render('checkin', { 
            name: req.session.name, 
            message: msg 
        });
    });
});

// --- Route: Logout ---
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;