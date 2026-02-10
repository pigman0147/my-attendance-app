const express = require("express");
const router = express.Router();
const db = require("../database");

// ==========================================
// 🛠️ ฟังก์ชันคำนวณสถานะ (สูตรเต็ม)
// ==========================================
function calculateStatus(checkInTime, checkOutTime) {
  if (!checkInTime) return "รอเช็คอิน";

  let inStatus = "ปกติ";
  // ตัดเวลาเข้าที่ 09:00
  const [inH, inM] = checkInTime.split(":").map(Number);
  if (inH > 9 || (inH === 9 && inM > 0)) {
    inStatus = "สาย";
  }

  if (checkOutTime) {
    let outStatus = "ออกปกติ";
    // ตัดเวลาออกที่ 17:00
    const [outH, outM] = checkOutTime.split(":").map(Number);
    if (outH < 17) {
      outStatus = "ออกก่อน";
    }
    return `${inStatus} / ${outStatus}`;
  }

  return inStatus;
}

const requireLogin = (req, res, next) => {
  if (!req.session.loggedin) return res.redirect("/");
  next();
};

// ==========================================
// 🛣️ Routes ระบบ
// ==========================================

router.get("/", (req, res) => res.render("login", { error: null }));

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (row) {
        req.session.loggedin = true;
        req.session.userId = row.id;
        req.session.username = row.username;
        req.session.role = row.role;
        req.session.name = row.name;
        if (row.role === "admin") res.redirect("/admin");
        else res.redirect("/checkin");
      } else {
        res.render("login", { error: "ชื่อผู้ใช้หรือรหัสผ่านผิด!" });
      }
    },
  );
});

router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

router.get("/checkin", requireLogin, (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  db.get(
    "SELECT * FROM attendance WHERE user_id = ? AND date = ?",
    [req.session.userId, today],
    (err, row) => {
      let workState = row
        ? row.check_out_time
          ? "FINISHED"
          : "WORKING"
        : "WAIT_CHECKIN";
      let recordData = row || {};
      if (row)
        recordData.status = calculateStatus(
          row.check_in_time,
          row.check_out_time,
        );
      res.render("checkin", {
        name: req.session.name,
        workState,
        record: recordData,
      });
    },
  );
});

// ==========================================
// 👮‍♂️ ADMIN DASHBOARD
// ==========================================

router.get("/admin", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/checkin");

  const query = `
        SELECT a.*, u.name
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        ORDER BY a.date DESC, a.check_in_time DESC
    `;

  db.all("SELECT id FROM users", (errUsers, users) => {
    db.all(query, (err, rows) => {
      if (err) rows = [];
      const processedRows = rows.map((row) => ({
        ...row,
        status: calculateStatus(row.check_in_time, row.check_out_time),
      }));

      res.render("admin", {
        data: processedRows,
        userCount: users.length,
        name: req.session.name,
      });
    });
  });
});

// 🟢 [เพิ่มใหม่] หน้าดูประวัติย้อนหลัง (History)
router.get("/admin/history", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/");

  // รับค่าวันที่จาก URL (ถ้าไม่มีใช้วันปัจจุบัน)
  const selectedDate = req.query.date || new Date().toISOString().split("T")[0];

  const query = `
        SELECT a.*, u.name
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = ?
        ORDER BY a.check_in_time ASC
    `;

  db.all(query, [selectedDate], (err, rows) => {
    if (err) rows = [];
    const processedRows = rows.map((row) => ({
      ...row,
      status: calculateStatus(row.check_in_time, row.check_out_time),
    }));

    res.render("history", {
      data: processedRows,
      date: selectedDate, // ส่งวันที่กลับไปให้หน้าเว็บแสดง
      name: req.session.name,
    });
  });
});

// หน้ารายชื่อพนักงาน
router.get("/users", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/");
  db.all("SELECT * FROM users ORDER BY role ASC, name ASC", (err, users) => {
    res.render("users", { users: users, currentUserId: req.session.userId });
  });
});

router.post("/admin/add-user", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/");
  const { username, password, name } = req.body;
  db.run(
    "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'user')",
    [username, password, name],
    (err) => res.redirect("/admin"),
  );
});

router.get("/admin/delete-user/:id", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/");
  if (parseInt(req.params.id) === req.session.userId)
    return res.send(
      "<script>alert('ลบตัวเองไม่ได้!');window.history.back();</script>",
    );
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], (err) =>
    res.redirect("/users"),
  );
});

// API
router.get("/api/get-users", (req, res) =>
  db.all(
    "SELECT username, name FROM users WHERE role != 'admin' ORDER BY name ASC",
    (err, rows) => res.json(rows || []),
  ),
);
router.post("/api/qr-checkin", (req, res) => {
  const { username } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (!user) return res.json({ success: false, message: "ไม่พบชื่อ" });
    const now = new Date();
    const time = now.toLocaleTimeString("th-TH", { hour12: false });
    const date = now.toISOString().split("T")[0];
    db.get(
      "SELECT * FROM attendance WHERE user_id = ? AND date = ?",
      [user.id, date],
      (err, row) => {
        if (!row) {
          db.run(
            "INSERT INTO attendance (user_id, check_in_time, date) VALUES (?, ?, ?)",
            [user.id, time, date],
            () =>
              res.json({
                success: true,
                message: `☀️ สวัสดี ${user.name}`,
                redirect: "/checkin",
              }),
          );
        } else if (!row.check_out_time) {
          db.run(
            "UPDATE attendance SET check_out_time = ? WHERE id = ?",
            [time, row.id],
            () =>
              res.json({
                success: true,
                message: `🌙 กลับบ้านดีๆ ${user.name}`,
                redirect: "/checkin",
              }),
          );
        } else {
          res.json({ success: false, message: "ลงครบแล้ว" });
        }
      },
    );
  });
});

module.exports = router;
