import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
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

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Body() body: { message: string },
    @Req() req: { user: JwtUser },
  ) {
    return this.chatService.sendMessage(body.message, req.user);
  }
}
