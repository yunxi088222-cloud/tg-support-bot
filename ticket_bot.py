import os
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

# 读取 Railway 环境变量（你刚设置的那两个）
TOKEN = os.getenv("BOT_TOKEN")
GROUP_ID = int(os.getenv("SUPPORT_CHAT_ID"))

if not TOKEN or not GROUP_ID:
    raise ValueError("【严重错误】请在 Railway Variables 里正确设置 BOT_TOKEN 和 SUPPORT_CHAT_ID！")

async def private_to_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    if msg.chat.type != "private":
        return

    user = msg.from_user
    name = user.full_name or "匿名用户"
    if user.username:
        name += f" @{user.username}"

    caption = f"<b>{name}</b>\nID: <code>{user.id}</code>\n\n"
    if msg.caption:
        caption += msg.caption

    await msg.copy(
        chat_id=GROUP_ID,
        caption=caption,
        message_thread_id=user.id,
        parse_mode="HTML"
    )

    # 自动创建/重命名话题
    try:
        await context.bot.create_forum_topic(chat_id=GROUP_ID, name=name[:50])
    except:
        pass

async def group_to_private(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    if not msg.is_topic_message or msg.chat.id != GROUP_ID:
        return
    if msg.from_user.id == (await context.bot.get_me()).id:
        return

    await msg.copy(chat_id=msg.message_thread_id)

async def main():
    app = Application.builder().token(TOKEN).build()

    app.add_handler(MessageHandler(filters.ChatType.PRIVATE, private_to_group))
    app.add_handler(MessageHandler(filters.ALL & filters.Chat(GROUP_ID), group_to_private))

    print("【客服机器人已启动】一人一话题系统已就绪！正在监听...")
    await app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
