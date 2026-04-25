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
      context: null,
      docs: null,
      answer: null,
    },
  });

  // Always retrieve first so doc-grounded QA is consistently triggered.
  graph.addNode('retrieve', async (state) => {
    const docs = await retriever.invoke(state.question);

    const context = docs
      .map(
        (doc, index) =>
          `[Chunk ${index + 1}] file: ${doc.metadata.fileName}\n${doc.pageContent}`,
      )
      .join('\n\n');

    return {
      docs,
      context: context || 'No relevant document chunk retrieved.',
    };
  });

  graph.addNode('generate', async (state) => {
    const finalPrompt = await prompt.format({
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

  const workflow = graph as any;

  workflow.addEdge(START, 'retrieve');
  workflow.addEdge('retrieve', 'generate');
  workflow.addEdge('generate', END);

  return workflow.compile();
}
