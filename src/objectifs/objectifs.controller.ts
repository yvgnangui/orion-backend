import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { PrismaService } from '../prisma/prisma.service';

function premierDuMois(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('objectifs')
export class ObjectifsController {
  constructor(private prisma: PrismaService) {}

  // Visible par tous les niveaux : renvoie l'objectif du mois en cours (ou null si non défini).
  @Get('mois-courant')
  async moisCourant() {
    return this.prisma.objectifMensuel.findUnique({ where: { mois: premierDuMois() } });
  }

  @Get()
  findAll() {
    return this.prisma.objectifMensuel.findMany({ orderBy: { mois: 'desc' } });
  }

  // Modification réservée Niveau 1 — crée ou met à jour l'objectif du mois en cours.
  @Roles('NIVEAU_1')
  @Put('mois-courant')
  async definirMoisCourant(@Body('quantiteTonnes') quantiteTonnes: number) {
    const mois = premierDuMois();
    return this.prisma.objectifMensuel.upsert({
      where: { mois },
      update: { quantiteTonnes: Number(quantiteTonnes) },
      create: { mois, quantiteTonnes: Number(quantiteTonnes) },
    });
  }
}
