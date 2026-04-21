// src/auth/dto/login.dto.ts
// 用来接收“登录时用户输入的数据”

export class LoginDto {
  email: string; // 用户输入的邮箱
  password: string; // 用户输入的密码
}
