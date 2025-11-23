import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const API = `https://api.telegram.org/bot${TOKEN}`;

// 设置 Webhook
async function setWebhook() {
  try {
    const url = `${API}/setWebhook?url=${WEBHOOK_URL}`;
    const res = await axios.get(url);
    console.log("Webhook 已设置：", res.data);
  } catch (e) {
    console.error("Webhook 设置失败：", e.response?.data || e);
  }
}

setWebhook();

// 处理消息
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
