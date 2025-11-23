const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

// 所有收到的消息都转发给你的客服管理员
const ADMIN_ID = process.env.ADMIN_ID; // 你的 Telegram ID

// 用户 → 管理员
bot.on('message', async (msg) => {
    if (msg.chat.id == ADMIN_ID) return;

    const userId = msg.chat.id;
    const text = msg.text;

    await bot.sendMessage(ADMIN_ID, `来自用户 ${userId}：\n${text}`);
});

// 管理员 → 用户（格式：用户ID 空格 消息）
bot.on('message', async (msg) => {
    if (msg.chat.id != ADMIN_ID) return;

    const text = msg.text;
    const parts = text.split(" ");
    
    if (parts.length < 2) {
        return bot.sendMessage(ADMIN_ID, "格式错误：\n用户ID 空格 回复内容");
    }

    const userId = parts[0];
    const replyText = parts.slice(1).join(" ");

    await bot.sendMessage(userId, replyText);
    await bot.sendMessage(ADMIN_ID, "已发送 ✔️");
});
