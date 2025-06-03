require('dotenv').config();
const axios = require('axios');
const express = require('express');
const { App, ExpressReceiver } = require('@slack/bolt');

// 🧩 ExpressReceiver を使って Bolt アプリを作成
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events' 
});

receiver.app.use((req, res, next) => {
  console.log('📩 [Slack] Request received:', req.method, req.url);
  next();
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

// 🔐 URL検証用エンドポイント（Slackから最初に送られる）
receiver.app.post('/slack/events', express.json(), (req, res) => {
  if (req.body.type === 'url_verification') {
    console.log('🔑 URL verification challenge received');
    return res.status(200).send(req.body.challenge);
  }
});

// 🧠 グローバル会話履歴（スレッド単位）
const conversationHistory = {};

// 📅 日付フォーマット関数
function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return `${year}年${month}月${day}日`;
}

// 🗣 メンション受信時の処理
app.event('app_mention', async ({ event, say }) => {
  console.log('✅ メンション受信！');
  console.log('👂 内容:', event.text);

  const threadTs = event.thread_ts || event.ts;
  const userMessage = event.text.replace(/<@[^>]+>\s*/, '');

  // 履歴初期化
  if (!conversationHistory[threadTs]) {
    const currentDate = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    conversationHistory[threadTs] = [
      {
        role: 'system',
        content: `あなたはSlack上で動く丁寧で親しみやすいアシスタントです。ユーザーの質問に優しく簡潔に答えてください。\n今日は${currentDate}です。季節や時期にあった回答を心がけてください。`
      }
    ];
  }

  // 履歴にユーザーメッセージ追加
  conversationHistory[threadTs].push({
    role: 'user',
    content: userMessage
  });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: conversationHistory[threadTs]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiReply = response.data.choices[0].message.content;

    // AIの返答も履歴に追加
    conversationHistory[threadTs].push({
      role: 'assistant',
      content: aiReply
    });

    await say({ text: aiReply, thread_ts: threadTs });
    console.log('📤 ChatGPTからの返答を送信！');

  } catch (error) {
    const statusCode = error?.response?.status;
    const message = error?.response?.data?.error?.message || error.message;
    console.error('🛑 OpenAI API エラー:', message);

    let friendlyError = 'ごめんなさい、エラーが発生しました🙏';
    if (statusCode === 429) {
      friendlyError += '\n🔹 利用回数の上限を超えた可能性があります。しばらくしてから再度お試しください。';
    } else if (statusCode === 401) {
      friendlyError += '\n🔹 認証情報に問題があるようです。設定を確認してください。';
    } else {
      friendlyError += `\n🔹 詳細: ${message}`;
    }

    await say({ text: friendlyError, thread_ts: threadTs });
  }
});

// 🚀 アプリ起動
(async () => {
  const port = process.env.PORT || 10000;
  await app.start(port);
  console.log(`⚡️ Running on port ${port}`);
})();