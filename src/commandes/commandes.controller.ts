import { Body, Controller, Delete, Get, Param, Post, Patch, Req, UseGuards } from '@nestjs/common';
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commandesService.findOne(Number(id));
  }

  // Création du bon de commande — Niveau 1 ou 2.
  @Post()
  create(@Body() data: any, @Req() req: any) {
    return this.commandesService.create({ ...data, creeParId: req.user.id });
  }

  // Validation du bon de commande — réservé Niveau 1.
  @Roles('NIVEAU_1')
  @Patch(':id/valider')
  validerBon(@Param('id') id: string, @Req() req: any) {
    return this.commandesService.validerBon(Number(id), req.user.id);
  }

  @Roles('NIVEAU_1')
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.commandesService.update(Number(id), data);
  }

  @Roles('NIVEAU_1')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commandesService.remove(Number(id));
  }

  // --- Retraits ---

  // Enregistrement d'un retrait — Niveau 1 ou 2. En attente de validation Niveau 1.
  @Post('retraits')
  creerRetrait(@Body() data: any, @Req() req: any) {
    return this.commandesService.creerRetrait({ ...data, creeParId: req.user.id });
  }

  // Validation du retrait — réservé Niveau 1. Déduit la quantité du bon de commande.
  @Roles('NIVEAU_1')
  @Patch('retraits/:id/valider')
  validerRetrait(@Param('id') id: string, @Req() req: any) {
    return this.commandesService.validerRetrait(Number(id), req.user.id);
  }

  @Roles('NIVEAU_1')
  @Patch('retraits/:id/confirmer-livraison')
  confirmerLivraisonRetrait(@Param('id') id: string, @Req() req: any) {
    return this.commandesService.confirmerLivraisonRetrait(Number(id), req.user.id);
  }

  @Roles('NIVEAU_1')
  @Patch('retraits/:id/facturer')
  facturerRetrait(@Param('id') id: string) {
    return this.commandesService.facturerRetrait(Number(id));
  }

  @Roles('NIVEAU_1')
  @Patch('retraits/:id/paiement')
  enregistrerPaiement(@Param('id') id: string, @Body('montantPaye') montantPaye: number) {
    return this.commandesService.enregistrerPaiementRetrait(Number(id), montantPaye);
  }
}
