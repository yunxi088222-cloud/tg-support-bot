import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ====== 配置区（我帮你填好了默认值） ======
const TOKEN = process.env.BOT_TOKEN || "8148731949:AAGb6aXhFCFLLKA4ewt2kxs2qSlcB3b0kkQ";
const WEBHOOK_URL =
  process.env.WEBHOOK_URL || "https://tg-support-bot-production.up.railway.app";

// 你的个人 Telegram 用户 ID（你给我的 6918018663）
const AGENT_ID = Number(process.env.AGENT_ID || "6918018663");

const API = `https://api.telegram.org/bot${TOKEN}`;
// ======================================

// 设置 Webhook
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

// 启动时设置一次 Webhook
setWebhook();

// 从文字里提取“客户ID: 123456789”
function extractCustomerId(text) {
  if (!text) return null;
  const match = text.match(/客户ID:\s*(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

// 处理 Telegram Webhook 回调
app.post("/", async (req, res) => {
  const update = req.body;

  // 只处理 message 类型
  const message = update.message;
  if (!message) {
    return res.sendStatus(200);
  }

  const from = message.from;
  const fromId = from.id;
  const text = message.text || "";

  console.log("收到消息：", fromId, text);

  // ========== 情况 1：你本人（客服）发消息 ==========
  if (fromId === AGENT_ID) {
    // 你必须“回复”一条从客户转发来的消息
    const replyTo = message.reply_to_message;
    if (!replyTo || !replyTo.text) {
      // 没有 reply，就提示你正确用法
      await axios.post(`${API}/sendMessage`, {
        chat_id: AGENT_ID,
        text: "❗ 请在『客户消息那一条』上使用【回复】功能再发送，这样我才能知道要回给哪个客户。",
      });
      return res.sendStatus(200);
    }

    // 从被回复的那条消息文本中解析客户ID
    const customerId = extractCustomerId(replyTo.text);
    if (!customerId) {
      await axios.post(`${API}/sendMessage`, {
        chat_id: AGENT_ID,
        text: "❗ 没找到客户ID，请确认被回复的那条消息里包含“客户ID: 数字”。",
      });
      return res.sendStatus(200);
    }

    // 把你的回复转发给客户
    await axios.post(`${API}/sendMessage`, {
      chat_id: customerId,
      text: text,
    });

    // 可选：给你回一条提示
    await axios.post(`${API}/sendMessage`, {
      chat_id: AGENT_ID,
      text: `✅ 已回复给客户（ID: ${customerId}）：\n${text}`,
    });

    return res.sendStatus(200);
  }

  // ========== 情况 2：普通客户发消息给机器人 ==========
  const customerId = fromId;

  // 1）给你（客服）转发一份
  const username = from.username ? `@${from.username}` : "无";
  const fullName = `${from.first_name || ""} ${from.last_name || ""}`.trim();

  const forwardText =
    `📩 来自客户：\n` +
    `客户ID: ${customerId}\n` +
    `用户名: ${username}\n` +
    `昵称: ${fullName || "无"}\n\n` +
    `消息内容：\n${text}`;

  await axios.post(`${API}/sendMessage`, {
    chat_id: AGENT_ID,
    text: forwardText,
  });

  // 2）给客户发一个自动回复
  await axios.post(`${API}/sendMessage`, {
    chat_id: customerId,
    text: "✅ 已收到你的消息，稍后会有客服回复你哦～",
  });

  return res.sendStatus(200);
});

// 启动服务器
app.listen(process.env.PORT || 3000, () => {
  console.log("Bot 服务已启动，端口：", process.env.PORT || 3000);
});
