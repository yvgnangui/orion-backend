import { Body, Controller, Get, Param, Post, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { CommandesService } from './commandes.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commandes')
export class CommandesController {
  constructor(private commandesService: CommandesService) {}

  @Get()
  findAll() {
    return this.commandesService.findAll();
  }

  // Étape 1 : Niveau 1 ou 2 crée la commande + preuve de paiement.
  @Post()
  create(@Body() data: any, @Req() req: any) {
    return this.commandesService.create({ ...data, creeParId: req.user.id });
  }

  // Étape 2 : réservé Niveau 1.
  @Roles('NIVEAU_1')
  @Patch(':id/valider')
  valider(@Param('id') id: string, @Body('dateLivraisonPlanifiee') date: string, @Req() req: any) {
    return this.commandesService.valider(Number(id), req.user.id, new Date(date));
  }

  // Étape 3 : réservé Niveau 1.
  @Roles('NIVEAU_1')
  @Patch(':id/confirmer-livraison')
  confirmerLivraison(@Param('id') id: string, @Req() req: any) {
    return this.commandesService.confirmerLivraison(Number(id), req.user.id);
  }
}
