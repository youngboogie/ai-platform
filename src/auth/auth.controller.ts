import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
@Controller('auth') // 路径前缀 /auth
export class AuthController {
  constructor(private authService: AuthService) {}

  // 注册接口
  @Post('register') // POST /auth/register
  register(@Body() dto: RegisterDto) {
    // dto 里面就是 { email, password }
    return this.authService.register(dto.email, dto.password);
  }
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Req() req: any) {
    return {
      message: '鉴权成功',
      user: req.user,
    };
  }
}
