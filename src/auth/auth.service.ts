import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

// Les seules identités reconnues comme Administrateur (Niveau 1).
// Toute autre personne qui crée un compte est automatiquement Niveau 2 (Commercial).
const ADMIN_IDENTIFIANTS = ['yves gnangui', 'gnangui yves', 'gnangui yves desire', 'yvgnangui'];

function normaliser(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(identifiant: string, code: string) {
    const existant = await this.prisma.compte.findUnique({
      where: { identifiant: identifiant.trim() },
    });
    if (existant) {
      throw new ConflictException('Cet identifiant existe déjà.');
    }
    if (!code || code.length < 4) {
      throw new ConflictException("Le code d'accès doit contenir au moins 4 caractères.");
    }

    const codeHash = await bcrypt.hash(code, 12);
    const niveau = ADMIN_IDENTIFIANTS.includes(normaliser(identifiant)) ? 'NIVEAU_1' : 'NIVEAU_2';

    const compte = await this.prisma.compte.create({
      data: { identifiant: identifiant.trim(), codeHash, niveau },
    });

    return { id: compte.id, identifiant: compte.identifiant, niveau: compte.niveau };
  }

  async login(identifiant: string, code: string) {
    const compte = await this.prisma.compte.findFirst({
      where: { identifiant: { equals: identifiant.trim(), mode: 'insensitive' } },
    });
    if (!compte || !compte.actif) {
      throw new UnauthorizedException('Identifiant ou code d’accès incorrect.');
    }
    const valide = await bcrypt.compare(code, compte.codeHash);
    if (!valide) {
      throw new UnauthorizedException('Identifiant ou code d’accès incorrect.');
    }

    const token = this.jwt.sign({ sub: compte.id, identifiant: compte.identifiant, niveau: compte.niveau });
    return {
      access_token: token,
      user: { id: compte.id, identifiant: compte.identifiant, niveau: compte.niveau },
    };
  }
}
