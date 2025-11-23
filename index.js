import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ========= 配置 =========
const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// 直接写死你的客服群用户名（论坛群）
const SUPPORT_CHAT_USERNAME = "@chaojijiqi168";

const API = `https://api.telegram.org/bot${TOKEN}`;
// =======================

// 内存映射：客户ID <-> 话题ID
const customerToTopic = new Map(); // customerId -> topicId
const topicToCustomer = new Map(); // topicId -> customerId

if (!TOKEN || !WEBHOOK_URL) {
  console.error("❗ 请配置 BOT_TOKEN 和 WEBHOOK_URL 环境变量");
}

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

// 日志输出
function logMessage(prefix, msg) {
  const chat = msg.chat;
  const from = msg.from;
  console.log(
    `${prefix} chatId=${chat.id} type=${chat.type} thread=${msg.message_thread_id || "-"} from=${from.id} text=${msg.text || msg.caption || "[非文本消息]"}`
  );
}

// 从文本里提取 “客户ID: 123456789”
function extractCustomerId(text) {
  if (!text) return null;
  const match = text.match(/客户ID:\s*(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

// 为客户创建 / 获取话题ID
async function getOrCreateTopicForCustomer(customer) {
  const customerId = customer.id;

  if (customerToTopic.has(customerId)) {
    return customerToTopic.get(customerId);
  }

  const username = customer.username ? `@${customer.username}` : "无";
  const fullName =
    `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "无";

  const title = `客户 #${customerId} (username: ${username})`;
  console.log("🧵 为客户创建新话题：", title);

  const res = await axios.post(`${API}/createForumTopic`, {
    chat_id: SUPPORT_CHAT_USERNAME, // 用群用户名
    name: title,
  });

  const topicId = res.data?.result?.message_thread_id;
  if (!topicId) {
    throw new Error("createForumTopic 未返回 message_thread_id");
  }

  customerToTopic.set(customerId, topicId);
  topicToCustomer.set(topicId, customerId);

  return topicId;
}

// ========== Telegram 回调 =============
app.post("/", async (req, res) => {
  const update = req.body;
  const msg = update.message;

  if (!msg) return res.sendStatus(200);

  const chat = msg.chat;
  const from = msg.from;
  const chatType = chat.type;
  const text = msg.text || "";

  logMessage("收到消息：", msg);

  // ========== 情况 1：客户 私聊 机器人 ==========
  if (chatType === "private") {
    const customer = from;
    const customerId = customer.id;

    try {
      const topicId = await getOrCreateTopicForCustomer(customer);

      const username = customer.username ? `@${customer.username}` : "无";
      const fullName =
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "无";

      // 文本描述
      let contentDesc = text || "";
      if (!contentDesc) {
        if (msg.photo) contentDesc = "[发送了一张图片]";
        else if (msg.sticker) contentDesc = "[发送了一个贴纸]";
        else if (msg.voice) contentDesc = "[发送了一条语音]";
        else if (msg.document) contentDesc = "[发送了一个文件]";
        else contentDesc = "[发送了非文本消息]";
      }

      const header =
        `📩 来自客户：\n` +
        `客户ID: ${customerId}\n` +
        `用户名: ${username}\n` +
        `昵称: ${fullName}\n\n` +
        `消息内容：\n${contentDesc}`;

      // 1）发文字到对应话题
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_USERNAME,
        message_thread_id: topicId,
        text: header,
      });

      // 2）如果是图片，再发图片到话题
      if (msg.photo && msg.photo.length > 0) {
        const photoSizes = msg.photo;
        const fileId = photoSizes[photoSizes.length - 1].file_id;

        await axios.post(`${API}/sendPhoto`, {
          chat_id: SUPPORT_CHAT_USERNAME,
          message_thread_id: topicId,
          photo: fileId,
          caption: `来自客户（ID: ${customerId}）的图片`,
        });
      }
    } catch (e) {
      console.error("❗ 处理客户私聊失败：", e.response?.data || e.message);
    }

    return res.sendStatus(200);
  }

  // ========== 情况 2：客服论坛群里的消息 ==========
  if (chatType === "group" || chatType === "supergroup") {
    // 只处理你的客服群
    if (chat.username && `@${chat.username}` !== SUPPORT_CHAT_USERNAME) {
      return res.sendStatus(200);
    }

    if (from.is_bot) return res.sendStatus(200);

    // 必须是在某个话题里
    const topicId = msg.message_thread_id;
    if (!topicId) return res.sendStatus(200);

    const replyTo = msg.reply_to_message;
    if (!replyTo || !replyTo.text) {
      // 不是在回复“客户消息”，忽略
      return res.sendStatus(200);
    }

    // 先看映射
    let customerId = topicToCustomer.get(topicId);

    // 若映射丢了（重启后），从文字里解析客户ID
    if (!customerId) {
      customerId = extractCustomerId(replyTo.text);
      if (customerId) {
        customerToTopic.set(customerId, topicId);
        topicToCustomer.set(topicId, customerId);
      }
    }

    if (!customerId) {
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_USERNAME,
        message_thread_id: topicId,
        text: "❗ 未找到这个话题对应的客户ID，请确认话题里有包含“客户ID: 数字”的那条消息。",
      });
      return res.sendStatus(200);
    }

    try {
      // 1）图片回复
      if (msg.photo && msg.photo.length > 0) {
        const photoSizes = msg.photo;
        const fileId = photoSizes[photoSizes.length - 1].file_id;

        await axios.post(`${API}/sendPhoto`, {
          chat_id: customerId,
          photo: fileId,
          caption: msg.caption || "",
        });

        await axios.post(`${API}/sendMessage`, {
          chat_id: SUPPORT_CHAT_USERNAME,
          message_thread_id: topicId,
          text: `📤 已发送图片给客户（ID: ${customerId}）`,
        });

        return res.sendStatus(200);
      }

      // 2）文字回复
      if (text) {
        await axios.post(`${API}/sendMessage`, {
          chat_id: customerId,
          text,
        });

        await axios.post(`${API}/sendMessage`, {
          chat_id: SUPPORT_CHAT_USERNAME,
          message_thread_id: topicId,
          text: `✅ 已回复给客户（ID: ${customerId}）：\n${text}`,
        });
      }
    } catch (e) {
      console.error("❗ 从话题回复客户失败：", e.response?.data || e.message);
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_USERNAME,
        message_thread_id: topicId,
        text: "❗ 给客户发送消息时出错，请稍后重试。",
      });
    }

    return res.sendStatus(200);
  }

  return res.sendStatus(200);
});

// 启动服务
app.listen(Number(process.env.PORT) || 3000, () => {
  console.log("🚀 Bot 服务已启动（话题版），端口：", Number(process.env.PORT) || 3000);
});
