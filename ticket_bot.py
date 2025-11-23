import os
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

# 优先用环境变量，不行再用默认（你先加环境变量更安全）
TOKEN = os.getenv("8148731949:AAHBcTPPeJ89kmUbn_PJqGIgs96XyOulzS0", "这里放你测通的那个token")
GROUP_ID = int(os.getenv("GROUP_ID", "-1002971903995"))  # 改成你真实群ID

def get_name(user):
    name = user.full_name or "匿名用户"
    if user.username:
        name += f" @{user.username}"
    return name[:50]

async def private_to_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    if msg.chat.type != "private":
        return
    user = msg.from_user
    topic_id = user.id
    caption = f"<b>{get_name(user)}</b>\nID: <code>{user.id}</code>\n\n"
    if msg.caption:
        caption += msg.caption

    await msg.copy(
        chat_id=GROUP_ID,
        caption=caption,
        message_thread_id=topic_id,
        parse_mode="HTML"
    )
    try:
        await context.bot.create_forum_topic(chat_id=GROUP_ID, name=get_name(user))  # 自动建话题
    except:
        pass

async def group_to_private(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    if not msg.is_topic_message or msg.chat.id != GROUP_ID:
        return
    if msg.from_user.id == (await context.bot.get_me()).id:
        return
    user_id = msg.message_thread_id
    try:
        await msg.copy(chat_id=user_id)
    except:
        pass

async def main():
    app = Application.builders().token(TOKEN).build()
    app.add_handler(MessageHandler(filters.ChatType.PRIVATE, private_to_group))
    app.add_handler(MessageHandler(filters.Chat(GROUP_ID), group_to_private))
    
    print("【机器人已启动】一人一话题客服系统已就绪！")
    await app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
