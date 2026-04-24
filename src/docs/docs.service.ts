import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import * as fs from 'fs/promises';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { randomUUID } from 'crypto';

@Injectable()
export class DocsService {
  constructor(private prisma: PrismaService) {}

  private embeddings = new OpenAIEmbeddings({
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    apiKey: process.env.EMBEDDING_API_KEY,
    configuration: {
      baseURL: process.env.EMBEDDING_ENDPOINT ?? 'https://api.openai.com/v1',
    },
  });

  async getEmbedding(text: string) {
    if (!process.env.EMBEDDING_API_KEY) {
      throw new InternalServerErrorException(
        'EMBEDDING_API_KEY is not configured',
      );
    }

    try {
      return await this.embeddings.embedQuery(text);
    } catch (error: any) {
      console.error('Embedding error:', error?.response?.data || error.message);
      throw new InternalServerErrorException({
        message: 'Embedding request failed',
        upstream: error?.response?.data || error.message,
      });
    }
  }

  async uploadDocument(userId: string, file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const filePath = file.path;
    const fileName = file.originalname.toLowerCase();

    let docs;

    if (fileName.endsWith('.pdf')) {
      const loader = new PDFLoader(filePath);
      docs = await loader.load();
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      const text = await fs.readFile(filePath, 'utf-8');
      docs = [
        {
          pageContent: text,
          metadata: { source: filePath },
        },
      ];
    } else if (fileName.endsWith('.csv')) {
      const loader = new CSVLoader(filePath);
      docs = await loader.load();
    } else if (fileName.endsWith('.docx')) {
      const loader = new DocxLoader(filePath);
      docs = await loader.load();
    } else {
      throw new BadRequestException('Unsupported file type');
    }

    const content = docs.map((d: any) => d.pageContent).join('\n\n');

    const doc = await this.prisma.document.create({
      data: {
        userId,
        fileName: file.originalname,
        filePath,
        mimeType: file.mimetype,
        content,
      },
    });

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });

    const splitDocs = await splitter.splitDocuments(docs);

    for (const chunk of splitDocs) {
      const embedding = await this.getEmbedding(chunk.pageContent);
      const vector = `[${embedding.join(',')}]`;

      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding")
        VALUES ($1, $2, $3, $4::vector)
        `,
        randomUUID(),
        doc.id,
        chunk.pageContent,
        vector,
      );
    }

    return doc;
  }

  async getUserDocuments(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            chunks: true,
          },
        },
      },
    });
  }

  async deleteDocument(userId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        userId,
      },
    });

    if (!doc) {
      throw new BadRequestException('Document not found');
    }

    await this.prisma.document.delete({
      where: {
        id: documentId,
      },
    });

    return { message: 'Document deleted successfully' };
  }

  // ✅ 纯向量检索：pgvector 根据语义相似度找 chunk
  async searchRelevantChunks(userId: string, query: string, topK = 5) {
    const queryEmbedding = await this.getEmbedding(query);
    const vector = `[${queryEmbedding.join(',')}]`;

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT 
        dc."id",
        dc."documentId",
        dc."content",
        dc."createdAt",
        d."fileName",
        1 - (dc."embedding" <=> $1::vector) AS similarity,
        'vector' AS "searchType"
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d."id" = dc."documentId"
      WHERE d."userId" = $2
      ORDER BY dc."embedding" <=> $1::vector
      LIMIT $3
      `,
      vector,
      userId,
      topK,
    );

    return rows;
  }

  // ✅ 新增：关键词检索，用 ILIKE 做简单 keyword search
  async keywordSearchChunks(userId: string, query: string, topK = 5) {
    const keywords = query
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      return [];
    }

    const keywordConditions = keywords
      .map((_, index) => `dc."content" ILIKE $${index + 2}`)
      .join(' OR ');

    const params = [userId, ...keywords.map((word) => `%${word}%`), topK];

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        dc."id",
        dc."documentId",
        dc."content",
        dc."createdAt",
        d."fileName",
        0.5 AS similarity,
        'keyword' AS "searchType"
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d."id" = dc."documentId"
      WHERE d."userId" = $1
        AND (${keywordConditions})
      LIMIT $${params.length}
      `,
      ...params,
    );

    return rows;
  }

  // ✅ 新增：Hybrid Search = 向量检索 + 关键词检索 + 去重合并
  async hybridSearchRelevantChunks(userId: string, query: string, topK = 5) {
    const vectorResults = await this.searchRelevantChunks(userId, query, topK);
    const keywordResults = await this.keywordSearchChunks(userId, query, topK);

    const mergedMap = new Map<string, any>();

    for (const item of vectorResults) {
      mergedMap.set(item.id, {
        ...item,
        hybridScore: Number(item.similarity ?? 0),
      });
    }

    for (const item of keywordResults) {
      const existing = mergedMap.get(item.id);

      if (existing) {
        mergedMap.set(item.id, {
          ...existing,
          searchType: 'hybrid',
          hybridScore: Number(existing.hybridScore ?? 0) + 0.2,
        });
      } else {
        mergedMap.set(item.id, {
          ...item,
          hybridScore: 0.5,
        });
      }
    }
    // === 新增：简单 Rerank 打分函数 ===
    const scoreWithRerank = (item: any, query: string) => {
      const text = (item.content || '').toLowerCase();
      const q = query.toLowerCase();

      // 1) 向量分数（已有）
      const vectorScore = Number(item.similarity ?? 0);

      // 2) 关键词覆盖：命中越多越高
      const keywords = q.split(/\s+/).filter(Boolean);
      let hit = 0;
      for (const k of keywords) {
        if (text.includes(k)) hit += 1;
      }
      const keywordScore = keywords.length > 0 ? hit / keywords.length : 0;

      // 3) 组合（可调权重）
      // 向量更重要（0.7），关键词辅助（0.3）
      const rerankScore = 0.7 * vectorScore + 0.3 * keywordScore;

      return rerankScore;
    };

    // === 用 rerankScore 重新排序 ===
    const merged = Array.from(mergedMap.values()).map((item) => ({
      ...item,
      rerankScore: scoreWithRerank(item, query),
    }));

    return merged
      .sort((a, b) => Number(b.rerankScore) - Number(a.rerankScore))
      .slice(0, topK);
  }
}
