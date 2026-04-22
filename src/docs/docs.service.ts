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
import axios from 'axios';

@Injectable()
export class DocsService {
  constructor(private prisma: PrismaService) {}

  async getEmbedding(text: string) {
    const embeddingUrl =
      process.env.EMBEDDING_ENDPOINT ??
      'https://api.siliconflow.cn/v1/embeddings';
    const embeddingModel =
      process.env.EMBEDDING_MODEL ?? 'BAAI/bge-large-zh-v1.5';
    const embeddingApiKey = process.env.EMBEDDING_API_KEY;

    if (!embeddingApiKey) {
      throw new InternalServerErrorException('EMBEDDING_API_KEY is not configured');
    }

    try {
      const response = await axios.post(
        embeddingUrl,
        {
          model: embeddingModel,
          input: text,
        },
        {
          headers: {
            Authorization: `Bearer ${embeddingApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data?.data?.[0]?.embedding ?? null;
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

      await this.prisma.documentChunk.create({
        data: {
          documentId: doc.id,
          content: chunk.pageContent,
          embedding,
        },
      });
    }
    return doc;
  }

  async getUserDocuments(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
