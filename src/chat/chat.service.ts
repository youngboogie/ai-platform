import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DocsService } from '../docs/docs.service';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { PgVectorRetriever } from '../docs/pgvector.retriever';
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

  async deleteSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    await this.prisma.$transaction([
      this.prisma.message.deleteMany({
        where: { sessionId },
      }),
      this.prisma.session.delete({
        where: { id: sessionId },
      }),
    ]);

    return { message: 'Session deleted successfully' };
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

      const ragPrompt = new PromptTemplate({
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
      const directPrompt = new PromptTemplate({
        template: `
你是一个有帮助的 AI 助手。

当前用户信息：
- 用户ID：{userId}
- 邮箱：{email}

聊天历史：
{history}

问题：
{question}

路由原因：
{routeReason}

回答要求：
1. 本轮不要依赖用户私有文档内容，直接基于通用知识回答。
2. 如果问题信息不足，先给出最稳妥答案，并提示用户补充条件。
3. 如果你无法可靠确定答案，要明确说明不确定点。
`,
        inputVariables: ['userId', 'email', 'history', 'question', 'routeReason'],
      });

      const toolPrompt = new PromptTemplate({
        template: `
你是一个有帮助的 AI 助手。

当前用户信息：
- 用户ID：{userId}
- 邮箱：{email}

聊天历史：
{history}

问题：
{question}

路由原因：
{routeReason}

工具执行结果：
- 工具名：{toolName}
- 工具输入：{toolInput}
- 工具输出：{toolResult}

回答要求：
1. 优先基于工具输出给出结论。
2. 用自然语言解释关键步骤，但不要编造工具未返回的数据。
3. 如果工具结果不足以完整回答，明确指出缺口。
`,
        inputVariables: [
          'userId',
          'email',
          'history',
          'question',
          'toolName',
          'toolInput',
          'toolResult',
          'routeReason',
        ],
      });

      const ragGraph = createRagGraph({
        retriever,
        modelClient,
        ragPrompt,
        directPrompt,
        toolPrompt,
      });

      const graphResult = await ragGraph.invoke({
        question: message,
        userId: user.sub,
        email: user.email,
        history: formattedHistory || '暂无聊天历史。',
      });

      console.log('RAG GRAPH RESULT:', graphResult);

      retrievedDocs = graphResult.docs ?? [];
      const route = graphResult.route ?? 'rag';
      const routeReason = graphResult.routeReason ?? '';
      const toolName = graphResult.toolName ?? 'none';
      const toolResult = graphResult.toolResult ?? '';
      const retrievalStats = graphResult.retrievalStats ?? null;

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
              rerankScore: doc.metadata.rerankScore,
              content: doc.pageContent,
            })),
            route,
            routeReason,
            toolName,
            toolResult,
            retrievalStats,
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
          rerankScore: doc.metadata.rerankScore,
        })),
        route,
        routeReason,
        toolName,
        toolResult,
        retrievalStats,
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
