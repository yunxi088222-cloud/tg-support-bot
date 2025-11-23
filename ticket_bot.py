# -*- coding: utf-8 -*-
import telegram
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

TOKEN = "8148731949:AAAb6xhfCFLtKA4emZJxxs2oS1zB3b0kkQ"
GROUP_ID = -1002971903995

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
    
    caption = f"👤用户: <b>{name}</b>\n🆔ID: <code>{user_id}</code>\n\n"
    if m.caption:
        caption += m.caption
    
    sent = await m.copy(
        chat_id=GROUP_ID,
        caption=caption,
        message_thread_id=topic_id,
        parse_mode="HTML"
    )
    try:
        await context.bot.set_forum_topic_name(
            GROUP_ID, topic_id, f"{name[:50]}"
        )
    except:
        pass

async def group_to_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    m = update.message
    if not m.is_topic_message or m.chat.id != GROUP_ID:
        return
    if m.from_user.id == context.bot.get_me().id:
        return
    
    user_id = m.message_thread_id
    try:
        await m.copy(chat_id=user_id)
    except:
        pass  # 用户可能没找机器人私聊过

def main():
    app = Application.builder().token(TOKEN).build()
    
    app.add_handler(MessageHandler(filters.ChatType.PRIVATE, user_to_group))
    app.add_handler(MessageHandler(
        filters.ChatType.GROUPS & filters.Chat(GROUP_ID) & filters.ALL, 
        group_to_user
    ))
    
    print("机器人启动成功，正在运行...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
