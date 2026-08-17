import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('NIVEAU_1')
@Controller('depenses')
export class DepensesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.depense.findMany({ orderBy: { date: 'desc' } });
  }

  @Post()
  create(@Body() data: any, @Req() req: any) {
    return this.prisma.depense.create({
      data: {
        categorie: data.categorie,
        libelle: data.libelle,
        montant: Number(data.montant),
        tvaDeductible: Number(data.tvaDeductible || 0),
        fournisseur: data.fournisseur,
        date: data.date ? new Date(data.date) : new Date(),
        justificatifUrl: data.justificatifUrl,
        saisieParId: req.user.id,
      },
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.depense.delete({ where: { id: Number(id) } });
  }
}
