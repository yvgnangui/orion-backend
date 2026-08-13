import { Body, Controller, Get, Param, Post, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('produits')
export class ProduitsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.produit.findMany({ where: { actif: true } });
  }

  // Seul Niveau 1 peut créer/modifier les produits et leurs prix.
  @Roles('NIVEAU_1')
  @Post()
  create(@Body() data: any) {
    return this.prisma.produit.create({ data });
  }

  @Roles('NIVEAU_1')
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.prisma.produit.update({ where: { id: Number(id) }, data });
  }
}
