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
            rerankScore: chunk.rerankScore,
          },
        }),
    );
  }
}
//这段代码是我实现的一个自定义 Retriever，用来把我自己的检索逻辑接入 LangChain。

//我继承了 BaseRetriever,并实现了 _getRelevantDocuments 方法，这个方法的输入是用户 query,输出是一个 Document 数组。

//在内部，我调用了自己的 hybridSearch 方法，完成向量检索 + 关键词检索 + rerank，然后拿到 topK 个最相关的 chunk。

//接着我把这些 chunk 转换成 LangChain 的 Document 格式，其中 pageContent 是文本内容，metadata 包含 fileName、similarity 等信息。

//这样做的好处是实现了解耦，上层链路只依赖 Retriever 接口，而不关心底层是怎么检索的，后续我可以很方便地替换成其他向量数据库或检索策略。
