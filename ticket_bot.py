from telegram import Update
from telegram.ext import Application, ContextTypes, MessageHandler, filters
import os

# 直接用环境变量更安全（Railway 推荐做法）
TOKEN = os.getenv("TOKEN", "8148731949:AAHBcTPPeJ89kmUbn_PJqGIgs96XyOulzS0")  # 你测通的那个
GROUP_ID = int(os.getenv("GROUP_ID", "-1002971903995"))  # 改成你真实群ID

def get_name(user):
    name = user.first_name or ""
    if user.last_name:
        name += " " + user.last_name
    if user.username:
        name += f" @{user.username}"
    return name.strip() or "匿名用户"

async def user_to_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    m = update.message
    if m.chat.type != "private":
        return
    user_id = m.from_user.id
    name = get_name(m.from_user)
    topic_id = user_id
    caption = f"用户: <b>{name}</b>\nID: <code>{user_id}</code>\n\n"
    if m.caption:
        caption += m.caption

    await m.copy(
        chat_id=GROUP_ID,
        caption=caption,
        message_thread_id=topic_id,
        parse_mode="HTML"
    )
    try:
        await context.bot.set_forum_topic_name(GROUP_ID, topic_id, name[:50])
    except:
        pass

async def group_to_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    m = update.message
    if not m.is_topic_message or m.chat.id != GROUP_ID:
        return
    if m.from_user.id == (await context.bot.get_me()).id:
        return
    user_id = m.message_thread_id
    try:
        await m.copy(chat_id=user_id)
    except:
        pass

async def main():
    app = Application.builder().token(TOKEN).build()

    app.add_handler(MessageHandler(filters.ChatType.PRIVATE, user_to_group))
    app.add_handler(MessageHandler(filters.ChatType.GROUPS & filters.Chat(GROUP_ID), group_to_user))

    print("===== 机器人已启动，活得像条狗 =====")
    await app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
