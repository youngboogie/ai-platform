import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService, // 用来连接数据库
    private jwtService: JwtService, // 用来生成 token
  ) {}

  async register(email: string, password: string) {
    // 1️⃣ 先查数据库：有没有这个用户
    const exist = await this.prisma.user.findUnique({
      where: { email },
    });

    // 如果已经存在 → 不允许注册
    if (exist) {
      return { message: '邮箱已注册' };
    }

    // 2️⃣ 密码加密（非常重要！！！）
    const hashed = await bcrypt.hash(password, 10);

    // 3️⃣ 存进数据库
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashed, // 存加密后的
      },
    });

    // 4️⃣ 返回结果
    return {
      message: '注册成功',
      userId: user.id,
    };
  }

  async login(data: LoginDto) {
    // 1. 查找用户
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    // 如果用户不存在
    if (!user) {
      throw new UnauthorizedException('用户不存在或密码错误');
    }

    // 2. 比对密码（明文 vs 加密后的）
    const isPassCorrect = await bcrypt.compare(data.password, user.password);

    if (!isPassCorrect) {
      throw new UnauthorizedException('用户不存在或密码错误');
    }

    // 3. 生成 JWT token
    const payload = {
      sub: user.id, // JWT 标准字段，代表用户ID
      email: user.email,
    };

    const token = this.jwtService.sign(payload);

    // 4. 返回 token 给前端
    return {
      message: '登录成功',
      token,
    };
  }
}
