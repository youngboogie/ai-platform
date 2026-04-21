import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// PrismaService = PrismaClient 的一个 NestJS 版本封装
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // NestJS 启动时自动执行
  async onModuleInit() {
    await this.$connect(); // 连接数据库
  }

  // NestJS 程序关闭时执行
  async onModuleDestroy() {
    await this.$disconnect(); // 断开数据库
  }
}
