import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ========= 配置（从环境变量读取） =========
const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
// 客服“论坛群”ID：这里可以用 @群用户名，例如 @chaojijiqi168
const SUPPORT_CHAT_ID = process.env.SUPPORT_CHAT_ID;
const API = `https://api.telegram.org/bot${TOKEN}`;
// =====================================

// 内存里的 客户ID <-> 话题ID 映射（进阶可以换成数据库）
const customerToTopic = new Map(); // customerId -> topicId
const topicToCustomer = new Map(); // topicId -> customerId

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

// 创建（或取得）某个客户对应的话题ID
async function getOrCreateTopicForCustomer(customer) {
  const customerId = customer.id;

  if (customerToTopic.has(customerId)) {
    return customerToTopic.get(customerId);
  }

  // 话题标题格式：客户 #ID (username: @xxx)
  const username = customer.username ? `@${customer.username}` : "无";
  const fullName =
    `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "无";

  const title = `客户 #${customerId} (username: ${username})`;

  console.log("🧵 为客户创建新话题：", title);

  // 用 SUPPORT_CHAT_ID（可以是 @群用户名）创建话题
  const res = await axios.post(`${API}/createForumTopic`, {
    chat_id: SUPPORT_CHAT_ID,
    name: title,
  });

  const topicId = res.data?.result?.message_thread_id;
  if (!topicId) {
    throw new Error("createForumTopic 未返回 message_thread_id");
  }

  // 记录映射
  customerToTopic.set(customerId, topicId);
  topicToCustomer.set(topicId, customerId);

  return topicId;
}

// 统一日志输出，方便你看 chatId / topicId
function logMessage(prefix, msg) {
  const chat = msg.chat;
  const from = msg.from;
  console.log(
    `${prefix} chatId=${chat.id} type=${chat.type} thread=${msg.message_thread_id || "-"} from=${from.id
    } text=${msg.text || msg.caption || "[非文本消息]"}`
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

  // 日志：方便你在 Railway 看到 chatId / threadId
  logMessage("收到消息：", message);

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
        `昵称: ${fullName}\n`;

      // 1）把文字发到对应话题
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_ID,
        message_thread_id: topicId,
        text: `${header}\n消息内容：\n${contentDesc}`,
      });

      // 2）如果是图片，再把图片发到该话题
      if (message.photo && message.photo.length > 0) {
        const photoSizes = message.photo;
        const fileId = photoSizes[photoSizes.length - 1].file_id;

        await axios.post(`${API}/sendPhoto`, {
          chat_id: SUPPORT_CHAT_ID,
          message_thread_id: topicId,
          photo: fileId,
          caption: `来自客户（ID: ${customerId}）的图片`,
        });
      }

      // 不给客户自动回复，由你在话题里处理
    } catch (e) {
      console.error("❗ 处理客户私聊失败：", e.response?.data || e.message);
    }

    return res.sendStatus(200);
  }

  // ========== 情况 2：客服后台群里的消息（论坛模式） ==========
  if (chatType === "group" || chatType === "supergroup") {
    // 忽略机器人自己的消息
    if (from.is_bot) {
      return res.sendStatus(200);
    }

    // 必须是话题里的消息
    const topicId = message.message_thread_id;
    if (!topicId) {
      return res.sendStatus(200);
    }

    const replyTo = message.reply_to_message;
    if (!replyTo || !replyTo.text) {
      // 不是“回复那条客户信息”的，就当普通聊天，忽略
      return res.sendStatus(200);
    }

    // 先尝试从内存映射找到客户
    let customerId = topicToCustomer.get(topicId);

    // 如果映射不存在（例如重启后丢失），尝试从被回复那条文字里解析客户ID
    if (!customerId) {
      customerId = extractCustomerId(replyTo.text);
      if (customerId) {
        customerToTopic.set(customerId, topicId);
        topicToCustomer.set(topicId, customerId);
      }
    }

    if (!customerId) {
      // 找不到对应客户ID，给客服群提示一下
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_ID,
        message_thread_id: topicId,
        text: "❗ 未找到这个话题对应的客户ID，可能是机器人重启后丢失映射。",
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
          message_thread_id: topicId,
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
          message_thread_id: topicId,
          text: `✅ 已回复给客户（ID: ${customerId}）：\n${text}`,
        });
      }
    } catch (e) {
      console.error("❗ 从话题回复客户失败：", e.response?.data || e.message);
      await axios.post(`${API}/sendMessage`, {
        chat_id: SUPPORT_CHAT_ID,
        message_thread_id: topicId,
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

