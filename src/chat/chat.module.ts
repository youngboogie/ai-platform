import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [ChatController],
  providers: [ChatService, PrismaService],
})
export class ChatModule {}
