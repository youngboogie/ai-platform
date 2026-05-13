import { END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { Document } from '@langchain/core/documents';
import { PgVectorRetriever } from '../docs/pgvector.retriever';

type RouteType = 'rag' | 'direct' | 'tool';
type ToolName = 'none' | 'time' | 'math';

type RetrievalStats = {
  docCount: number;
  topRerankScore: number;
  avgTopRerankScore: number;
  topSimilarity: number;
};

export type RagGraphState = {
  question: string;
  userId: string;
  email: string;
  history: string;
  context?: string;
  docs?: Document[];
  route?: RouteType;
  routeReason?: string;
  toolName?: ToolName;
  toolInput?: string;
  toolResult?: string;
  retrievalStats?: RetrievalStats;
  answer?: string;
};

export function createRagGraph(params: {
  retriever: PgVectorRetriever;
  modelClient: ChatOpenAI;
  ragPrompt: PromptTemplate;
  directPrompt: PromptTemplate;
  toolPrompt: PromptTemplate;
}) {
  const { retriever, modelClient, ragPrompt, directPrompt, toolPrompt } =
    params;

  const graph = new StateGraph<RagGraphState>({
    channels: {
      question: null,
      userId: null,
      email: null,
      history: null,
      context: null,
      docs: null,
      route: null,
      routeReason: null,
      toolName: null,
      toolInput: null,
      toolResult: null,
      retrievalStats: null,
      answer: null,
    },
  });

  const parseEnvNumber = (name: string, fallback: number) => {
    const raw = process.env[name];
    if (!raw) {
      return fallback;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  const RAG_MIN_TOP_SCORE = parseEnvNumber('RAG_MIN_TOP_SCORE', 0.62);
  const RAG_MIN_AVG_TOP_SCORE = parseEnvNumber('RAG_MIN_AVG_TOP_SCORE', 0.5);
  const RAG_MIN_DOC_COUNT = Math.max(
    1,
    Math.floor(parseEnvNumber('RAG_MIN_DOC_COUNT', 2)),
  );

  const safeToNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const getModelText = (response: any) => {
    if (typeof response?.content === 'string') {
      return response.content;
    }

    if (Array.isArray(response?.content)) {
      return response.content.map((item: any) => item?.text ?? '').join('');
    }

    return '';
  };

  const getRetrievalStats = (docs: Document[]): RetrievalStats => {
    const rerankScores = docs
      .map((doc) => safeToNumber((doc.metadata as any)?.rerankScore, -1))
      .filter((score) => score >= 0);

    const topRerankScore =
      rerankScores.length > 0 ? Math.max(...rerankScores) : 0;

    const top2 = rerankScores
      .slice()
      .sort((a, b) => b - a)
      .slice(0, 2);

    const avgTopRerankScore =
      top2.length > 0
        ? top2.reduce((sum, current) => sum + current, 0) / top2.length
        : 0;

    const topSimilarity =
      docs.length > 0
        ? Math.max(
            ...docs.map((doc) =>
              safeToNumber((doc.metadata as any)?.similarity, 0),
            ),
          )
        : 0;

    return {
      docCount: docs.length,
      topRerankScore,
      avgTopRerankScore,
      topSimilarity,
    };
  };

  const findMathExpression = (question: string): string | null => {
    const candidates = question.match(/[0-9+\-*/().\s]{3,}/g) || [];
    const sorted = candidates.sort((a, b) => b.length - a.length);

    for (const raw of sorted) {
      const expr = raw.trim();
      if (!expr) {
        continue;
      }
      if (!/[0-9]/.test(expr) || !/[+\-*/]/.test(expr)) {
        continue;
      }
      if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
        continue;
      }
      return expr;
    }

    return null;
  };

  const detectToolIntent = (question: string) => {
    const q = question.trim();
    const lower = q.toLowerCase();

    const docBoundIntent =
      /(\u6587\u6863|\u8d44\u6599|\u6587\u4ef6|\u4e0a\u4f20|\u6839\u636e\u6587\u6863|\u57fa\u4e8e\u6587\u6863|pdf|docx|\u7b80\u5386|\u5408\u540c)/i.test(
        q,
      );
    if (docBoundIntent) {
      return { toolName: 'none' as ToolName, toolInput: '', reason: '' };
    }

    const timeIntent =
      /(\u73b0\u5728.*(\u51e0\u70b9|\u65f6\u95f4)|\u5f53\u524d\u65f6\u95f4|\u73b0\u5728\u65f6\u95f4|\u4eca\u5929\u51e0\u53f7|\u4eca\u5929\u65e5\u671f|\u73b0\u5728\u65e5\u671f|what time|current time|time now|what date|today'?s date)/i.test(
        q,
      );

    if (timeIntent) {
      return {
        toolName: 'time' as ToolName,
        toolInput: '',
        reason: 'Detected explicit date/time utility intent.',
      };
    }

    const hasCalcHint =
      /(\u8ba1\u7b97|\u7b97\u4e00\u4e0b|\u5e2e\u6211\u7b97|\u6c42\u503c|calculate|what is|evaluate|math)/i.test(
        q,
      );

    const expression = findMathExpression(lower);
    if (hasCalcHint || expression) {
      return {
        toolName: 'math' as ToolName,
        toolInput: expression || '',
        reason: 'Detected explicit math utility intent.',
      };
    }

    return { toolName: 'none' as ToolName, toolInput: '', reason: '' };
  };

  const runTool = (toolName: ToolName, toolInput: string) => {
    if (toolName === 'time') {
      const timezone = process.env.TOOL_TIMEZONE ?? 'Asia/Shanghai';
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      return `Current time in ${timezone}: ${formatter.format(now)}`;
    }

    if (toolName === 'math') {
      const expression = toolInput || '';
      if (!expression || !/^[0-9+\-*/().\s]+$/.test(expression)) {
        return 'Unable to extract a safe math expression from the question.';
      }

      try {
        // Guarded evaluation: allow only arithmetic symbols and numbers.
        const result = Function(
          `"use strict"; return (${expression.replace(/\s+/g, ' ')});`,
        )();

        if (!Number.isFinite(Number(result))) {
          return `Expression "${expression}" returned a non-finite result.`;
        }

        return `Expression: ${expression}\nResult: ${result}`;
      } catch (error: any) {
        return `Expression "${expression}" failed to evaluate: ${error?.message || 'unknown error'}.`;
      }
    }

    return 'No tool executed.';
  };

  graph.addNode('retrieve', async (state) => {
    const docs = await retriever.invoke(state.question);
    const retrievalStats = getRetrievalStats(docs);

    const context = docs
      .map(
        (doc, index) =>
          `[Chunk ${index + 1}] file: ${doc.metadata.fileName}\n${doc.pageContent}`,
      )
      .join('\n\n');

    return {
      docs,
      retrievalStats,
      context: context || 'No relevant document chunk retrieved.',
    };
  });

  graph.addNode('router', async (state) => {
    const stats = state.retrievalStats || {
      docCount: 0,
      topRerankScore: 0,
      avgTopRerankScore: 0,
      topSimilarity: 0,
    };

    const toolIntent = detectToolIntent(state.question);
    if (toolIntent.toolName !== 'none') {
      return {
        route: 'tool' as RouteType,
        toolName: toolIntent.toolName,
        toolInput: toolIntent.toolInput,
        routeReason: toolIntent.reason,
      };
    }

    const useRag =
      stats.docCount >= RAG_MIN_DOC_COUNT &&
      stats.topRerankScore >= RAG_MIN_TOP_SCORE &&
      stats.avgTopRerankScore >= RAG_MIN_AVG_TOP_SCORE;

    if (useRag) {
      return {
        route: 'rag' as RouteType,
        routeReason: `RAG confidence is high (top=${stats.topRerankScore.toFixed(
          3,
        )}, avgTop=${stats.avgTopRerankScore.toFixed(3)}, docCount=${stats.docCount}).`,
      };
    }

    return {
      route: 'direct' as RouteType,
      routeReason: `RAG confidence is low (top=${stats.topRerankScore.toFixed(
        3,
      )}, avgTop=${stats.avgTopRerankScore.toFixed(3)}, docCount=${stats.docCount}).`,
    };
  });

  graph.addNode('rag', async (state) => {
    const finalPrompt = await ragPrompt.format({
      userId: state.userId,
      email: state.email,
      history: state.history || 'No chat history.',
      context: state.context || 'No relevant document chunk retrieved.',
      question: state.question,
    });

    const response = await modelClient.invoke([
      {
        role: 'user',
        content: finalPrompt,
      },
    ]);

    return {
      answer: getModelText(response),
    };
  });

  graph.addNode('direct', async (state) => {
    const finalPrompt = await directPrompt.format({
      userId: state.userId,
      email: state.email,
      history: state.history || 'No chat history.',
      question: state.question,
      routeReason: state.routeReason || 'No route reason.',
    });

    const response = await modelClient.invoke([
      {
        role: 'user',
        content: finalPrompt,
      },
    ]);

    return {
      answer: getModelText(response),
      docs: [],
      context: 'Bypassed RAG due to low retrieval confidence.',
    };
  });

  graph.addNode('tool', async (state) => {
    const toolName = state.toolName || 'none';
    const toolInput = state.toolInput || '';
    const toolResult = runTool(toolName, toolInput);

    const finalPrompt = await toolPrompt.format({
      userId: state.userId,
      email: state.email,
      history: state.history || 'No chat history.',
      question: state.question,
      toolName,
      toolInput: toolInput || '(none)',
      toolResult,
      routeReason: state.routeReason || 'No route reason.',
    });

    const response = await modelClient.invoke([
      {
        role: 'user',
        content: finalPrompt,
      },
    ]);

    return {
      answer: getModelText(response),
      toolResult,
      docs: [],
      context: 'Tool path executed without RAG context.',
    };
  });

  const workflow = graph as any;

  workflow.addEdge(START, 'retrieve');
  workflow.addEdge('retrieve', 'router');
  workflow.addConditionalEdges(
    'router',
    (state: RagGraphState) => state.route || 'direct',
    {
      rag: 'rag',
      direct: 'direct',
      tool: 'tool',
    },
  );
  workflow.addEdge('rag', END);
  workflow.addEdge('direct', END);
  workflow.addEdge('tool', END);

  return workflow.compile();
}
