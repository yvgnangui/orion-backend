import { Body, Controller, Post, Get, UseGuards, Req } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';

class RegisterDto {
  @IsString() identifiant: string;
  @IsString() @MinLength(4) code: string;
}

class LoginDto {
  @IsString() identifiant: string;
  @IsString() code: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.identifiant, dto.code);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.identifiant, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }
}
