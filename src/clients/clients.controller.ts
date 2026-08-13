import { Body, Controller, Get, Param, Post, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.client.findMany({
      include: { produitPredilection: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prisma.client.findUnique({
      where: { id: Number(id) },
      include: { commandes: true, produitPredilection: true },
    });
  }

  // Niveau 1 ET Niveau 2 peuvent créer un client.
  @Post()
  create(@Body() data: any) {
    return this.prisma.client.create({ data });
  }

  // Seul Niveau 1 peut modifier les informations sensibles d'un client (prix, catégorie...).
  @Roles('NIVEAU_1')
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.prisma.client.update({ where: { id: Number(id) }, data });
  }
}
