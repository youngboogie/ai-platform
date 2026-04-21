import { IsEmail, MinLength } from 'class-validator';

// 这个类就是“请求参数的规则”
export class RegisterDto {
  @IsEmail() // 必须是邮箱格式
  email: string;

  @MinLength(6) // 密码至少6位
  password: string;
}
