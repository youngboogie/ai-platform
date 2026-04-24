import { BaseRetriever } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { DocsService } from './docs.service';

export class PgVectorRetriever extends BaseRetriever {
  lc_namespace = ['custom', 'pgvector-retriever'];

  constructor(
    private readonly docsService: DocsService,
    private readonly userId: string,
    private readonly topK = 5,
  ) {
    super();
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const chunks = await this.docsService.hybridSearchRelevantChunks(
      this.userId,
      query,
      this.topK,
    );

    return chunks.map(
      (chunk) =>
        new Document({
          pageContent: chunk.content,
          metadata: {
            chunkId: chunk.id,
            fileName: chunk.fileName,
            similarity: chunk.similarity,
            searchType: chunk.searchType,
            hybridScore: chunk.hybridScore,
          },
        }),
    );
  }
}
