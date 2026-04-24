import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DocsService } from '../docs/docs.service';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { PgVectorRetriever } from '../docs/pgvector.retriever';
import { RunnableSequence } from '@langchain/core/runnables';
import { Document } from '@langchain/core/documents';
import { createRagGraph } from './rag.graph';
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
    const model = process.env.MODEL_NAME ?? 'gpt-3.5-turbo';

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

      const recentHistory = await this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });

      const history = recentHistory.reverse();

      const historyMessages = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const formattedHistory = historyMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const modelClient = new ChatOpenAI({
        model,
        temperature: 0,
        apiKey,
        configuration: {
          baseURL: apiUrl,
        },
      });

      const retriever = new PgVectorRetriever(this.docsService, user.sub, 5);

      let retrievedDocs: Document[] = [];

      const prompt = new PromptTemplate({
        template: `
你是一个有帮助的 AI 助手。

当前用户信息：
- 用户ID：{userId}
- 邮箱：{email}

聊天历史：
{history}

检索到的文档内容：
{context}

请回答用户问题：
{question}

回答要求：
1. 如果检索到了文档内容，请优先基于文档回答。
2. 不要机械复制文档，要用自然语言总结。
3. 如果文档内容不足以回答，请说：“根据当前检索到的文档内容，暂时无法确定。”
4. 如果没有检索到文档内容，请直接基于常识回答，并说明“这次回答没有依赖到相关文档”。
`,
        inputVariables: ['userId', 'email', 'history', 'context', 'question'],
      });

      const ragGraph = createRagGraph({
        retriever,
        modelClient,
        prompt,
      });

      const graphResult = await ragGraph.invoke({
        question: message,
        userId: user.sub,
        email: user.email,
        history: formattedHistory || '暂无聊天历史。',
      });

      console.log('RAG GRAPH RESULT:', graphResult);

      retrievedDocs = graphResult.docs ?? [];

      const reply = graphResult.answer ?? '';
      //     const reply =
      // typeof response.content === 'string'
      //   ? response.content
      //   : Array.isArray(response.content)
      //     ? response.content.map((item: any) => item.text ?? '').join('')
      //     : '';

      await this.prisma.message.create({
        data: {
          sessionId,
          role: 'assistant',
          content: reply,
          metadata: {
            sources: retrievedDocs.map((doc) => ({
              chunkId: doc.metadata.chunkId,
              fileName: doc.metadata.fileName,
              similarity: doc.metadata.similarity,
              searchType: doc.metadata.searchType,
              hybridScore: doc.metadata.hybridScore,
              content: doc.pageContent,
            })),
          },
        },
      });

      return {
        userId: user.sub,
        yourMessage: message,
        reply,
        sources: retrievedDocs.map((doc) => ({
          chunkId: doc.metadata.chunkId,
          fileName: doc.metadata.fileName,
          similarity: doc.metadata.similarity,
          searchType: doc.metadata.searchType,
          hybridScore: doc.metadata.hybridScore,
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
