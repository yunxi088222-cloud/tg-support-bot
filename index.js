import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ====== 你的配置 ======
const TOKEN = "8148731949:AAGb6aXhFCFLLKA4ewt2kxs2qSlcB3b0kkQ";
const WEBHOOK_URL = "https://tg-support-bot-production.up.railway.app";
const API = `https://api.telegram.org/bot${TOKEN}`;
// ======================

// 设置 Webhook（启动时自动执行）
async function setWebhook() {
  try {
    const res = await axios.get(`${API}/setWebhook?url=${WEBHOOK_URL}`);
    console.log("Webhook 已设置：", res.data);
  } catch (e) {
    console.error("Webhook 设置失败：", e.response?.data || e.message);
  }
}

setWebhook();

// 处理 Telegram 推送消息
app.post("/", async (req, res) => {
  const message = req.body.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text || "";

  await axios.post(`${API}/sendMessage`, {
    chat_id: chatId,
    text: `你发送了：${text}`
  });

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Bot 服务已启动");
});
