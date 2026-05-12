require("dotenv").config();
const fs = require("fs");
const { Telegraf, Markup, session } = require("telegraf");
const axios = require("axios");
const winston = require("winston");

// ── اطمینان از وجود دایرکتوری لاگ ──────────────────────────
const logDir = process.env.LOG_DIR || "/app/logs";
fs.mkdirSync(logDir, { recursive: true });

// ===== Logger =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp} [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: `${logDir}/bot.log`, maxsize: 10485760, maxFiles: 5 })
  ]
});

// ===== Config =====
const BOT_TOKEN  = process.env.BOT_TOKEN;
const API_URL    = process.env.API_URL || "http://api:8000";
const ADMIN_IDS  = (process.env.ADMIN_IDS || "").split(",").map(id => parseInt(id.trim())).filter(Boolean);

if (!BOT_TOKEN) { logger.error("BOT_TOKEN is not set!"); process.exit(1); }

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ===== API Helper =====
const api = axios.create({ baseURL: API_URL, timeout: 30000 });

async function getAdminToken() {
  const res = await api.post("/api/auth/admin/login", {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD
  });
  return res.data.access_token;
}

async function getUserToken(userId, username, fullName, language) {
  const res = await api.post("/api/auth/user/token", {
    user_id: userId,
    username: username || "",
    full_name: fullName || "کاربر",
    language: language || "fa"
  });
  return res.data.access_token;
}

// ===== Middleware — FIX: همیشه next() فراخوانی می‌شه =====
bot.use(async (ctx, next) => {
  if (!ctx.session) ctx.session = {};
  if (ctx.from) {
    ctx.state.isAdmin = ADMIN_IDS.includes(ctx.from.id);
    ctx.state.userId  = ctx.from.id;
    if (!ctx.session.userToken) {
      try {
        ctx.session.userToken = await getUserToken(
          ctx.from.id,
          ctx.from.username,
          `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim(),
          ctx.from.language_code || "fa"
        );
      } catch (e) {
        logger.error(`Token error for ${ctx.from.id}: ${e.message}`);
        // ادامه می‌دیم — token بعداً retry می‌شه
      }
    }
  }
  return next();
});

// ===== Helpers =====
const isAdmin = (ctx) => ADMIN_IDS.includes(ctx.from?.id);
const formatNumber = (n) => Number(n || 0).toLocaleString("fa-IR");

const statusEmoji = {
  active: "🟢", logged_out: "🔴", deleted: "⛔",
  banned: "🚫", flood: "🌊", error: "❌", inactive: "⚪"
};
const taskStatusEmoji = {
  pending: "⏳", running: "▶️", paused: "⏸",
  completed: "✅", failed: "❌", cancelled: "🚫"
};

// ===== MENUS =====
function adminMainMenu() {
  return Markup.keyboard([
    ["📊 داشبورد", "📱 مدیریت سشن‌ها"],
    ["📋 تسک‌ها", "💰 سفارشات"],
    ["👥 کاربران", "🌐 پروکسی‌ها"],
    ["⚙️ تنظیمات", "📦 پلن‌ها"],
    ["🎟 تخفیف‌ها", "📤 بکاپ"]
  ]).resize();
}
function userMainMenu() {
  return Markup.keyboard([
    ["💰 کیف پول", "📋 سفارشات من"],
    ["🛒 خرید سرویس", "📊 وضعیت تسک‌ها"],
    ["❓ راهنما", "📞 پشتیبانی"]
  ]).resize();
}

// ===== START =====
bot.start(async (ctx) => {
  const name = ctx.from.first_name || "کاربر";
  const adminNote = isAdmin(ctx) ? "\n\n🔑 شما به عنوان ادمین وارد شدید." : "";
  await ctx.reply(
    `سلام ${name} عزیز! 👋\n\nبه سیستم مدیریت سشن خوش آمدید 🤖\nاز منوی زیر انتخاب کنید:${adminNote}`,
    isAdmin(ctx) ? adminMainMenu() : userMainMenu()
  );
});

// ===== ADMIN: DASHBOARD =====
bot.hears("📊 داشبورد", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/stats/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    const d = res.data;
    const sessions = d.sessions || {};
    const tasks    = d.tasks    || {};
    const msg =
      `📊 *داشبورد سیستم*\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 *سشن‌ها (کل: ${formatNumber(sessions.total)}):*\n` +
      `🟢 فعال: ${formatNumber(sessions.active)}\n` +
      `🔴 لاگ‌اوت: ${formatNumber(sessions.logged_out)}\n` +
      `⛔ حذف‌شده: ${formatNumber(sessions.deleted)}\n` +
      `🚫 بن‌شده: ${formatNumber(sessions.banned)}\n` +
      `🌊 فلود: ${formatNumber(sessions.flood)}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 *تسک‌ها (کل: ${formatNumber(tasks.total)}):*\n` +
      `⏳ در صف: ${formatNumber(tasks.pending)}\n` +
      `▶️ در حال اجرا: ${formatNumber(tasks.running)}\n` +
      `✅ تکمیل‌شده: ${formatNumber(tasks.completed)}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👥 کاربران: ${formatNumber(d.users?.total)}\n` +
      `⏳ سفارش در انتظار: ${formatNumber(d.pending_orders)}\n` +
      `💰 درآمد امروز: $${(d.orders_today?.total_usd || 0).toFixed(2)}\n` +
      `📦 سفارش امروز: ${formatNumber(d.orders_today?.count)}\n` +
      `💵 درآمد کل: $${(d.total_revenue || 0).toFixed(2)}`;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("🔄 بروزرسانی", "refresh_dashboard")]
    ]));
  } catch (e) {
    logger.error(`Dashboard error: ${e.message}`);
    await ctx.reply("❌ خطا در دریافت اطلاعات.");
  }
});

bot.action("refresh_dashboard", async (ctx) => {
  await ctx.answerCbQuery("در حال بروزرسانی...");
  await ctx.deleteMessage().catch(() => {});
  // شبیه‌سازی کلیک روی داشبورد
  ctx.message = { ...ctx.update.callback_query.message, text: "📊 داشبورد", from: ctx.from, chat: ctx.chat };
  ctx.from = ctx.update.callback_query.from;
  await bot.handleUpdate({ message: ctx.message });
});

// ===== ADMIN: SESSIONS =====
bot.hears("📱 مدیریت سشن‌ها", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/sessions/stats", { headers: { Authorization: `Bearer ${token}` } });
    const s = res.data;
    await ctx.replyWithMarkdown(
      `📱 *مدیریت سشن‌ها*\n\n` +
      `🟢 فعال: ${formatNumber(s.active)}\n` +
      `🔴 لاگ‌اوت: ${formatNumber(s.logged_out)}\n` +
      `⛔ حذف‌شده: ${formatNumber(s.deleted)}\n` +
      `🚫 بن‌شده: ${formatNumber(s.banned)}\n` +
      `🌊 فلود: ${formatNumber(s.flood)}\n` +
      `📊 کل: ${formatNumber(s.total)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("➕ افزودن سشن", "add_session"), Markup.button.callback("📋 لیست سشن‌ها", "list_sessions")],
        [Markup.button.callback("🗑 حذف لاگ‌اوت‌ها", "delete_loggedout"), Markup.button.callback("🔄 بررسی سلامت", "health_check")]
      ])
    );
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت آمار سشن‌ها.");
  }
});

bot.action("add_session", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "waiting_session_string";
  await ctx.reply(
    "📱 *افزودن سشن جدید*\n\n" +
    "اطلاعات سشن را به فرمت زیر ارسال کنید:\n\n" +
    "`شماره|session_string|api_id|api_hash`\n\n" +
    "مثال:\n`+989123456789|1BQANOTEuAm...|12345|abc123def`",
    { parse_mode: "Markdown" }
  );
});

bot.action("list_sessions", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/sessions/?limit=10&page=1", { headers: { Authorization: `Bearer ${token}` } });
    // FIX: API ممکنه {sessions: [...], total: N} برگردونه
    const sessions = Array.isArray(res.data) ? res.data : (res.data.sessions || []);
    const total    = res.data.total || sessions.length;
    if (!sessions.length) return ctx.reply("📭 هیچ سشنی یافت نشد.");
    let msg = `📋 *لیست سشن‌ها (${formatNumber(total)} عدد)*\n\n`;
    for (const s of sessions.slice(0, 10)) {
      const emoji = statusEmoji[s.status] || "⚪";
      msg += `${emoji} \`${s.phone}\` — ${s.status}\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت لیست.");
  }
});

bot.action("delete_loggedout", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const token = await getAdminToken();
    const res = await api.delete("/api/sessions/logged-out", { headers: { Authorization: `Bearer ${token}` } });
    await ctx.reply(`✅ ${res.data.deleted || 0} سشن لاگ‌اوت حذف شد.`);
  } catch (e) {
    await ctx.reply("❌ خطا در حذف سشن‌ها.");
  }
});

bot.action("health_check", async (ctx) => {
  await ctx.answerCbQuery("بررسی سلامت شروع شد...");
  await ctx.reply("🔄 بررسی سلامت سشن‌ها در پس‌زمینه شروع شد. نتیجه در لاگ‌ها قابل مشاهده است.");
});

// ===== ADMIN: TASKS =====
bot.hears("📋 تسک‌ها", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  await ctx.replyWithMarkdown(
    "📋 *مدیریت تسک‌ها*\n\nعملیات مورد نظر را انتخاب کنید:",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ تسک جدید (عضو کردن)", "new_join_task")],
      [Markup.button.callback("📋 لیست تسک‌ها", "list_tasks"), Markup.button.callback("▶️ در حال اجرا", "running_tasks")],
      [Markup.button.callback("✅ تکمیل‌شده", "completed_tasks"), Markup.button.callback("❌ ناموفق", "failed_tasks")]
    ])
  );
});

bot.action("new_join_task", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "new_task_target";
  ctx.session.newTask = {};
  await ctx.reply(
    "📋 *تسک جدید - عضو کردن*\n\n" +
    "🔗 لینک یا آیدی کانال/گروه را ارسال کنید:\n\n" +
    "مثال‌ها:\n" +
    "• `https://t.me/channelname`\n" +
    "• `https://t.me/+AbCdEfGhIjK`\n" +
    "• `@channelname`",
    { parse_mode: "Markdown" }
  );
});

bot.action("list_tasks", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/tasks/?limit=10", { headers: { Authorization: `Bearer ${token}` } });
    // FIX: API آرایه برمی‌گردونه
    const tasks = Array.isArray(res.data) ? res.data : (res.data.tasks || []);
    if (!tasks.length) return ctx.reply("📭 هیچ تسکی یافت نشد.");
    let msg = "📋 *آخرین تسک‌ها:*\n\n";
    for (const t of tasks) {
      const emoji    = taskStatusEmoji[t.status] || "⚪";
      const total    = t.session_count || 1;
      const done     = t.sessions_done || 0;
      const progress = Math.round((done / total) * 100);
      msg += `${emoji} \`${(t.id || "").slice(0, 8)}\` — ${t.type || "join"}\n`;
      msg += `   🎯 ${(t.target || "").slice(0, 30)}\n`;
      msg += `   📊 ${formatNumber(done)}/${formatNumber(total)} (${progress}%)\n\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت تسک‌ها.");
  }
});

bot.action("running_tasks",   async (ctx) => { await ctx.answerCbQuery(); await showTasksByStatus(ctx, "running"); });
bot.action("completed_tasks", async (ctx) => { await ctx.answerCbQuery(); await showTasksByStatus(ctx, "completed"); });
bot.action("failed_tasks",    async (ctx) => { await ctx.answerCbQuery(); await showTasksByStatus(ctx, "failed"); });

async function showTasksByStatus(ctx, status) {
  try {
    const token = await getAdminToken();
    const res = await api.get(`/api/tasks/?status=${status}&limit=10`, { headers: { Authorization: `Bearer ${token}` } });
    const tasks = Array.isArray(res.data) ? res.data : (res.data.tasks || []);
    if (!tasks.length) return ctx.reply(`📭 هیچ تسک ${status} ای یافت نشد.`);
    let msg = `📋 *تسک‌های ${status}:*\n\n`;
    for (const t of tasks) {
      msg += `${taskStatusEmoji[t.status] || "⚪"} \`${(t.id || "").slice(0, 8)}\` — ${(t.target || "").slice(0, 25)}\n`;
      msg += `   ✅${t.sessions_done || 0} ❌${t.sessions_failed || 0} / ${t.session_count || 0}\n\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت تسک‌ها.");
  }
}

// ===== ADMIN: ORDERS =====
bot.hears("💰 سفارشات", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  await ctx.replyWithMarkdown(
    "💰 *مدیریت سفارشات*",
    Markup.inlineKeyboard([
      [Markup.button.callback("⏳ در انتظار تأیید", "orders_confirming")],
      [Markup.button.callback("✅ تأیید شده", "orders_confirmed"), Markup.button.callback("❌ رد شده", "orders_rejected")]
    ])
  );
});

bot.action("orders_confirming", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/orders/?status=confirming&limit=5", { headers: { Authorization: `Bearer ${token}` } });
    const orders = Array.isArray(res.data) ? res.data : (res.data.orders || []);
    if (!orders.length) return ctx.reply("✅ هیچ سفارش در انتظاری وجود ندارد.");
    for (const o of orders) {
      const msg =
        `💰 *سفارش جدید*\n\n` +
        `👤 کاربر: ${o.full_name || "نامشخص"} (@${o.username || "-"})\n` +
        `💵 مبلغ: $${o.amount}\n` +
        `🪙 ارز: ${o.currency}\n` +
        `💎 مقدار: ${o.amount_crypto || "-"} ${o.currency}\n` +
        `🔗 تراکنش: \`${o.tx_hash || "ارسال نشده"}\`\n` +
        `📅 تاریخ: ${new Date(o.created_at).toLocaleString("fa-IR")}`;
      await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback("✅ تأیید", `confirm_order_${o.id}`), Markup.button.callback("❌ رد", `reject_order_${o.id}`)]
      ]));
    }
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت سفارشات.");
  }
});

bot.action("orders_confirmed", async (ctx) => { await ctx.answerCbQuery(); await showOrdersByStatus(ctx, "confirmed"); });
bot.action("orders_rejected",  async (ctx) => { await ctx.answerCbQuery(); await showOrdersByStatus(ctx, "rejected"); });

async function showOrdersByStatus(ctx, status) {
  try {
    const token = await getAdminToken();
    const res = await api.get(`/api/orders/?status=${status}&limit=10`, { headers: { Authorization: `Bearer ${token}` } });
    const orders = Array.isArray(res.data) ? res.data : (res.data.orders || []);
    if (!orders.length) return ctx.reply(`📭 هیچ سفارش ${status} ای یافت نشد.`);
    let msg = `📋 *سفارشات ${status}:*\n\n`;
    for (const o of orders) {
      msg += `💵 $${o.amount} — ${o.currency} — ${new Date(o.created_at).toLocaleDateString("fa-IR")}\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا.");
  }
}

bot.action(/confirm_order_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("در حال تأیید...");
  const orderId = ctx.match[1];
  try {
    const token = await getAdminToken();
    await api.post(`/api/orders/${orderId}/confirm`, {}, { headers: { Authorization: `Bearer ${token}` } });
    await ctx.editMessageText("✅ سفارش تأیید شد و موجودی کاربر شارژ شد.");
  } catch (e) {
    await ctx.reply("❌ خطا در تأیید سفارش.");
  }
});

bot.action(/reject_order_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = `reject_order_${ctx.match[1]}`;
  await ctx.reply("❌ دلیل رد سفارش را بنویسید:");
});

// ===== ADMIN: USERS =====
bot.hears("👥 کاربران", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/users/?limit=10", { headers: { Authorization: `Bearer ${token}` } });
    const users = Array.isArray(res.data) ? res.data : (res.data.users || []);
    let msg = `👥 *لیست کاربران*\n\n`;
    if (!users.length) { msg += "هیچ کاربری یافت نشد."; }
    for (const u of users) {
      msg += `👤 ${u.full_name} (@${u.username || "-"})\n`;
      msg += `   💰 $${u.balance || 0} | ${u.is_banned ? "🚫 بن" : "✅ فعال"}\n\n`;
    }
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("🔍 جستجوی کاربر", "search_user")],
      [Markup.button.callback("💰 شارژ موجودی", "add_balance_user")]
    ]));
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت کاربران.");
  }
});

bot.action("search_user", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "search_user";
  await ctx.reply("🔍 نام یا یوزرنیم کاربر را وارد کنید:");
});

bot.action("add_balance_user", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "add_balance_user_id";
  await ctx.reply("💰 آیدی عددی کاربر را وارد کنید:");
});

// ===== ADMIN: PROXIES =====
bot.hears("🌐 پروکسی‌ها", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  await ctx.replyWithMarkdown(
    "🌐 *مدیریت پروکسی‌ها*",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ افزودن پروکسی", "add_proxy")],
      [Markup.button.callback("📋 لیست پروکسی‌ها", "list_proxies")],
      [Markup.button.callback("📤 افزودن دسته‌ای", "bulk_add_proxies")]
    ])
  );
});

bot.action("add_proxy", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "waiting_proxy";
  await ctx.reply(
    "🌐 *افزودن پروکسی*\n\n" +
    "فرمت: `نوع|host|port|user|pass`\n\n" +
    "مثال:\n`socks5|1.2.3.4|1080|user|pass`\n" +
    "یا بدون احراز هویت:\n`socks5|1.2.3.4|1080`",
    { parse_mode: "Markdown" }
  );
});

bot.action("list_proxies", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/proxies/?active_only=false", { headers: { Authorization: `Bearer ${token}` } });
    const proxies = Array.isArray(res.data) ? res.data : [];
    if (!proxies.length) return ctx.reply("📭 هیچ پروکسی‌ای یافت نشد.");
    let msg = `🌐 *پروکسی‌ها (${proxies.length} عدد):*\n\n`;
    for (const p of proxies.slice(0, 15)) {
      msg += `${p.is_active ? "🟢" : "🔴"} \`${p.host}:${p.port}\` — ${p.proxy_type}\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت پروکسی‌ها.");
  }
});

bot.action("bulk_add_proxies", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "waiting_bulk_proxies";
  await ctx.reply(
    "📤 *افزودن دسته‌ای پروکسی*\n\n" +
    "هر پروکسی را در یک خط بنویسید:\n" +
    "`socks5://user:pass@host:port`\n" +
    "یا\n`host:port:user:pass`",
    { parse_mode: "Markdown" }
  );
});

// ===== ADMIN: SETTINGS =====
bot.hears("⚙️ تنظیمات", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/settings/", { headers: { Authorization: `Bearer ${token}` } });
    const s = res.data || {};
    const msg =
      `⚙️ *تنظیمات سیستم*\n\n` +
      `⏱ تأخیر join: ${s.join_delay_min?.value || 3} - ${s.join_delay_max?.value || 8} ثانیه\n` +
      `🔄 تلاش مجدد: ${s.max_retries?.value || 3}\n` +
      `🌊 ضریب فلود: ${s.flood_multiplier?.value || 1.5}\n` +
      `💵 حداقل واریز: $${s.min_deposit_usd?.value || 5}\n` +
      `📊 نرخ USDT: $${s.usdt_rate?.value || 1}\n` +
      `📊 نرخ TON: $${s.ton_rate?.value || 0.2}\n` +
      `📊 نرخ TRX: $${s.trx_rate?.value || 12.5}`;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("✏️ ویرایش تنظیمات", "edit_settings")]
    ]));
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت تنظیمات.");
  }
});

bot.action("edit_settings", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "edit_setting_key";
  await ctx.reply(
    "✏️ *ویرایش تنظیمات*\n\n" +
    "کلید تنظیم را وارد کنید:\n" +
    "`join_delay_min`, `join_delay_max`, `ton_rate`, `usdt_rate`, `trx_rate`, `min_deposit_usd`",
    { parse_mode: "Markdown" }
  );
});

// ===== ADMIN: PLANS =====
bot.hears("📦 پلن‌ها", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/settings/plans", { headers: { Authorization: `Bearer ${token}` } });
    const plans = Array.isArray(res.data) ? res.data : [];
    let msg = "📦 *پلن‌های فعال:*\n\n";
    if (!plans.length) msg += "هیچ پلنی تعریف نشده.";
    for (const p of plans) {
      msg += `🔹 *${p.name_fa}*\n`;
      msg += `   📱 ${formatNumber(p.session_count)} سشن | 💵 $${p.price_usd}\n`;
      if (p.duration_days) msg += `   ⏳ ${p.duration_days} روز\n`;
      msg += "\n";
    }
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("➕ پلن جدید", "add_plan")]
    ]));
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت پلن‌ها.");
  }
});

bot.action("add_plan", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "waiting_plan";
  await ctx.reply(
    "📦 *پلن جدید*\n\n" +
    "فرمت: `نام فارسی|نام انگلیسی|تعداد سشن|قیمت دلار|مدت روز`\n\n" +
    "مثال:\n`پلن برنزی|Bronze Plan|1000|50|30`\n" +
    "برای نامحدود، مدت را خالی بگذارید:\n`پلن طلایی|Gold Plan|5000|200`",
    { parse_mode: "Markdown" }
  );
});

// ===== ADMIN: DISCOUNTS =====
bot.hears("🎟 تخفیف‌ها", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/settings/discounts", { headers: { Authorization: `Bearer ${token}` } });
    const discounts = Array.isArray(res.data) ? res.data : [];
    let msg = "🎟 *کدهای تخفیف:*\n\n";
    if (!discounts.length) msg += "هیچ کد تخفیفی وجود ندارد.";
    for (const d of discounts) {
      const val = d.type === "percent" ? `${d.value}%` : `$${d.value}`;
      msg += `🎟 \`${d.code}\` — ${val}\n`;
      msg += `   استفاده: ${d.used_count}/${d.max_uses || "∞"} | ${d.is_active ? "✅" : "❌"}\n\n`;
    }
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("➕ کد تخفیف جدید", "add_discount")]
    ]));
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت تخفیف‌ها.");
  }
});

bot.action("add_discount", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = "waiting_discount";
  await ctx.reply(
    "🎟 *کد تخفیف جدید*\n\n" +
    "فرمت: `کد|نوع|مقدار|حداکثر_استفاده`\n\n" +
    "نوع: `percent` یا `fixed`\n\n" +
    "مثال:\n`SUMMER30|percent|30|100`\n`VIP50|fixed|50|10`",
    { parse_mode: "Markdown" }
  );
});

// ===== USER: WALLET =====
bot.hears("💰 کیف پول", async (ctx) => {
  try {
    const token = ctx.session?.userToken;
    if (!token) return ctx.reply("❌ لطفاً دوباره /start بزنید.");
    const res = await api.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    const u = res.data;
    await ctx.replyWithMarkdown(
      `💰 *کیف پول شما*\n\n` +
      `👤 نام: ${u.full_name || "کاربر"}\n` +
      `💵 موجودی: $${Number(u.balance || 0).toFixed(2)}\n` +
      `📊 کل خرید: $${Number(u.total_spent || 0).toFixed(2)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("💳 شارژ کیف پول", "charge_wallet")]
      ])
    );
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت اطلاعات.");
  }
});

bot.action("charge_wallet", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    "💳 *شارژ کیف پول*\n\nارز مورد نظر را انتخاب کنید:",
    Markup.inlineKeyboard([
      [Markup.button.callback("💵 USDT (TRC20)", "pay_USDT_TRC20")],
      [Markup.button.callback("💎 TON", "pay_TON")],
      [Markup.button.callback("🔷 TRX (Tron)", "pay_TRX")]
    ])
  );
});

bot.action(/pay_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const currency = ctx.match[1];
  if (!ctx.session) ctx.session = {};
  ctx.session.state = `waiting_amount_${currency}`;
  await ctx.reply(
    `💳 *پرداخت با ${currency}*\n\nمبلغ مورد نظر را به دلار وارد کنید:\nمثال: \`50\``,
    { parse_mode: "Markdown" }
  );
});

// ===== USER: BUY SERVICE =====
bot.hears("🛒 خرید سرویس", async (ctx) => {
  try {
    const token = ctx.session?.userToken;
    // FIX: plans endpoint نیاز به token داره
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await api.get("/api/settings/plans", { headers });
    const plans = Array.isArray(res.data) ? res.data : [];
    if (!plans.length) return ctx.reply("❌ در حال حاضر پلنی موجود نیست.");
    await ctx.replyWithMarkdown(
      "🛒 *پلن‌های موجود:*\n\nیک پلن انتخاب کنید:",
      Markup.inlineKeyboard(
        plans.map(p => [Markup.button.callback(
          `${p.name_fa} — ${formatNumber(p.session_count)} سشن — $${p.price_usd}`,
          `buy_plan_${p.id}`
        )])
      )
    );
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت پلن‌ها.");
  }
});

bot.action(/buy_plan_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  ctx.session.state = `buy_plan_currency_${ctx.match[1]}`;
  await ctx.replyWithMarkdown(
    "💳 *انتخاب روش پرداخت:*",
    Markup.inlineKeyboard([
      [Markup.button.callback("💵 USDT (TRC20)", `plan_pay_USDT_TRC20_${ctx.match[1]}`)],
      [Markup.button.callback("💎 TON", `plan_pay_TON_${ctx.match[1]}`)],
      [Markup.button.callback("🔷 TRX", `plan_pay_TRX_${ctx.match[1]}`)]
    ])
  );
});

bot.action(/plan_pay_([^_]+)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const currency = ctx.match[1];
  const planId   = ctx.match[2];
  if (!ctx.session) ctx.session = {};
  ctx.session.state = `waiting_plan_order_${currency}_${planId}`;
  await ctx.reply(
    `💳 کد تخفیف دارید؟ وارد کنید یا \`0\` بزنید:`,
    { parse_mode: "Markdown" }
  );
});

// ===== USER: MY ORDERS =====
bot.hears("📋 سفارشات من", async (ctx) => {
  try {
    const token = ctx.session?.userToken;
    if (!token) return ctx.reply("❌ لطفاً دوباره /start بزنید.");
    const res = await api.get("/api/orders/?limit=5", { headers: { Authorization: `Bearer ${token}` } });
    const orders = Array.isArray(res.data) ? res.data : (res.data.orders || []);
    if (!orders.length) return ctx.reply("📭 هیچ سفارشی ندارید.");
    const statusMap = { pending: "⏳ در انتظار", confirming: "🔍 در حال بررسی", confirmed: "✅ تأیید شده", rejected: "❌ رد شده", expired: "⌛ منقضی" };
    let msg = "📋 *سفارشات اخیر شما:*\n\n";
    for (const o of orders) {
      msg += `${statusMap[o.status] || o.status}\n`;
      msg += `💵 $${o.amount} — ${o.currency}\n`;
      msg += `📅 ${new Date(o.created_at).toLocaleDateString("fa-IR")}\n\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت سفارشات.");
  }
});

// ===== USER: HELP & SUPPORT =====
bot.hears("❓ راهنما", async (ctx) => {
  await ctx.replyWithMarkdown(
    "❓ *راهنمای استفاده*\n\n" +
    "1️⃣ ابتدا کیف پول خود را شارژ کنید\n" +
    "2️⃣ یک پلن مناسب انتخاب کنید\n" +
    "3️⃣ پس از تأیید پرداخت توسط ادمین، سرویس فعال می‌شود\n\n" +
    "📞 برای پشتیبانی از دکمه پشتیبانی استفاده کنید."
  );
});

bot.hears("📞 پشتیبانی", async (ctx) => {
  await ctx.reply("📞 برای پشتیبانی با ادمین تماس بگیرید.");
});

// ===== TEXT MESSAGE HANDLER — FIX: session guard =====
bot.on("text", async (ctx) => {
  // FIX: guard برای session undefined
  if (!ctx.session) ctx.session = {};
  const state = ctx.session.state;
  const text  = ctx.message?.text;
  if (!state || !text) return;

  // --- Add Session ---
  if (state === "waiting_session_string") {
    ctx.session.state = null;
    const parts = text.split("|");
    try {
      const token = await getAdminToken();
      await api.post("/api/sessions/", {
        phone:          parts[0]?.trim() || `+98${Date.now()}`,
        session_string: parts[1]?.trim() || parts[0]?.trim(),
        api_id:         parts[2] ? parseInt(parts[2]) : null,
        api_hash:       parts[3]?.trim() || null
      }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply("✅ سشن با موفقیت اضافه شد.");
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- Search User ---
  if (state === "search_user") {
    ctx.session.state = null;
    try {
      const token = await getAdminToken();
      const res = await api.get(`/api/users/?search=${encodeURIComponent(text)}&limit=5`, { headers: { Authorization: `Bearer ${token}` } });
      const users = Array.isArray(res.data) ? res.data : (res.data.users || []);
      if (!users.length) return ctx.reply("📭 کاربری یافت نشد.");
      let msg = "🔍 *نتایج جستجو:*\n\n";
      for (const u of users) {
        msg += `👤 ${u.full_name} (@${u.username || "-"}) — ID: \`${u.id}\`\n`;
        msg += `   💰 $${u.balance} | ${u.is_banned ? "🚫 بن" : "✅ فعال"}\n\n`;
      }
      await ctx.replyWithMarkdown(msg);
    } catch (e) {
      await ctx.reply("❌ خطا در جستجو.");
    }
    return;
  }

  // --- Add Balance: User ID ---
  if (state === "add_balance_user_id") {
    const uid = parseInt(text);
    if (isNaN(uid)) return ctx.reply("❌ آیدی عددی وارد کنید.");
    ctx.session.state = `add_balance_amount_${uid}`;
    await ctx.reply("💰 مبلغ شارژ (دلار) را وارد کنید:");
    return;
  }

  // --- Add Balance: Amount ---
  if (state && state.startsWith("add_balance_amount_")) {
    const uid    = parseInt(state.replace("add_balance_amount_", ""));
    const amount = parseFloat(text);
    ctx.session.state = null;
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ مبلغ معتبر وارد کنید.");
    try {
      const token = await getAdminToken();
      const res = await api.post(`/api/users/${uid}/balance`, { amount }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply(`✅ موجودی شارژ شد. موجودی جدید: $${res.data.new_balance}`);
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- Edit Setting Key ---
  if (state === "edit_setting_key") {
    ctx.session.editSettingKey = text.trim();
    ctx.session.state = "edit_setting_value";
    await ctx.reply(`✏️ مقدار جدید برای \`${text.trim()}\` را وارد کنید:`, { parse_mode: "Markdown" });
    return;
  }

  // --- Edit Setting Value ---
  if (state === "edit_setting_value") {
    const key = ctx.session.editSettingKey;
    ctx.session.state = null;
    ctx.session.editSettingKey = null;
    try {
      const token = await getAdminToken();
      await api.put(`/api/settings/${key}`, { value: text.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply(`✅ تنظیم \`${key}\` به \`${text.trim()}\` تغییر یافت.`, { parse_mode: "Markdown" });
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- New Task: Target ---
  if (state === "new_task_target") {
    ctx.session.newTask.target = text.trim();
    ctx.session.newTask.target_type = text.startsWith("-") ? "id" : text.startsWith("@") ? "username" : "link";
    ctx.session.state = "new_task_count";
    await ctx.reply("📊 تعداد سشن برای عضو کردن را وارد کنید:");
    return;
  }

  // --- New Task: Count ---
  if (state === "new_task_count") {
    const count = parseInt(text);
    if (isNaN(count) || count < 1) return ctx.reply("❌ عدد معتبر وارد کنید.");
    ctx.session.newTask.session_count = count;
    ctx.session.state = "new_task_delay";
    await ctx.reply("⏱ تأخیر بین عضو کردن‌ها (ثانیه):\nفرمت: `حداقل-حداکثر` مثال: `3-8`\nیا Enter برای پیش‌فرض:", { parse_mode: "Markdown" });
    return;
  }

  // --- New Task: Delay ---
  if (state === "new_task_delay") {
    let delayMin = 3, delayMax = 8;
    if (text.includes("-")) {
      const parts = text.split("-");
      delayMin = parseInt(parts[0]) || 3;
      delayMax = parseInt(parts[1]) || 8;
    }
    ctx.session.newTask.join_delay_min = delayMin;
    ctx.session.newTask.join_delay_max = delayMax;
    ctx.session.state = "new_task_autoleave";
    await ctx.reply("⏰ خروج خودکار بعد از چند دقیقه؟\nعدد وارد کنید یا `0` برای بدون خروج:", { parse_mode: "Markdown" });
    return;
  }

  // --- New Task: Auto Leave ---
  if (state === "new_task_autoleave") {
    const mins = parseInt(text);
    ctx.session.newTask.auto_leave_after = mins > 0 ? mins : null;
    ctx.session.state = null;
    const task = ctx.session.newTask;
    try {
      const token = await getAdminToken();
      const res = await api.post("/api/tasks/join", task, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.replyWithMarkdown(
        `✅ *تسک ایجاد شد!*\n\n` +
        `🆔 شناسه: \`${res.data.task_id}\`\n` +
        `🎯 هدف: ${task.target}\n` +
        `📱 تعداد سشن: ${formatNumber(task.session_count)}\n` +
        `⏱ تأخیر: ${task.join_delay_min}-${task.join_delay_max} ثانیه` +
        (task.auto_leave_after ? `\n⏰ خروج خودکار: ${task.auto_leave_after} دقیقه` : "")
      );
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- Add Proxy ---
  if (state === "waiting_proxy") {
    ctx.session.state = null;
    const parts = text.split("|");
    if (!parts[1] || !parts[2]) return ctx.reply("❌ فرمت اشتباه. مثال: `socks5|1.2.3.4|1080`");
    try {
      const token = await getAdminToken();
      await api.post("/api/proxies/", {
        proxy_type: parts[0] || "socks5",
        host:       parts[1].trim(),
        port:       parseInt(parts[2]),
        username:   parts[3]?.trim() || null,
        password:   parts[4]?.trim() || null
      }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply("✅ پروکسی اضافه شد.");
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- Bulk Proxies ---
  if (state === "waiting_bulk_proxies") {
    ctx.session.state = null;
    const lines = text.split("\n").filter(l => l.trim());
    const proxies = [];
    for (const line of lines) {
      try {
        if (line.includes("://")) {
          const url = new URL(line.trim());
          proxies.push({ proxy_type: url.protocol.replace(":", ""), host: url.hostname, port: parseInt(url.port), username: url.username || null, password: url.password || null });
        } else {
          const parts = line.split(":");
          if (parts.length >= 2) proxies.push({ proxy_type: "socks5", host: parts[0], port: parseInt(parts[1]), username: parts[2] || null, password: parts[3] || null });
        }
      } catch (_) {}
    }
    if (!proxies.length) return ctx.reply("❌ هیچ پروکسی معتبری یافت نشد.");
    try {
      const token = await getAdminToken();
      const res = await api.post("/api/proxies/bulk", { proxies }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply(`✅ ${res.data.added} پروکسی اضافه شد. ${res.data.skipped} تکراری رد شد.`);
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.message}`);
    }
    return;
  }

  // --- Payment Amount ---
  if (state && state.startsWith("waiting_amount_")) {
    const currency = state.replace("waiting_amount_", "");
    const amount   = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ مبلغ معتبر وارد کنید.");
    ctx.session.state = null;
    try {
      const token = ctx.session?.userToken;
      if (!token) return ctx.reply("❌ لطفاً دوباره /start بزنید.");
      const res = await api.post("/api/orders/", { amount_usd: amount, currency }, { headers: { Authorization: `Bearer ${token}` } });
      const o = res.data;
      await ctx.replyWithMarkdown(
        `💳 *اطلاعات پرداخت*\n\n` +
        `💵 مبلغ: $${o.amount_usd}\n` +
        `🪙 مقدار: \`${o.amount_crypto}\` ${currency}\n` +
        `📬 آدرس کیف پول:\n\`${o.wallet}\`\n\n` +
        `⏰ مهلت پرداخت: ۱ ساعت\n\n` +
        `پس از پرداخت، تصویر رسید یا هش تراکنش را ارسال کنید.`,
        Markup.inlineKeyboard([
          [Markup.button.callback("📤 ارسال رسید", `submit_order_${o.order_id}`)]
        ])
      );
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- Reject Order ---
  if (state && state.startsWith("reject_order_")) {
    const orderId = state.replace("reject_order_", "");
    ctx.session.state = null;
    try {
      const token = await getAdminToken();
      await api.post(`/api/orders/${orderId}/reject`, { admin_note: text }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply("✅ سفارش رد شد.");
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.message}`);
    }
    return;
  }

  // --- Add Plan ---
  if (state === "waiting_plan") {
    ctx.session.state = null;
    const parts = text.split("|");
    if (parts.length < 4) return ctx.reply("❌ فرمت اشتباه. مثال: `پلن برنزی|Bronze Plan|1000|50`");
    try {
      const token = await getAdminToken();
      await api.post("/api/settings/plans", {
        name_fa:       parts[0].trim(),
        name_en:       parts[1].trim(),
        session_count: parseInt(parts[2]),
        price_usd:     parseFloat(parts[3]),
        duration_days: parts[4] ? parseInt(parts[4]) : null
      }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply("✅ پلن اضافه شد.");
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- Add Discount ---
  if (state === "waiting_discount") {
    ctx.session.state = null;
    const parts = text.split("|");
    if (parts.length < 3) return ctx.reply("❌ فرمت اشتباه. مثال: `SUMMER30|percent|30|100`");
    try {
      const token = await getAdminToken();
      await api.post("/api/settings/discounts", {
        code:      parts[0].trim().toUpperCase(),
        type:      parts[1].trim(),
        value:     parseFloat(parts[2]),
        max_uses:  parts[3] ? parseInt(parts[3]) : null
      }, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply("✅ کد تخفیف اضافه شد.");
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }
});

// ===== PHOTO HANDLER (receipt) =====
bot.on("photo", async (ctx) => {
  if (!ctx.session) ctx.session = {};
  const state = ctx.session.state;
  if (state && state.startsWith("submit_order_")) {
    const orderId = state.replace("submit_order_", "");
    ctx.session.state = null;
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    try {
      const token = ctx.session?.userToken;
      if (!token) return ctx.reply("❌ لطفاً دوباره /start بزنید.");
      await api.post(`/api/orders/${orderId}/submit`, null, {
        params: { screenshot_file_id: fileId },
        headers: { Authorization: `Bearer ${token}` }
      });
      await ctx.reply("✅ رسید ارسال شد. منتظر تأیید ادمین باشید.");
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.message}`);
    }
  }
});

// ===== ERROR HANDLER =====
bot.catch((err, ctx) => {
  logger.error(`Bot error for update ${ctx.update?.update_id}: ${err.message}`);
});

// ===== LAUNCH =====
bot.launch().then(() => {
  logger.info("🤖 Bot started successfully!");
}).catch(err => {
  logger.error(`Failed to start bot: ${err.message}`);
  process.exit(1);
});

process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
