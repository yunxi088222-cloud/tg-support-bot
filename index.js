import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ========= 配置 =========
const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
// ⭐⭐ 这里直接写死你的群用户名
const SUPPORT_CHAT_USERNAME = "@chaojijiqi168";

const API = `https://api.telegram.org/bot${TOKEN}`;
// ========================

// 启动时设置 webhook
async function setWebhook() {
  try {
    const res = await axios.get(`${API}/setWebhook`, {
      params: { url: WEBHOOK_URL },
    });
    console.log("Webhook 已设置：", res.data);
  } catch (e) {
    console.error("Webhook 设置失败：", e.response?.data || e.message);
  }
}

setWebhook();

// ⭐ 让机器人把 "/start" 等消息转发到群（用群用户名）
async function forwardToSupport(text) {
  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id: SUPPORT_CHAT_USERNAME,   // <-- 用群用户名
      text,
    });
  } catch (e) {
    console.error("发往客服群失败：", e.response?.data || e.message);
  }
}

// ⭐ 群里回复 → 客户
async function replyToCustomer(customerId, text) {
  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id: customerId,
      text,
    });
  } catch (e) {
    console.error("回复客户失败：", e.response?.data || e.message);
  }
}

// ========== Telegram 回调 =============
app.post("/", async (req, res) => {
  const update = req.body;

  const msg = update.message;
  if (!msg) return res.sendStatus(200);

  const chat = msg.chat;
  const from = msg.from;

  // ========== 私聊：客户 → 机器人 ==========
  if (chat.type === "private") {
    const content = msg.text || "[非文本消息]";

    // 转发客户信息到客服群
    await forwardToSupport(
      `📩 客户发来消息\n` +
      `客户ID：${from.id}\n` +
      `用户名：@${from.username || "无"}\n` +
      `内容：${content}`
    );

    return res.sendStatus(200);
  }

  // ========== 群：客服 → 客户 ==========
  if (chat.type === "supergroup" || chat.type === "group") {
    // 必须在指定的客服群里
    if (`@${chat.username}` !== SUPPORT_CHAT_USERNAME) {
      return res.sendStatus(200);
    }

    // 只能通过“回复客户信息”的方式发送
    if (!msg.reply_to_message) return res.sendStatus(200);

    const replyText = msg.text;
    if (!replyText) return res.sendStatus(200);

    // 从被回复的消息里提取客户ID
    const match = msg.reply_to_message.text?.match(/客户ID：(\d+)/);
    if (!match) return res.sendStatus(200);

    const customerId = match[1];

    // 发回给客户
    await replyToCustomer(customerId, replyText);

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// 启动服务
app.listen(Number(process.env.PORT) || 3000, () =>
  console.log("Bot 已启动")
);


