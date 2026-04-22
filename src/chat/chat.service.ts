import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma.service';

type JwtUser = {
  sub: string;
  email: string;
};

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createSession(userId: string) {
    return this.prisma.session.create({
      data: {
        title: 'New Chat',
        user: {
          connect: { id: userId },
        },
      },
    });
  }

  async getUserSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSessionMessages(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(message: string, user: JwtUser, sessionId: string) {
    const apiUrl =
      process.env.OPENAI_API_ENDPOINT ?? 'https://api.openai.com/v1';
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
      const session = await this.prisma.session.findFirst({
        where: {
          id: sessionId,
          userId: user.sub,
        },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      await this.prisma.message.create({
        data: {
          sessionId,
          role: 'user',
          content: message,
        },
      });

      const history = await this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });

      const historyMessages = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // ====== 这里是我新加的：取当前用户上传的文档内容 ======
      const userDocs = await this.prisma.document.findMany({
        where: { userId: user.sub },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });

      const context = userDocs
        .map(
          (doc) => `Document: 
      ${doc.fileName}\n${doc.content ?? ''}`,
        )
        .join('\n\n');
      // ====== 新加结束 ======

      const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          messages: [
            // ====== 这里也改了：system prompt 里加了文档上下文 ======
            {
              role: 'system',
              content:
                '你是一个有帮助的 AI 助手。请优先根据用户上传的文档内容回答问题。如果文档中没有相关信息，再基于常识补充，并明确告诉用户这是补充信息。',
            },
            {
              role: 'system',
              content: `当前用户ID：${user.sub}, 邮箱：${user.email}`,
            },
            {
              role: 'system',
              content: `以下是用户上传的文档内容：\n${context || '当前没有可用文档。'}`,
            },
            ...historyMessages,
            // ====== 改动结束 ======
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

      await this.prisma.message.create({
        data: {
          sessionId,
          role: 'assistant',
          content: reply,
        },
      });

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
