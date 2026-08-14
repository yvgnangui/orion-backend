import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Seuils de catégorisation par potentiel mensuel (tonnes) et majoration de prix associée.
function categoriserClient(client: { categorieTaille?: string | null; potentielMensuelTonnes?: number | null }) {
  if (client.categorieTaille) return client.categorieTaille; // choix manuel prioritaire
  const p = client.potentielMensuelTonnes ?? 0;
  if (p >= 50) return 'TRES_GROS';
  if (p >= 20) return 'GROS';
  if (p >= 10) return 'MOYEN';
  if (p >= 5) return 'PETIT';
  return 'TRES_PETIT';
}

function majorationParCategorie(categorie: string): number {
  const majorations: Record<string, number> = {
    TRES_GROS: 0,
    GROS: 0,
    MOYEN: 250,
    PETIT: 500,
    TRES_PETIT: 1000,
  };
  return majorations[categorie] ?? 0;
}

@Injectable()
export class CommandesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.commande.findMany({
      include: { client: true, lignes: { include: { produit: true } }, preuves: true },
      orderBy: { dateCreation: 'desc' },
    });
  }

  async create(data: {
    clientId: number;
    modePaiement: string;
    creeParId: number;
    lignes: { produitId: number; quantite: number }[];
    preuveFichierUrl?: string;
    credit?: number;
    delaiPaiementJours?: number;
  }) {
    const client = await this.prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) throw new BadRequestException('Client introuvable.');
    const categorie = categoriserClient(client);
    const majoration = majorationParCategorie(categorie);

    const produits = await this.prisma.produit.findMany({
      where: { id: { in: data.lignes.map((l) => l.produitId) } },
    });

    let montantTotalHt = 0;
    let montantTva = 0;
    const lignesData = data.lignes.map((l) => {
      const produit = produits.find((p) => p.id === l.produitId);
      if (!produit) throw new BadRequestException('Produit introuvable.');
      const prixApplique = produit.prixUnitaire + majoration;
      const sousTotal = prixApplique * l.quantite;
      montantTotalHt += sousTotal;
      montantTva += (sousTotal * produit.tauxTva) / 100;
      return {
        produitId: produit.id,
        quantite: l.quantite,
        prixUnitaireApplique: prixApplique,
        sousTotal,
      };
    });

    return this.prisma.commande.create({
      data: {
        clientId: data.clientId,
        creeParId: data.creeParId,
        modePaiement: data.modePaiement as any,
        statut: 'EN_ATTENTE_VALIDATION',
        credit: data.credit,
        delaiPaiementJours: data.delaiPaiementJours,
        montantTotalHt,
        montantTva,
        montantTotalTtc: montantTotalHt + montantTva,
        lignes: { create: lignesData },
        preuves: data.preuveFichierUrl
          ? { create: [{ fichierUrl: data.preuveFichierUrl }] }
          : undefined,
      },
      include: { lignes: true, preuves: true },
    });
  }

  // Niveau 1 uniquement : modifier une commande (avant facturation).
  async update(id: number, data: any) {
    const commande = await this.getOrThrow(id);
    if (commande.statut === 'FACTUREE') {
      throw new BadRequestException('Une commande déjà facturée ne peut plus être modifiée.');
    }
    return this.prisma.commande.update({ where: { id }, data });
  }

  // Niveau 1 uniquement : supprimer une commande.
  async remove(id: number) {
    await this.getOrThrow(id);
    await this.prisma.commandeLigne.deleteMany({ where: { commandeId: id } });
    await this.prisma.preuvePaiement.deleteMany({ where: { commandeId: id } });
    return this.prisma.commande.delete({ where: { id } });
  }

  // Étape 2 du workflow : Niveau 1 valide la commande + planifie la livraison.
  async valider(id: number, valideParId: number, dateLivraisonPlanifiee: Date) {
    const commande = await this.getOrThrow(id);
    if (commande.statut !== 'EN_ATTENTE_VALIDATION') {
      throw new BadRequestException('Cette commande ne peut pas être validée depuis son statut actuel.');
    }
    return this.prisma.commande.update({
      where: { id },
      data: { statut: 'VALIDEE_ATTENTE_LIVRAISON', valideParId, dateLivraisonPlanifiee },
    });
  }

  // Étape 3 : Niveau 1 confirme la livraison physique.
  async confirmerLivraison(id: number, livreConfirmeParId: number) {
    const commande = await this.getOrThrow(id);
    if (commande.statut !== 'VALIDEE_ATTENTE_LIVRAISON') {
      throw new BadRequestException('Cette commande n’est pas en attente de livraison.');
    }
    const misAJour = await this.prisma.commande.update({
      where: { id },
      data: { statut: 'LIVREE', livreConfirmeParId, dateLivraisonConfirmee: new Date() },
    });

    await this.mettreAJourFrequenceAchatClient(commande.clientId);

    // NOTE : c'est ICI que l'appel à l'API FNE de la DGI se déclenchera (statut LIVREE -> FACTUREE),
    // dès que l'intégration sera réactivée. Volontairement laissé en attente pour l'instant.

    return misAJour;
  }

  private async mettreAJourFrequenceAchatClient(clientId: number) {
    const commandesLivrees = await this.prisma.commande.findMany({
      where: { clientId, statut: { in: ['LIVREE', 'FACTUREE'] } },
      orderBy: { dateLivraisonConfirmee: 'asc' },
    });
    if (commandesLivrees.length < 2) return;

    const dates = commandesLivrees
      .map((c) => c.dateLivraisonConfirmee)
      .filter((d): d is Date => !!d);
    const ecarts = dates.slice(1).map((d, i) => (d.getTime() - dates[i].getTime()) / 86400000);
    const frequenceReelle = Math.round(ecarts.reduce((a, b) => a + b, 0) / ecarts.length);
    const dernierAchat = dates[dates.length - 1];
    const prochainAchat = new Date(dernierAchat.getTime() + frequenceReelle * 86400000);

    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        frequenceAchatReelleJours: frequenceReelle,
        dateDernierAchat: dernierAchat,
        dateAchatTheoriqueSuivant: prochainAchat,
      },
    });
  }

  private async getOrThrow(id: number) {
    const commande = await this.prisma.commande.findUnique({ where: { id } });
    if (!commande) throw new NotFoundException('Commande introuvable.');
    return commande;
  }
}
