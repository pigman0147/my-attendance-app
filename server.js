const express = require("express");
const session = require("express-session");
// const bodyParser = require('body-parser'); // ❌ ไม่ต้องใช้แล้ว
const cors = require("cors");
const path = require("path");
const mainRoutes = require("./routes/main");

const app = express();
const port = 3000;

// --- 1. ตั้งค่า View Engine ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- 2. Middleware (สำคัญมาก) ---
app.use(cors()); // อนุญาตให้มือถือเชื่อมต่อ
app.use(express.urlencoded({ extended: true })); // ✅ ใช้ของ Express แทน (สำหรับ Form ปกติ)
app.use(express.json()); // ✅ ใช้ของ Express แทน (สำคัญ! สำหรับรับค่า JSON จากมือถือ)
app.use(express.static(path.join(__dirname, "public")));

// --- 3. ตั้งค่า Session ---
app.use(
  session({
    secret: "secret-key-thai-attendance",
    resave: false,
    saveUninitialized: true,
  }),
);

// --- 4. เรียกใช้ Routes ---
app.use("/", mainRoutes);

// --- 5. เริ่มรัน Server ---
app.listen(port, () => {
  console.log(`🚀 Server เปิดแล้วที่: http://localhost:${port}`);
  console.log(`👉 หน้าเว็บหลัก: http://localhost:${port}`);
  console.log(`📱 หน้า Kiosk:   http://localhost:${port}/kiosk.html`);
  console.log(`🔑 Admin Login: user=admin, pass=1234`);
});
