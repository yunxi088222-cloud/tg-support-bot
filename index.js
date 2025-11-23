import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ========= 配置（从环境变量读取） =========
const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const AGENT_ID = Number(process.env.AGENT_ID || "6918018663"); // 你的个人账号
const API = `https://api.telegram.org/bot${TOKEN}`;
// =====================================

// 启动时设置 Webhook
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

// 从文本里提取 “客户ID: 123456789”
function extractCustomerId(text) {
  if (!text) return null;
  const match = text.match(/客户ID:\s*(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

// 处理所有 Telegram 回调
app.post("/", async (req, res) => {
  const update = req.body;
  const message = update.message;

  if (!message) {
    return res.sendStatus(200);
  }

  const from = message.from;
  const fromId = from.id;
  const text = message.text || "";
  console.log("收到消息：", fromId, text || "[非文本消息]");

  // ========== 情况 1：你本人（客服）发消息 ==========
  if (fromId === AGENT_ID) {
    const replyTo = message.reply_to_message;
    if (!replyTo || !replyTo.text) {
      // 你没有“回复”客户的那条消息
      await axios.post(`${API}/sendMessage`, {
        chat_id: AGENT_ID,
        text: "❗ 请在『客户消息那一条』上使用【回复】功能再发送，这样我才能知道要回给哪个客户。",
      });
      return res.sendStatus(200);
    }

    // 从被回复的那条消息里提取客户ID
    const customerId = extractCustomerId(replyTo.text);
    if (!customerId) {
      await axios.post(`${API}/sendMessage`, {
        chat_id: AGENT_ID,
        text: "❗ 没找到客户ID，请确认被回复的那条消息里包含“客户ID: 数字”。",
      });
      return res.sendStatus(200);
    }

    try {
      // 1）如果你发的是图片
      if (message.photo && message.photo.length > 0) {
        const photoSizes = message.photo;
        const fileId = photoSizes[photoSizes.length - 1].file_id; // 最大尺寸的那张

        await axios.post(`${API}/sendPhoto`, {
          chat_id: customerId,
          photo: fileId,
          caption: message.caption || "",
        });

        await axios.post(`${API}/sendMessage`, {
          chat_id: AGENT_ID,
          text: `📤 已发送图片给客户（ID: ${customerId}）`,
        });

        return res.sendStatus(200);
      }

      // 2）否则按普通文字处理
      if (text) {
        await axios.post(`${API}/sendMessage`, {
          chat_id: customerId,
          text: text,
        });

        await axios.post(`${API}/sendMessage`, {
          chat_id: AGENT_ID,
          text: `✅ 已回复给客户（ID: ${customerId}）：\n${text}`,
        });
      } else {
        await axios.post(`${API}/sendMessage`, {
          chat_id: AGENT_ID,
          text: "目前只支持转发文字和图片消息，其它类型暂未处理～",
        });
      }
    } catch (e) {
      console.error("给客户回复失败：", e.response?.data || e.message);
      await axios.post(`${API}/sendMessage`, {
        chat_id: AGENT_ID,
        text: "❗ 给客户发送消息时出错，请稍后重试。",
      });
    }

    return res.sendStatus(200);
  }

  // ========== 情况 2：普通客户发消息给机器人 ==========
  const customerId = fromId;
  const username = from.username ? `@${from.username}` : "无";
  const fullName = `${from.first_name || ""} ${from.last_name || ""}`.trim() || "无";

  // 1）先把客户信息 + 文本内容发给你
  let contentDesc = text || "";
  if (!contentDesc) {
    if (message.photo) contentDesc = "[发送了一张图片]";
    else if (message.sticker) contentDesc = "[发送了一个贴纸]";
    else if (message.voice) contentDesc = "[发送了一条语音]";
    else if (message.document) contentDesc = "[发送了一个文件]";
    else contentDesc = "[发送了非文本消息]";
  }

  const forwardText =
    `📩 来自客户：\n` +
    `客户ID: ${customerId}\n` +
    `用户名: ${username}\n` +
    `昵称: ${fullName}\n\n` +
    `消息内容：\n${contentDesc}`;

  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id: AGENT_ID,
      text: forwardText,
    });

    // 如果客户发的是图片，再把图片本身也转发给你
    if (message.photo && message.photo.length > 0) {
      const photoSizes = message.photo;
      const fileId = photoSizes[photoSizes.length - 1].file_id;

      await axios.post(`${API}/sendPhoto`, {
        chat_id: AGENT_ID,
        photo: fileId,
        caption: `来自客户（ID: ${customerId}）的图片`,
      });
    }
  } catch (e) {
    console.error("转发客户消息给客服失败：", e.response?.data || e.message);
  }

  // ⚠️ 这里不再给客户自动回复任何文本
  return res.sendStatus(200);
});

// 启动服务器
app.listen(process.env.PORT || 3000, () => {
  console.log("Bot 服务已启动，端口：", process.env.PORT || 3000);
});
