require('dotenv').config();
const axios = require('axios');
const { App } = require('@slack/bolt');

// Boltアプリ初期化（ExpressReceiver不要）
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// メンション時の返信（スレッド対応）
app.event('app_mention', async ({ event, say }) => {
  console.log('✅ メンション受信！');
  console.log('👂 内容:', event.text);

  const userMessage = event.text.replace(/<@[^>]+>\s*/, '');

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'あなたはSlack上で動く丁寧で親しみやすいアシスタントです。ユーザーの質問に優しく簡潔に答えてください。'
          },
          {
            role: 'user',
            content: userMessage
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiReply = response.data.choices[0].message.content;
    await say({ text: aiReply, thread_ts: event.ts });
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

    await say({ text: friendlyError, thread_ts: event.ts });
  }
});

// アプリ起動
(async () => {
  const port = process.env.PORT || 10000;
  await app.start(port);
  console.log(`⚡️ Running on port ${port}`);
})();