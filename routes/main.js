const express = require("express");
const router = express.Router();
const db = require("../database");

// ==========================================
// 🛠️ 0. เตรียม Database (อัปเดตโครงสร้างอัตโนมัติ)
// ==========================================
// เพิ่ม Column 'leave_type' (ประเภทการลา)
db.run("ALTER TABLE attendance ADD COLUMN leave_type TEXT", (err) => {
  /* ข้ามถ้ามีแล้ว */
});
// เพิ่ม Column 'remark' (เหตุผล/หมายเหตุ)
db.run("ALTER TABLE attendance ADD COLUMN remark TEXT", (err) => {
  /* ข้ามถ้ามีแล้ว */
});

// ==========================================
// 🛠️ 1. ฟังก์ชันคำนวณสถานะ (ฉบับสมบูรณ์)
// ==========================================
function calculateStatus(row) {
  // 1. ถ้ามีข้อมูลการลา ให้คืนค่าประเภทการลาเลย
  if (row.leave_type) return row.leave_type;

  // 2. ถ้ายังไม่มีเวลาเข้า
  if (!row.check_in_time) return "ยังไม่เข้างาน";

  let inStatus = "ปกติ";
  // 3. เช็คเวลาเข้า (ตัดที่ 09:00)
  const [inH, inM] = row.check_in_time.split(":").map(Number);
  if (inH > 9 || (inH === 9 && inM > 0)) {
    inStatus = "สาย";
  }

  // 4. เช็คเวลาออก (ถ้ามี)
  if (row.check_out_time && row.check_out_time !== "-") {
    let outStatus = "ออกปกติ";
    // ตัดเวลาออกที่ 17:00
    const [outH, outM] = row.check_out_time.split(":").map(Number);
    if (outH < 17) {
      outStatus = "ออกก่อน";
    }
    return `${inStatus} / ${outStatus}`;
  }

  // 5. ถ้ายังไม่ออก
  return inStatus;
}

// Middleware เช็ค Login
const requireLogin = (req, res, next) => {
  if (!req.session.loggedin) return res.redirect("/");
  next();
};

// ==========================================
// 🛣️ Routes ระบบ Login / Logout
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

// ==========================================
// 👤 USER SECTION (หน้าเช็คอินส่วนตัว)
// ==========================================
router.get("/checkin", requireLogin, (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  db.get(
    "SELECT * FROM attendance WHERE user_id = ? AND date = ?",
    [req.session.userId, today],
    (err, row) => {
      let workState = "WAIT_CHECKIN";

      if (row) {
        if (row.leave_type)
          workState = "LEAVE"; // ลา
        else if (row.check_out_time && row.check_out_time !== "-")
          workState = "FINISHED"; // ออกแล้ว
        else workState = "WORKING"; // ทำงานอยู่
      }

      let recordData = row || {};
      if (row) recordData.status = calculateStatus(row);

      res.render("checkin", {
        name: req.session.name,
        workState,
        record: recordData,
      });
    },
  );
});

// ==========================================
// 👮‍♂️ ADMIN SECTION (Dashboard)
// ==========================================

// 1. หน้า Dashboard หลัก (สรุปสถานะวันนี้)
router.get("/admin", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/checkin");

  const today = new Date().toISOString().split("T")[0];

  // ดึง User ทุกคน + Join กับตารางเวลาของ "วันนี้"
  const query = `
        SELECT u.id, u.name, u.username,
               a.check_in_time, a.check_out_time, a.leave_type, a.remark
        FROM users u
        LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
        WHERE u.role != 'admin'
        ORDER BY
            CASE WHEN a.check_in_time IS NULL THEN 0 ELSE 1 END,
            u.name ASC
    `;

  db.all(query, [today], (err, rows) => {
    if (err) rows = [];

    const processedRows = rows.map((row) => ({
      ...row,
      status: calculateStatus(row),
    }));

    res.render("admin", {
      data: processedRows,
      name: req.session.name,
    });
  });
});

// 2. ปุ่มลัดหน้า Dashboard: กดปุ่มลาเล็กๆ
router.post("/admin/mark-leave", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.status(403).send("Forbidden");
  const { userId, type } = req.body;
  const today = new Date().toISOString().split("T")[0];

  db.run(
    "DELETE FROM attendance WHERE user_id = ? AND date = ?",
    [userId, today],
    () => {
      db.run(
        "INSERT INTO attendance (user_id, date, check_in_time, check_out_time, leave_type) VALUES (?, ?, '-', '-', ?)",
        [userId, today, type],
        (err) => res.redirect("/admin"),
      );
    },
  );
});

// ==========================================
// 📝 หน้าจัดการพิเศษ (Manage & Reason)
// ==========================================

// 3. หน้าตารางลงรายละเอียด (Manage Page)
router.get("/admin/manage", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/");
  const selectedDate = req.query.date || new Date().toISOString().split("T")[0];

  const query = `
        SELECT u.id, u.name,
               a.check_in_time, a.check_out_time, a.leave_type, a.remark
        FROM users u
        LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
        WHERE u.role != 'admin'
        ORDER BY u.name ASC
    `;

  db.all(query, [selectedDate], (err, rows) => {
    res.render("manage", {
      data: rows || [],
      date: selectedDate,
      name: req.session.name,
    });
  });
});

// 4. API บันทึกข้อมูลจากหน้า Manage (แก้เวลา/ลงเหตุผล)
router.post("/admin/update-status", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.status(403).send("Forbidden");

  const { userId, date, status, remark, checkIn, checkOut } = req.body;

  let leaveType = null;
  // ถ้าเลือกสถานะที่เป็นการลา ให้บันทึกค่าลง leaveType
  if (["ลาป่วย", "ลากิจ", "ขาดงาน", "พักร้อน", "อื่นๆ"].includes(status)) {
    leaveType = status;
  }

  db.run(
    "DELETE FROM attendance WHERE user_id = ? AND date = ?",
    [userId, date],
    () => {
      db.run(
        `INSERT INTO attendance (user_id, date, check_in_time, check_out_time, leave_type, remark)
                VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, date, checkIn || null, checkOut || null, leaveType, remark],
        (err) => {
          res.redirect(`/admin/manage?date=${date}`);
        },
      );
    },
  );
});

// ==========================================
// 📅 History & User Management
// ==========================================

// 5. ประวัติย้อนหลัง (History)
router.get("/admin/history", requireLogin, (req, res) => {
  if (req.session.role !== "admin") return res.redirect("/");
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
      status: calculateStatus(row),
    }));
    res.render("history", {
      data: processedRows,
      date: selectedDate,
      name: req.session.name,
    });
  });
});

// 6. จัดการพนักงาน (Users)
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

// ==========================================
// 📱 API Mobile / QR Code / Autocomplete
// ==========================================

router.get("/api/get-users", (req, res) => {
  db.all(
    "SELECT username, name FROM users WHERE role != 'admin' ORDER BY name ASC",
    (err, rows) => {
      res.json(rows || []);
    },
  );
});

router.post("/api/qr-checkin", (req, res) => {
  const { username } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (!user) return res.json({ success: false, message: "ไม่พบชื่อพนักงาน" });

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
            (err) => {
              res.json({
                success: true,
                message: `☀️ สวัสดี ${user.name} (เข้างานสำเร็จ)`,
              });
            },
          );
        } else if (row.leave_type) {
          res.json({
            success: false,
            message: `วันนี้คุณมีสถานะ: ${row.leave_type} ครับ`,
          });
        } else if (!row.check_out_time || row.check_out_time === "-") {
          db.run(
            "UPDATE attendance SET check_out_time = ? WHERE id = ?",
            [time, row.id],
            (err) => {
              res.json({
                success: true,
                message: `🌙 กลับบ้านดีๆ ${user.name} (ออกงานสำเร็จ)`,
              });
            },
          );
        } else {
          res.json({ success: false, message: "วันนี้คุณลงเวลาครบแล้วครับ" });
        }
      },
    );
  });
});

module.exports = router;
