import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

type JwtUser = {
  sub: string;
  email: string;
};

@Injectable()
export class ChatService {
  async sendMessage(message: string, user: JwtUser) {
    const apiUrl = process.env.OPENAI_API_ENDPOINT ?? 'https://api.openai.com/v1';
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    if (!apiKey) {
      return {
        userId: user.sub,
        yourMessage: message,
        reply: 'AI 模拟回复：还没有配置 OPENAI_API_KEY。',
      };
    }

    try {
      const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: '你是一个有帮助的 AI 助手。' },
            { role: 'system', content: `当前用户ID：${user.sub}，邮箱：${user.email}` },
            { role: 'user', content: message },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const reply = response.data?.choices?.[0]?.message?.content ?? '';

      return {
        userId: user.sub,
        yourMessage: message,
        reply,
      };
    } catch (error: any) {
      console.error('上游错误：', error?.response?.data || error.message);

      throw new InternalServerErrorException({
        message: '聊天上游请求失败',
        upstream: error?.response?.data || error.message,
      });
    }
  }
}
