require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const axios = require("axios");
const winston = require("winston");

// ===== Logger =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "/app/logs/bot.log" })
  ]
});

// ===== Config =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL || "http://api:8000";
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(id => parseInt(id.trim())).filter(Boolean);

if (!BOT_TOKEN) {
  logger.error("BOT_TOKEN is not set!");
  process.exit(1);
}

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
  const res = await api.post("/api/auth/user/register", {
    user_id: userId,
    username: username || "",
    full_name: fullName || "کاربر",
    language: language || "fa"
  });
  return res.data.access_token;
}

// ===== Middleware =====
bot.use(async (ctx, next) => {
  if (!ctx.session) ctx.session = {};
  if (ctx.from) {
    const userId = ctx.from.id;
    const isAdmin = ADMIN_IDS.includes(userId);
    ctx.state.isAdmin = isAdmin;
    ctx.state.userId = userId;
    if (!ctx.session.userToken) {
      try {
        ctx.session.userToken = await getUserToken(
          userId,
          ctx.from.username,
          `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim(),
          ctx.from.language_code || "fa"
        );
      } catch (e) {
        logger.error(`Token error for ${userId}: ${e.message}`);
      }
    }
  }
  return next();
});

// ===== Helpers =====
const isAdmin = (ctx) => ADMIN_IDS.includes(ctx.from?.id);

const formatNumber = (n) => Number(n || 0).toLocaleString("fa-IR");

const statusEmoji = {
  active: "🟢",
  logged_out: "🔴",
  deleted: "⛔",
  banned: "🚫",
  flood: "🌊",
  error: "❌",
  inactive: "⚪"
};

const taskStatusEmoji = {
  pending: "⏳",
  running: "▶️",
  paused: "⏸",
  completed: "✅",
  failed: "❌",
  cancelled: "🚫"
};

// ===== START =====
bot.start(async (ctx) => {
  const name = ctx.from.first_name || "کاربر";
  const adminMenu = isAdmin(ctx) ? "\n\n🔑 شما به عنوان ادمین وارد شدید." : "";
  await ctx.reply(
    `سلام ${name} عزیز! 👋\n\n` +
    `به سیستم مدیریت سشن خوش آمدید 🤖\n` +
    `از منوی زیر انتخاب کنید:${adminMenu}`,
    isAdmin(ctx) ? adminMainMenu() : userMainMenu()
  );
});

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

// ===== ADMIN: DASHBOARD =====
bot.hears("📊 داشبورد", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/stats/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    const d = res.data;
    const sessions = d.sessions || {};
    const tasks = d.tasks || {};
    const msg =
      `📊 *داشبورد سیستم*\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 *سشن‌ها:*\n` +
      `🟢 فعال: ${formatNumber(sessions.active)}\n` +
      `🔴 لاگ‌اوت: ${formatNumber(sessions.logged_out)}\n` +
      `⛔ حذف‌شده: ${formatNumber(sessions.deleted)}\n` +
      `🚫 بن‌شده: ${formatNumber(sessions.banned)}\n` +
      `🌊 فلود: ${formatNumber(sessions.flood)}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 *تسک‌ها:*\n` +
      `⏳ در صف: ${formatNumber(tasks.pending)}\n` +
      `▶️ در حال اجرا: ${formatNumber(tasks.running)}\n` +
      `✅ تکمیل‌شده: ${formatNumber(tasks.completed)}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👥 کاربران: ${formatNumber(d.users?.total)}\n` +
      `💰 درآمد امروز: $${(d.orders_today?.total_usd || 0).toFixed(2)}\n` +
      `📦 سفارش امروز: ${formatNumber(d.orders_today?.count)}`;
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
  ctx.message = ctx.update.callback_query.message;
  ctx.from = ctx.update.callback_query.from;
  await ctx.deleteMessage();
  await bot.handleUpdate({ message: { ...ctx.message, text: "📊 داشبورد", from: ctx.from, chat: ctx.chat } });
});

// ===== ADMIN: SESSION MANAGEMENT =====
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
        [Markup.button.callback("🔍 جستجو", "search_session"), Markup.button.callback("📤 خروجی CSV", "export_sessions")],
        [Markup.button.callback("🗑 حذف لاگ‌اوت‌ها", "delete_loggedout"), Markup.button.callback("🔄 بررسی سلامت", "health_check")]
      ])
    );
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت آمار سشن‌ها.");
  }
});

bot.action("add_session", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.state = "waiting_session_string";
  await ctx.reply(
    "📱 *افزودن سشن جدید*\n\n" +
    "لطفاً اطلاعات سشن را به فرمت زیر ارسال کنید:\n\n" +
    "`شماره|session_string|api_id|api_hash`\n\n" +
    "مثال:\n`+989123456789|1BQANOTEuAm...|12345|abc123def`\n\n" +
    "یا فقط session_string را ارسال کنید.",
    { parse_mode: "Markdown" }
  );
});

bot.action("list_sessions", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/sessions/?limit=10&page=1", { headers: { Authorization: `Bearer ${token}` } });
    const sessions = res.data.sessions || [];
    if (!sessions.length) return ctx.reply("📭 هیچ سشنی یافت نشد.");
    let msg = `📋 *لیست سشن‌ها (${res.data.total} عدد)*\n\n`;
    for (const s of sessions.slice(0, 10)) {
      const emoji = statusEmoji[s.status] || "⚪";
      msg += `${emoji} \`${s.phone}\` — ${s.status}\n`;
    }
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("◀️ قبلی", "sessions_prev_1"), Markup.button.callback("▶️ بعدی", "sessions_next_2")]
    ]));
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت لیست.");
  }
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
  ctx.session.state = "new_task_target";
  ctx.session.newTask = {};
  await ctx.reply(
    "📋 *تسک جدید - عضو کردن*\n\n" +
    "🔗 لینک یا آیدی کانال/گروه را ارسال کنید:\n\n" +
    "مثال‌ها:\n" +
    "• `https://t.me/channelname`\n" +
    "• `https://t.me/+AbCdEfGhIjK`\n" +
    "• `@channelname`\n" +
    "• `-1001234567890` (آیدی عددی)",
    { parse_mode: "Markdown" }
  );
});

bot.action("list_tasks", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/tasks/?limit=10", { headers: { Authorization: `Bearer ${token}` } });
    const tasks = res.data || [];
    if (!tasks.length) return ctx.reply("📭 هیچ تسکی یافت نشد.");
    let msg = "📋 *آخرین تسک‌ها:*\n\n";
    for (const t of tasks) {
      const emoji = taskStatusEmoji[t.status] || "⚪";
      const progress = t.session_count > 0 ? Math.round((t.sessions_done / t.session_count) * 100) : 0;
      msg += `${emoji} \`${t.id.slice(0, 8)}\` — ${t.type}\n`;
      msg += `   🎯 ${t.target.slice(0, 30)}\n`;
      msg += `   📊 ${formatNumber(t.sessions_done)}/${formatNumber(t.session_count)} (${progress}%)\n\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت تسک‌ها.");
  }
});

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
    const res = await api.get("/api/orders/?status=confirming", { headers: { Authorization: `Bearer ${token}` } });
    const orders = res.data || [];
    if (!orders.length) return ctx.reply("✅ هیچ سفارش در انتظاری وجود ندارد.");
    for (const o of orders.slice(0, 5)) {
      const msg =
        `💰 *سفارش جدید*\n\n` +
        `👤 کاربر: ${o.full_name || "نامشخص"} (@${o.username || "-"})\n` +
        `💵 مبلغ: $${o.amount}\n` +
        `🪙 ارز: ${o.currency}\n` +
        `💎 مقدار: ${o.amount_crypto} ${o.currency}\n` +
        `🔗 تراکنش: \`${o.tx_hash || "ارسال نشده"}\`\n` +
        `📅 تاریخ: ${new Date(o.created_at).toLocaleString("fa-IR")}`;
      await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ تأیید", `confirm_order_${o.id}`),
          Markup.button.callback("❌ رد", `reject_order_${o.id}`)
        ]
      ]));
    }
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت سفارشات.");
  }
});

// Handle order confirm/reject
bot.action(/confirm_order_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("در حال تأیید...");
  const orderId = ctx.match[1];
  try {
    const token = await getAdminToken();
    await api.post(`/api/orders/${orderId}/confirm`, {}, { headers: { Authorization: `Bearer ${token}` } });
    await ctx.editMessageText("✅ سفارش با موفقیت تأیید شد و موجودی کاربر شارژ شد.");
  } catch (e) {
    await ctx.reply("❌ خطا در تأیید سفارش.");
  }
});

bot.action(/reject_order_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.state = `reject_order_${ctx.match[1]}`;
  await ctx.reply("❌ دلیل رد سفارش را بنویسید:");
});

// ===== ADMIN: USERS =====
bot.hears("👥 کاربران", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/users/?limit=10", { headers: { Authorization: `Bearer ${token}` } });
    const users = res.data || [];
    let msg = `👥 *لیست کاربران*\n\n`;
    for (const u of users) {
      msg += `👤 ${u.full_name} (@${u.username || "-"})\n`;
      msg += `   💰 موجودی: $${u.balance} | ${u.is_banned ? "🚫 بن" : "✅ فعال"}\n\n`;
    }
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("🔍 جستجوی کاربر", "search_user")],
      [Markup.button.callback("💰 شارژ موجودی", "add_balance_user")]
    ]));
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت کاربران.");
  }
});

// ===== ADMIN: PROXIES =====
bot.hears("🌐 پروکسی‌ها", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  await ctx.replyWithMarkdown(
    "🌐 *مدیریت پروکسی‌ها*\n\nپروکسی‌ها به صورت رندوم برای سشن‌ها استفاده می‌شوند.",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ افزودن پروکسی", "add_proxy")],
      [Markup.button.callback("📋 لیست پروکسی‌ها", "list_proxies")],
      [Markup.button.callback("📤 افزودن دسته‌ای", "bulk_add_proxies")]
    ])
  );
});

bot.action("add_proxy", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.state = "waiting_proxy";
  await ctx.reply(
    "🌐 *افزودن پروکسی*\n\n" +
    "فرمت: `نوع|host|port|user|pass`\n\n" +
    "مثال:\n`socks5|1.2.3.4|1080|user|pass`\n" +
    "یا بدون احراز هویت:\n`socks5|1.2.3.4|1080`",
    { parse_mode: "Markdown" }
  );
});

bot.action("bulk_add_proxies", async (ctx) => {
  await ctx.answerCbQuery();
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
    const s = res.data;
    const msg =
      `⚙️ *تنظیمات سیستم*\n\n` +
      `⏱ تأخیر join (ثانیه): ${s.join_delay_min?.value} - ${s.join_delay_max?.value}\n` +
      `🔄 تلاش مجدد: ${s.max_retries?.value}\n` +
      `🌊 ضریب فلود: ${s.flood_multiplier?.value}\n` +
      `💵 حداقل واریز: $${s.min_deposit_usd?.value}\n` +
      `📊 نرخ USDT: $${s.usdt_rate?.value}\n` +
      `📊 نرخ TON: $${s.ton_rate?.value}\n` +
      `📊 نرخ TRX: $${s.trx_rate?.value}`;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback("✏️ ویرایش تنظیمات", "edit_settings")]
    ]));
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت تنظیمات.");
  }
});

// ===== ADMIN: PLANS =====
bot.hears("📦 پلن‌ها", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ دسترسی ندارید.");
  try {
    const token = await getAdminToken();
    const res = await api.get("/api/settings/plans", { headers: { Authorization: `Bearer ${token}` } });
    const plans = res.data || [];
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
  ctx.session.state = "waiting_plan";
  await ctx.reply(
    "📦 *پلن جدید*\n\n" +
    "اطلاعات را به فرمت زیر ارسال کنید:\n" +
    "`نام فارسی|نام انگلیسی|تعداد سشن|قیمت دلار|مدت روز`\n\n" +
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
    const discounts = res.data || [];
    let msg = "🎟 *کدهای تخفیف:*\n\n";
    if (!discounts.length) msg += "هیچ کد تخفیفی وجود ندارد.";
    for (const d of discounts) {
      const val = d.type === "percent" ? `${d.value}%` : `$${d.value}`;
      msg += `🎟 \`${d.code}\` — ${val}\n`;
      msg += `   استفاده: ${d.used_count}/${d.max_uses || "∞"}\n\n`;
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
  ctx.session.state = "waiting_discount";
  await ctx.reply(
    "🎟 *کد تخفیف جدید*\n\n" +
    "فرمت: `کد|نوع|مقدار|حداکثر_استفاده`\n\n" +
    "نوع: `percent` یا `fixed`\n\n" +
    "مثال:\n`SUMMER30|percent|30|100`\n" +
    "`VIP50|fixed|50|10`",
    { parse_mode: "Markdown" }
  );
});

// ===== USER: WALLET =====
bot.hears("💰 کیف پول", async (ctx) => {
  try {
    const token = ctx.session.userToken;
    const res = await api.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    const u = res.data;
    await ctx.replyWithMarkdown(
      `💰 *کیف پول شما*\n\n` +
      `👤 نام: ${u.full_name}\n` +
      `💵 موجودی: $${u.balance || 0}\n` +
      `📊 کل خرید: $${u.total_spent || 0}`,
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
    "💳 *شارژ کیف پول*\n\n" +
    "ارز مورد نظر را انتخاب کنید:",
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
  ctx.session.state = `waiting_amount_${currency}`;
  await ctx.reply(
    `💳 *پرداخت با ${currency}*\n\n` +
    "مبلغ مورد نظر را به دلار وارد کنید:\n" +
    "مثال: `50`",
    { parse_mode: "Markdown" }
  );
});

// ===== USER: BUY SERVICE =====
bot.hears("🛒 خرید سرویس", async (ctx) => {
  try {
    const res = await api.get("/api/settings/plans");
    const plans = res.data || [];
    if (!plans.length) return ctx.reply("❌ در حال حاضر پلنی موجود نیست.");
    await ctx.replyWithMarkdown("🛒 *پلن‌های موجود:*\n\nیک پلن انتخاب کنید:",
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

// ===== USER: MY ORDERS =====
bot.hears("📋 سفارشات من", async (ctx) => {
  try {
    const token = ctx.session.userToken;
    const res = await api.get("/api/orders/?limit=5", { headers: { Authorization: `Bearer ${token}` } });
    const orders = res.data || [];
    if (!orders.length) return ctx.reply("📭 هیچ سفارشی ندارید.");
    let msg = "📋 *سفارشات اخیر شما:*\n\n";
    for (const o of orders) {
      const statusMap = { pending: "⏳ در انتظار", confirming: "🔍 در حال بررسی", confirmed: "✅ تأیید شده", rejected: "❌ رد شده" };
      msg += `${statusMap[o.status] || o.status}\n`;
      msg += `💵 $${o.amount} — ${o.currency}\n`;
      msg += `📅 ${new Date(o.created_at).toLocaleDateString("fa-IR")}\n\n`;
    }
    await ctx.replyWithMarkdown(msg);
  } catch (e) {
    await ctx.reply("❌ خطا در دریافت سفارشات.");
  }
});

// ===== USER: HELP =====
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

// ===== TEXT MESSAGE HANDLER =====
bot.on("text", async (ctx) => {
  const state = ctx.session.state;
  const text = ctx.message.text;
  if (!state) return;

  // --- Add Session ---
  if (state === "waiting_session_string") {
    ctx.session.state = null;
    const parts = text.split("|");
    const sessionData = {
      phone: parts[0] || `+98${Date.now()}`,
      session_string: parts[1] || parts[0],
      api_id: parts[2] ? parseInt(parts[2]) : null,
      api_hash: parts[3] || null
    };
    try {
      const token = await getAdminToken();
      await api.post("/api/sessions/", sessionData, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply("✅ سشن با موفقیت اضافه شد.");
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.response?.data?.detail || e.message}`);
    }
    return;
  }

  // --- New Task: Target ---
  if (state === "new_task_target") {
    ctx.session.newTask.target = text;
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
    await ctx.reply(
      "⏱ تأخیر بین عضو کردن‌ها را وارد کنید (ثانیه):\n" +
      "فرمت: `حداقل-حداکثر`\n" +
      "مثال: `3-8`\n" +
      "یا Enter بزنید برای پیش‌فرض (3-8):",
      { parse_mode: "Markdown" }
    );
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
    await ctx.reply(
      "⏰ خروج خودکار بعد از چند دقیقه؟\n" +
      "عدد وارد کنید یا `0` برای بدون خروج خودکار:",
      { parse_mode: "Markdown" }
    );
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
        `📊 وضعیت: در صف\n` +
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
    try {
      const token = await getAdminToken();
      await api.post("/api/proxies/", {
        proxy_type: parts[0] || "socks5",
        host: parts[1],
        port: parseInt(parts[2]),
        username: parts[3] || null,
        password: parts[4] || null
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
          const url = new URL(line);
          proxies.push({ proxy_type: url.protocol.replace(":", ""), host: url.hostname, port: parseInt(url.port), username: url.username || null, password: url.password || null });
        } else {
          const parts = line.split(":");
          proxies.push({ proxy_type: "socks5", host: parts[0], port: parseInt(parts[1]), username: parts[2] || null, password: parts[3] || null });
        }
      } catch (e) {}
    }
    try {
      const token = await getAdminToken();
      const res = await api.post("/api/proxies/bulk", proxies, { headers: { Authorization: `Bearer ${token}` } });
      await ctx.reply(`✅ ${res.data.added} پروکسی اضافه شد.`);
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.message}`);
    }
    return;
  }

  // --- Payment Amount ---
  if (state && state.startsWith("waiting_amount_")) {
    const currency = state.replace("waiting_amount_", "");
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ مبلغ معتبر وارد کنید.");
    ctx.session.state = null;
    try {
      const token = ctx.session.userToken;
      const res = await api.post("/api/orders/", { amount_usd: amount, currency }, { headers: { Authorization: `Bearer ${token}` } });
      const o = res.data;
      await ctx.replyWithMarkdown(
        `💳 *اطلاعات پرداخت*\n\n` +
        `💵 مبلغ: $${o.amount_usd}\n` +
        `🪙 مقدار: \`${o.amount_crypto}\` ${currency}\n` +
        `📬 آدرس کیف پول:\n\`${o.wallet}\`\n\n` +
        `⏰ مهلت پرداخت: ۲ ساعت\n\n` +
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
    try {
      const token = await getAdminToken();
      await api.post("/api/settings/plans", {
        name_fa: parts[0],
        name_en: parts[1],
        session_count: parseInt(parts[2]),
        price_usd: parseFloat(parts[3]),
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
    try {
      const token = await getAdminToken();
      await api.post("/api/settings/discounts", {
        code: parts[0],
        type: parts[1],
        value: parseFloat(parts[2]),
        max_uses: parts[3] ? parseInt(parts[3]) : null
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
  const state = ctx.session.state;
  if (state && state.startsWith("submit_order_")) {
    const orderId = state.replace("submit_order_", "");
    ctx.session.state = null;
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    try {
      const token = ctx.session.userToken;
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
  logger.error(`Bot error: ${err.message}`, { update: ctx.update });
});

// ===== LAUNCH =====
bot.launch().then(() => {
  logger.info("🤖 Bot started successfully!");
}).catch(err => {
  logger.error(`Failed to start bot: ${err.message}`);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
