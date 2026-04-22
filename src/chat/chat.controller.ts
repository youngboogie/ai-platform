import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  Get,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

type JwtUser = {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
};

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}
  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  createSession(@Req() req) {
    return this.chatService.createSession(req.user.sub);
  }
  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Body() body: { message: string; sessionId: string }, // 👈 多加这个
    @Req() req: { user: JwtUser },
  ) {
    return this.chatService.sendMessage(
      body.message,
      req.user,
      body.sessionId, // 👈 传进去
    );
  }
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  getSessions(@Req() req: { user: JwtUser }) {
    return this.chatService.getUserSessions(req.user.sub);
  }

  @Get('sessions/:id/messages')
  @UseGuards(JwtAuthGuard)
  getMessages(@Req() req: { user: JwtUser }, @Param('id') id: string) {
    return this.chatService.getSessionMessages(req.user.sub, id);
  }
}
