# main.py  ← Replit 默认文件名
import telebot
import time

TOKEN = '8148731949:AAGb6aXhFCFLLKA4ewt2kxs2qSlcB3b0kkQ'
GROUP_ID = -1002971903995

bot = telebot.TeleBot(TOKEN, parse_mode='HTML')

def get_name(user):
    name = user.first_name or ""
    if user.last_name: name += " " + user.last_name
    if user.username: name += f" @{user.username}"
    return name.strip() or "匿名用户"

@bot.message_handler(func=lambda m: m.chat.type == 'private')
def user_to_group(m):
    user_id = m.from_user.id
    name = get_name(m.from_user)
    topic_id = user_id
    caption = f"<b>用户：</b>{name}\n<b>ID：</b><code>{user_id}</code>\n\n"
    if m.caption: caption += m.caption
    bot.copy_message(GROUP_ID, m.chat.id, m.message_id, caption=caption, message_thread_id=topic_id)
    try:
        bot.set_forum_topic_name(GROUP_ID, topic_id, f"👤 {name[:50]}")
    except:
        pass

@bot.message_handler(func=lambda m: m.is_topic_message and m.chat.id == GROUP_ID)
def group_to_user(m):
    if m.from_user.id == bot.get_me().id: return
    user_id = m.message_thread_id
    try:
        bot.copy_message(user_id, GROUP_ID, m.message_id)
    except:
        bot.reply_to(m, "❌ 用户已拉黑机器人，无法送达")

@bot.message_handler(commands=['start'])
def start(m):
    kb = telebot.types.InlineKeyboardMarkup()
    kb.add(telebot.types.InlineKeyboardButton("普通会员", callback_data="call"))
    bot.send_message(m.chat.id, "欢迎！直接发消息联系客服\n急需帮助点下方按钮 →", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "call")
def call_admin(c):
    name = get_name(c.from_user)
    bot.send_message(GROUP_ID, f"<b>🚨 有人呼叫管理员！</b>\n用户：{name}\nID：{c.from_user.id}", message_thread_id=c.from_user.id)

print("机器人启动成功！所有用户自动分话题运行中...")
bot.infinity_polling()
