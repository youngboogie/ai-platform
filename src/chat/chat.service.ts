import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma.service';
import { DocsService } from '../docs/docs.service';

type JwtUser = {
  sub: string;
  email: string;
};

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private docsService: DocsService,
  ) {}

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

      const relevantChunks = await this.docsService.searchRelevantChunks(
        user.sub,
        message,
        5,
      );

      const hasRelevantChunks = relevantChunks.length > 10;

      const context = relevantChunks
        .map(
          (chunk, index) =>
            `[Chunk ${index + 1}] 文件名: ${chunk.document.fileName}\n${chunk.content}`,
        )
        .join('\n\n');

      const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          messages: hasRelevantChunks
            ? [
                {
                  role: 'system',
                  content:
                    '你是一个有帮助的 AI 助手。请优先根据检索到的文档片段回答问题，并用自然语言总结，而不是机械复述。如果文档不足以回答，请说明“根据当前检索到的文档内容，暂时无法确定”。',
                },
                {
                  role: 'system',
                  content: `当前用户ID：${user.sub}, 邮箱：${user.email}`,
                },
                {
                  role: 'system',
                  content: `以下是检索到的相关文档片段：\n${context || '当前没有检索到相关文档片段。'}`,
                },
                ...historyMessages,
              ]
            : [
                {
                  role: 'system',
                  content: hasRelevantChunks
                    ? '你是一个有帮助的 AI 助手。当前用户虽然上传过文档，但这次没有检索到足够相关的文档片段，请不要假装引用文档内容，直接基于常识正常回答，并明确说明这次回答没有依赖到相关文档。'
                    : '你是一个有帮助的 AI 助手，请直接正常回答用户问题。',
                },
                {
                  role: 'system',
                  content: `当前用户ID：${user.sub}, 邮箱：${user.email}`,
                },
                ...historyMessages,
              ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
      console.log('LLM FULL RESPONSE:', JSON.stringify(response.data, null, 2));

      console.log(relevantChunks);

      const reply = response.data?.choices?.[0]?.message?.content ?? '';

      await this.prisma.message.create({
        data: {
          sessionId,
          role: 'assistant',
          content: reply,
          metadata: {
            sources: relevantChunks.map((chunk) => ({
              chunkId: chunk.id,
              fileName: chunk.document.fileName,
              content: chunk.content,
            })),
          },
        },
      });

      return {
        userId: user.sub,
        yourMessage: message,
        reply,
        sources: relevantChunks.map((chunk) => ({
          chunkId: chunk.id,
          fileName: chunk.document.fileName,
        })),
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
