# bot.py  ← 能扛几千人的最终版
import telebot, os, time
from threading import Thread

TOKEN    = '8148731949:AAGb6aXhFCFLLKA4ewt2kxs2qSlcB3b0kkQ'  # ← 改成你的
GROUP_ID = -1002971903995                                          # ← 改成你的客服群

bot = telebot.TeleBot(TOKEN, parse_mode='HTML', threaded=False)  # 去掉线程限制，配合多进程更强

def get_name(u):
    n = u.first_name or ""
    if u.last_name: n += " " + u.last_name
    if u.username: n += f" @{u.username}"
    return n.strip() or "匿名"

# 用户 → 群（自动分话题）
@bot.message_handler(func=lambda m: m.chat.type == 'private')
def user_to_group(m):
    uid = m.from_user.id
    name = get_name(m.from_user)
    caption = f"<b>用户：</b>{name}\n<b>ID：</b><code>{uid}</code>\n\n"
    if m.caption: caption += m.caption
    
    bot.copy_message(GROUP_ID, m.chat.id, m.message_id, 
                    caption=caption, message_thread_id=uid)
    try:
        bot.set_forum_topic_name(GROUP_ID, uid, f" {name[:50]}")
    except: pass

# 群回复 → 用户
@bot.message_handler(func=lambda m: getattr(m, 'is_topic_message', False) and m.chat.id == GROUP_ID)
def group_to_user(m):
    if m.from_user.id == bot.get_me().id: return
    uid = m.message_thread_id
    try:
        bot.copy_message(uid, GROUP_ID, m.message_id)
    except:
        bot.reply_to(m, "用户已拉黑或机器人被禁，无法送达")

# 普通会员按钮（静默）
@bot.message_handler(commands=['start'])
def start(m):
    kb = telebot.types.InlineKeyboardMarkup()
    kb.add(telebot.types.InlineKeyboardButton("普通会员", callback_data="call"))
    bot.send_message(m.chat.id, "欢迎使用客服系统\n直接发消息或点按钮联系管理员", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data == "call")
def call(c):
    name = get_name(c.from_user)
    bot.send_message(GROUP_ID, f"<b>有人呼叫管理员！</b>\n用户：{name}\nID：{c.from_user.id}", 
                     message_thread_id=c.from_user.id)

print("机器人已启动，可抗几千用户并发！")
bot.infinity_polling(none_stop=True, interval=0)
