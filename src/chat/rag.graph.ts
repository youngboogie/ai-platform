import { END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { Document } from '@langchain/core/documents';
import { PgVectorRetriever } from '../docs/pgvector.retriever';

export type RagGraphState = {
  question: string;
  userId: string;
  email: string;
  history: string;
  needRag?: boolean;
  context?: string;
  docs?: Document[];
  answer?: string;
};

export function createRagGraph(params: {
  retriever: PgVectorRetriever;
  modelClient: ChatOpenAI;
  prompt: PromptTemplate;
}) {
  const { retriever, modelClient, prompt } = params;

  const graph = new StateGraph<RagGraphState>({
    channels: {
      question: null,
      userId: null,
      email: null,
      history: null,
      needRag: null,
      context: null,
      docs: null,
      answer: null,
    },
  });

  // ✅ 新增：判断是否需要走 RAG
  graph.addNode('decide', async (state) => {
    const q = state.question.toLowerCase();

    const ragKeywords = [
      'document',
      'file',
      'pdf',
      'according to',
      'based on',
      '文档',
      '文件',
      '资料',
      '根据',
      '上传',
      '这篇',
      '这个pdf',
    ];

    const needRag = ragKeywords.some((word) => q.includes(word));

    return {
      needRag,
    };
  });

  // ✅ RAG 路径：检索文档
  graph.addNode('retrieve', async (state) => {
    const docs = await retriever.invoke(state.question);

    const context = docs
      .map(
        (doc, index) =>
          `[Chunk ${index + 1}] 文件名: ${doc.metadata.fileName}\n${doc.pageContent}`,
      )
      .join('\n\n');

    return {
      docs,
      context: context || '当前没有检索到相关文档片段。',
    };
  });

  // ✅ 普通路径：不检索文档
  graph.addNode('direct', async () => {
    return {
      docs: [],
      context: '当前问题不需要检索文档，请直接基于常识回答。',
    };
  });

  // ✅ 生成回答
  graph.addNode('generate', async (state) => {
    const finalPrompt = await prompt.format({
      userId: state.userId,
      email: state.email,
      history: state.history || '暂无聊天历史。',
      context: state.context || '当前没有检索到相关文档片段。',
      question: state.question,
    });

    const response = await modelClient.invoke([
      {
        role: 'user',
        content: finalPrompt,
      },
    ]);

    const answer =
      typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content.map((item: any) => item.text ?? '').join('')
          : '';

    return {
      answer,
    };
  });

  // ✅ LangGraph 旧版本类型不太会识别自定义节点名，这里用 any 放开类型限制
  const workflow = graph as any;

  workflow.addEdge(START, 'decide');

  workflow.addConditionalEdges('decide', (state: RagGraphState) => {
    return state.needRag ? 'retrieve' : 'direct';
  });

  workflow.addEdge('retrieve', 'generate');
  workflow.addEdge('direct', 'generate');
  workflow.addEdge('generate', END);

  return workflow.compile();
}
