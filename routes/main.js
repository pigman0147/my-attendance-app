const express = require('express');
const router = express.Router();
const db = require('../database');

// Helper: ดึงวันที่ปัจจุบันแบบ YYYY-MM-DD
const getTodayDate = () => new Date().toISOString().split('T')[0];

const requireLogin = (req, res, next) => {
    if (!req.session.loggedin) return res.redirect('/');
    next();
};

// --- Login & Admin (เหมือนเดิม) ---
router.get('/', (req, res) => res.render('login', { error: null }));

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) {
            req.session.loggedin = true;
            req.session.userId = row.id;
            req.session.username = row.username;
            req.session.role = row.role;
            req.session.name = row.name;
            if (row.role === 'admin') res.redirect('/admin');
            else res.redirect('/checkin');
        } else {
            res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านผิด!' });
        }
    });
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- Route: Admin Dashboard (พร้อมระบบสรุปผล) ---
router.get('/admin', requireLogin, (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/checkin');

    // ฟังก์ชันช่วยหา "วันนี้"
    const getTodayDate = () => new Date().toISOString().split('T')[0];
    const today = getTodayDate();

    // 1. ดึงรายชื่อการลงเวลาทั้งหมด
    const sqlList = `SELECT attendance.*, users.name 
                     FROM attendance 
                     JOIN users ON attendance.user_id = users.id 
                     ORDER BY attendance.date DESC, attendance.check_in_time DESC`;

    db.all(sqlList, (err, rows) => {
        if (err) console.error(err);

        // 2. เริ่มนับสถิติของ "วันนี้"
        // 2.1 นับพนักงานทั้งหมด (เฉพาะ role user)
        db.get("SELECT COUNT(*) as count FROM users WHERE role='user'", (err, r1) => {
            const totalEmp = r1 ? r1.count : 0;

            // 2.2 นับคนที่ "มาทำงาน" วันนี้
            db.get("SELECT COUNT(*) as count FROM attendance WHERE date = ?", [today], (err, r2) => {
                const present = r2 ? r2.count : 0;

                // 2.3 นับคนที่ "สาย" วันนี้
                db.get("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status LIKE '%สาย%'", [today], (err, r3) => {
                    const late = r3 ? r3.count : 0;

                    // คำนวณส่วนที่เหลือ
                    const onTime = present - late;      
                    const absent = totalEmp - present;  

                    // ส่งข้อมูล (stats) ไปที่หน้าจอ <<< ตรงนี้แหละที่ขาดไป!
                    res.render('admin', { 
                        data: rows, 
                        adminName: req.session.name,
                        stats: {
                            total: totalEmp,
                            present: present,
                            onTime: onTime,
                            late: late,
                            absent: absent
                        }
                    });
                });
            });
        });
    });
});

router.post('/add-user', requireLogin, (req, res) => {
    const { username, password, name } = req.body;
    db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, 'user', ?)", [username, password, name], (err) => {
        res.redirect('/admin');
    });
});

// ==========================================
// ส่วนที่แก้ใหม่: ระบบเช็คชื่อ เข้า/ออก
// ==========================================

router.get('/checkin', requireLogin, (req, res) => {
    const today = getTodayDate();
    const userId = req.session.userId;

    // เช็คว่าวันนี้ user คนนี้มี record หรือยัง?
    db.get("SELECT * FROM attendance WHERE user_id = ? AND date = ?", [userId, today], (err, row) => {
        let workState = 'WAIT_CHECKIN'; // ค่าเริ่มต้น: ยังไม่ลงเวลา

        if (row) {
            if (row.check_out_time) {
                workState = 'FINISHED'; // ลงครบแล้วทั้งเข้าและออก
            } else {
                workState = 'WORKING'; // ลงเข้าแล้ว รอลงออก
            }
        }

        res.render('checkin', { 
            name: req.session.name, 
            workState: workState,
            record: row // ส่งข้อมูลไปโชว์ด้วย (เช่น เวลาเข้า)
        });
    });
});

// ฟังก์ชันลงเวลาเข้า
router.post('/do-checkin', requireLogin, (req, res) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH');
    const today = getTodayDate();
    
    // ตั้งค่าเวลาสาย 08:30 (เวลา Server)
    const limitTime = new Date();
    limitTime.setHours(8, 30, 0); 

    const status = now > limitTime ? 'สาย' : 'ปกติ';

    db.run(
        "INSERT INTO attendance (user_id, date, check_in_time, status) VALUES (?, ?, ?, ?)",
        [req.session.userId, today, timeStr, status],
        (err) => {
            res.redirect('/checkin');
        }
    );
});

// ฟังก์ชันลงเวลาออก
router.post('/do-checkout', requireLogin, (req, res) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH');
    const today = getTodayDate();
    const userId = req.session.userId;

    // ตั้งค่าเวลาเลิกงาน 16:30
    const limitTime = new Date();
    limitTime.setHours(16, 30, 0);

    // ดึงสถานะเดิมมาก่อน เพื่อมาต่อข้อความ
    db.get("SELECT status FROM attendance WHERE user_id = ? AND date = ?", [userId, today], (err, row) => {
        let oldStatus = row ? row.status : '';
        let outStatus = now < limitTime ? 'ออกก่อนเวลา' : 'ออกงานปกติ';
        let newStatus = `${oldStatus} / ${outStatus}`; // เช่น "สาย / ออกงานปกติ"

        db.run(
            "UPDATE attendance SET check_out_time = ?, status = ? WHERE user_id = ? AND date = ?",
            [timeStr, newStatus, userId, today],
            (err) => {
                res.redirect('/checkin');
            }
        );
    });
});

// --- Route: ดูรายชื่อพนักงานทั้งหมด ---
router.get('/admin/users', requireLogin, (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/checkin');

    db.all("SELECT * FROM users", (err, rows) => {
        res.render('users', { users: rows, currentUserId: req.session.userId });
    });
});

// --- Route: ลบพนักงาน ---
router.get('/admin/delete-user/:id', requireLogin, (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/checkin');
    
    const idToDelete = req.params.id;
    
    // ป้องกันไม่ให้ Admin ลบตัวเอง!
    if (parseInt(idToDelete) === req.session.userId) {
        return res.send("<script>alert('ลบตัวเองไม่ได้ครับ!'); window.location.href='/admin/users';</script>");
    }

    db.run("DELETE FROM users WHERE id = ?", [idToDelete], (err) => {
        res.redirect('/admin/users');
    });
});



module.exports = router;