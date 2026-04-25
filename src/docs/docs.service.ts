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
import { normalizeUploadedFileName } from './file-name.util';

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
    const normalizedOriginalName = normalizeUploadedFileName(file.originalname);
    const fileName = normalizedOriginalName.toLowerCase();

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
        fileName: normalizedOriginalName,
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
    const documents = await this.prisma.document.findMany({
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

    return documents.map((doc) => ({
      ...doc,
      fileName: normalizeUploadedFileName(doc.fileName),
    }));
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

  private extractSearchKeywords(query: string) {
    const normalized = query.toLowerCase().trim();
    if (!normalized) {
      return [];
    }

    const tokens: string[] = [];

    for (const token of normalized.split(/\s+/)) {
      if (token.length >= 2) {
        tokens.push(token);
      }
    }

    const latinTokens = normalized.match(/[a-z0-9]{2,}/g) || [];
    tokens.push(...latinTokens);

    const cjkSegments = normalized.match(/[\u3400-\u9fff]+/g) || [];
    for (const segment of cjkSegments) {
      if (segment.length >= 2) {
        tokens.push(segment);
      }

      const maxN = Math.min(4, segment.length);
      for (let n = 2; n <= maxN; n += 1) {
        for (let i = 0; i <= segment.length - n; i += 1) {
          tokens.push(segment.slice(i, i + n));
        }
      }
    }

    const deduped = Array.from(
      new Set(tokens.map((token) => token.trim()).filter(Boolean)),
    );

    return deduped.slice(0, 12);
  }

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

  async keywordSearchChunks(userId: string, query: string, topK = 5) {
    const keywords = this.extractSearchKeywords(query);
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

    const keywordTokens = this.extractSearchKeywords(query);

    const scoreWithRerank = (item: any) => {
      const text = String(item.content || '').toLowerCase();
      const vectorScore = Number(item.similarity ?? 0);

      let hit = 0;
      for (const token of keywordTokens) {
        if (text.includes(token)) {
          hit += 1;
        }
      }

      const keywordScore =
        keywordTokens.length > 0 ? hit / keywordTokens.length : 0;

      return 0.7 * vectorScore + 0.3 * keywordScore;
    };

    const merged = Array.from(mergedMap.values()).map((item) => ({
      ...item,
      rerankScore: scoreWithRerank(item),
    }));

    if (process.env.DEBUG_RAG === 'true') {
      const topPreview = merged
        .sort((a, b) => Number(b.rerankScore) - Number(a.rerankScore))
        .slice(0, Math.min(3, merged.length))
        .map((item) => ({
          fileName: item.fileName,
          searchType: item.searchType,
          similarity: item.similarity,
          rerankScore: item.rerankScore,
          preview: String(item.content || '').slice(0, 80),
        }));

      console.log('[RAG DEBUG] query:', query);
      console.log('[RAG DEBUG] keywordTokens:', keywordTokens);
      console.log('[RAG DEBUG] vectorCount:', vectorResults.length);
      console.log('[RAG DEBUG] keywordCount:', keywordResults.length);
      console.log('[RAG DEBUG] topChunks:', topPreview);
    }

    return merged
      .sort((a, b) => Number(b.rerankScore) - Number(a.rerankScore))
      .slice(0, topK);
  }
}
