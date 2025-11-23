# -*- coding: utf-8 -*-
import telebot
import time

# ================== 你的配置 ==================
TOKEN    = '8148731949:AAGb6aXhFCFLLKA4ewt2kxs2qSlcB3b0kkQ'
GROUP_ID = -1002971903995
# =============================================

bot = telebot.TeleBot(TOKEN, parse_mode='HTML')

# 生成好看的名字
def get_name(user):
    name = user.first_name or ""
    if user.last_name:
        name += " " + user.last_name
    if user.username:
        name += f" @{user.username}"
    return name.strip() or "匿名用户"

# 1. 用户私聊机器人 → 转发到客服群对应话题
@bot.message_handler(func=lambda m: m.chat.type == 'private', content_types=telebot.util.content_type_media + ['text'])
def user_to_group(message):
    user_id = message.from_user.id
    name    = get_name(message.from_user)

    # 用用户自己的ID当话题ID（天然唯一）
    topic_id = user_id

    caption = f"<b>用户：</b>{name}\n<b>ID：</b><code>{user_id}</code>\n\n"
    if message.caption:
        caption += message.caption

    sent = bot.copy_message(
        chat_id=GROUP_ID,
        from_chat_id=message.chat.id,
        message_id=message.message_id,
        caption=caption,
        message_thread_id=topic_id
    )

    # 第一次自动改话题名字
    try:
        bot.set_forum_topic_name(GROUP_ID, topic_id, f" {name[:50]}")
    except:
        pass

# 2. 客服群话题回复 → 转发回用户私聊
@bot.message_handler(func=lambda m: m.is_topic_message and m.chat.id == GROUP_ID)
def group_to_user(message):
    if message.from_user.id == bot.get_me().id:
        return  # 防止自己回自己

    user_id = message.message_thread_id  # 我们就是用 user_id 当 topic_id

    try:
        bot.copy_message(user_id, GROUP_ID, message.message_id)
    except:
        bot.reply_to(message, "用户已拉黑机器人，消息送达失败")

# 3. 可选：/start 带一个静默呼叫按钮（点完什么都不回，只在群里提醒）
@bot.message_handler(commands=['start'])
def start(message):
    kb = telebot.types.InlineKeyboardMarkup()
    kb.add(telebot.types.InlineKeyboardButton("普通会员", callback_data="call"))
    bot.send_message(message.chat.id,
                     "欢迎！直接发消息给我即可联系客服\n"
                     "急需帮助点下方按钮 →",
                     reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "call")
def call_admin(call):
    user_id = call.from_user.id
    name    = get_name(call.from_user)
    bot.send_message(
        GROUP_ID,
        f"<b>有人点按钮呼叫管理员！</b>\n用户：{name}\nID：{user_id}",
        message_thread_id=user_id
    )
    # 彻底静默，什么都不回用户（连按钮动画都不转）
    # bot.answer_callback_query(call.id)

print("机器人已启动，所有用户自动分话题运行中……")
bot.infinity_polling(none_stop=True)
