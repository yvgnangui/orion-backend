import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

// Protège une route : nécessite un token JWT valide.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// Décorateur : @Roles('NIVEAU_1') pour restreindre une route au niveau Administrateur.
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user || !roles.includes(user.niveau)) {
      throw new UnauthorizedException('Accès réservé à un niveau supérieur.');
    }
    return true;
  }
}
