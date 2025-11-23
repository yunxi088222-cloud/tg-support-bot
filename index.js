import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ========= 配置 =========
const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
// 客服群：这里用 @群用户名
const SUPPORT_CHAT_ID = process.env.SUPPORT_CHAT_ID; // 例如 "@chaojjijqi168"
const API = `https://api.telegram.org/bot${TOKEN}`;
// =======================

if (!TOKEN || !WEBHOOK_URL || !SUPPORT_CHAT_ID) {
  console.error("❗ 请配置 BOT_TOKEN / WEBHOOK_URL / SUPPORT_CHAT_ID 环境变量");
}

// 启动时设置 Webhook
async function setWebhook() {
  try {
    const res = await axios.get(`${API}/setWebhook`, {
      params: { url: WEBHOOK_URL },
    });
    console.log("✅ Webhook 已设置：", res.data);
  } catch (e) {
    console.error("❗ Webhook 设置失败：", e.response?.data || e.message);
  }
}

setWebhook();

// 从文本里提取 “客户ID: 123456789”
function extractCustomerId(text) {
  if (!text) return null;
  const match = text.match(/客户ID:\s*(\-?\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

// 日志输出，方便看 chatId / 来源
function logMessage(prefix, msg) {
  const chat = msg.chat;
  const from = msg.from;
  console.log(
    `${prefix} chatId=${chat.id} type=${chat.type} from=${from.id} text=${msg.text || msg.caption || "[非文本消息]"}`
  );
}

// 处理 Telegram 回调
app.post("/", async (req, res) => {
  const update = req.body;
  const message = update.message;

  if (!message) {
    return res.sendStatus(200);
  }

  const chat = message.chat;
  const from = message.from;
  const chatType = chat.type; // private / group / supergroup
  const text = message.text || "";

  logMessage("收到消息：", message);

  // ========== 情况 1：客户 私聊 机器人 ==========
  if (chatType === "private") {
    const customer = from;
    const customerId = customer.id;

    const username = customer.username ? `@${customer.username}` : "无";
    const fullName =
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "无";

    // 文本描述
    let contentDesc = text || "";
    if (!contentDesc) {
      if (message.photo) contentDesc = "[发送了一张图片]";
      else if (message.sticker) contentDesc = "[发送了一个贴纸]";
      else if (message.voice) contentDesc = "[发送了一条语音]";
      else if (message.document) contentDesc = "[发送了一个文件]";
      else contentDesc = "[发送了非文本消息]";
    }

    const header =
      `📩 来自客户：\n` +
      `客户ID: ${customerId}\n` +
      `用户名: ${username}\n` +
      `昵称: ${fullName}\n\n` +
      `消息内容：\n${contentDesc}`;

    try {
      // 1）把文字发到客服群
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_ID,
        text: header,
      });

      // 2）如果是图片，再把图片发到客服群
      if (message.photo && message.photo.length > 0) {
        const photoSizes = message.photo;
        const fileId = photoSizes[photoSizes.length - 1].file_id;

        await axios.post(`${API}/sendPhoto`, {
          chat_id: SUPPORT_CHAT_ID,
          photo: fileId,
          caption: `来自客户（ID: ${customerId}）的图片`,
        });
      }
    } catch (e) {
      console.error("❗ 转发客户消息到客服群失败：", e.response?.data || e.message);
    }

    return res.sendStatus(200);
  }

  // ========== 情况 2：客服群里的消息 ==========
  if (chatType === "group" || chatType === "supergroup") {
    // 只处理你的客服群：比较群用户名
    if (chat.username && `@${chat.username}` !== SUPPORT_CHAT_ID) {
      return res.sendStatus(200);
    }

    // 忽略机器人自己的消息
    if (from.is_bot) {
      return res.sendStatus(200);
    }

    const replyTo = message.reply_to_message;
    if (!replyTo || !replyTo.text) {
      // 不是“回复那条客户信息”的，就当普通聊天，忽略
      return res.sendStatus(200);
    }

    // 从被回复的那条消息里解析客户ID
    const customerId = extractCustomerId(replyTo.text);
    if (!customerId) {
      // 没有客户ID，就不处理
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_ID,
        text: "❗ 没找到客户ID，请回复那条包含“客户ID: 数字”的消息。",
      });
      return res.sendStatus(200);
    }

    try {
      // 1）如果客服发的是图片
      if (message.photo && message.photo.length > 0) {
        const photoSizes = message.photo;
        const fileId = photoSizes[photoSizes.length - 1].file_id;

        await axios.post(`${API}/sendPhoto`, {
          chat_id: customerId,
          photo: fileId,
          caption: message.caption || "",
        });

        await axios.post(`${API}/sendMessage`, {
          chat_id: SUPPORT_CHAT_ID,
          text: `📤 已发送图片给客户（ID: ${customerId}）`,
        });

        return res.sendStatus(200);
      }

      // 2）普通文字回复
      if (text) {
        await axios.post(`${API}/sendMessage`, {
          chat_id: customerId,
          text: text,
        });

        await axios.post(`${API}/sendMessage`, {
          chat_id: SUPPORT_CHAT_ID,
          text: `✅ 已回复给客户（ID: ${customerId}）：\n${text}`,
        });
      }
    } catch (e) {
      console.error("❗ 从群里回复客户失败：", e.response?.data || e.message);
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_ID,
        text: "❗ 给客户发送消息时出错，请稍后重试。",
      });
    }

    return res.sendStatus(200);
  }

  // 其它情况忽略
  return res.sendStatus(200);
});

// 启动服务器
app.listen(Number(process.env.PORT) || 3000, () => {
  console.log("🚀 Bot 服务已启动，端口：", Number(process.env.PORT) || 3000);
});
