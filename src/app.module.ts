import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { DocsModule } from './docs/docs.module';
import { AiModule } from './ai/ai.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [AuthModule, UsersModule, ChatModule, DocsModule, AiModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
