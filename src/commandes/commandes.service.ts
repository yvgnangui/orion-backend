import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Seuils de catégorisation par potentiel mensuel (tonnes) et majoration de prix associée.
function categoriserClient(client: { categorieTaille?: string | null; potentielMensuelTonnes?: number | null }) {
  if (client.categorieTaille) return client.categorieTaille;
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

const INCLUDE_COMMANDE_COMPLET = {
  client: true,
  lignes: {
    include: {
      produit: true,
      retraits: { include: { preuves: true } },
    },
  },
};

@Injectable()
export class CommandesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.commande.findMany({
      include: INCLUDE_COMMANDE_COMPLET,
      orderBy: { dateCreation: 'desc' },
    });
  }

  findOne(id: number) {
    return this.prisma.commande.findUnique({ where: { id }, include: INCLUDE_COMMANDE_COMPLET });
  }

  // Étape 1 : création du bon de commande (l'engagement global du client), en attente de validation.
  async create(data: {
    clientId: number;
    modePaiement: string;
    creeParId: number;
    lignes: { produitId: number; quantite: number }[];
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

    const lignesData = data.lignes.map((l) => {
      const produit = produits.find((p) => p.id === l.produitId);
      if (!produit) throw new BadRequestException('Produit introuvable.');
      return {
        produitId: produit.id,
        quantiteTotale: l.quantite,
        prixUnitaireApplique: produit.prixUnitaire + majoration,
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
        lignes: { create: lignesData },
      },
      include: INCLUDE_COMMANDE_COMPLET,
    });
  }

  // Étape 2 : Niveau 1 valide le bon de commande — les retraits peuvent ensuite commencer.
  async validerBon(id: number, valideParId: number) {
    const commande = await this.getBonOrThrow(id);
    if (commande.statut !== 'EN_ATTENTE_VALIDATION') {
      throw new BadRequestException('Ce bon de commande ne peut pas être validé depuis son statut actuel.');
    }
    return this.prisma.commande.update({
      where: { id },
      data: { statut: 'VALIDE', valideParId, dateValidation: new Date() },
      include: INCLUDE_COMMANDE_COMPLET,
    });
  }

  async update(id: number, data: any) {
    const commande = await this.getBonOrThrow(id);
    if (commande.statut === 'TERMINE') {
      throw new BadRequestException('Un bon de commande déjà soldé ne peut plus être modifié.');
    }
    return this.prisma.commande.update({ where: { id }, data });
  }

  async remove(id: number) {
    const commande = await this.getBonOrThrow(id);
    const ligneIds = commande.lignes.map((l) => l.id);
    const retraits = await this.prisma.retrait.findMany({ where: { commandeLigneId: { in: ligneIds } } });
    const retraitIds = retraits.map((r) => r.id);
    await this.prisma.preuvePaiement.deleteMany({ where: { retraitId: { in: retraitIds } } });
    await this.prisma.retrait.deleteMany({ where: { id: { in: retraitIds } } });
    await this.prisma.commandeLigne.deleteMany({ where: { commandeId: id } });
    return this.prisma.commande.delete({ where: { id } });
  }

  // --- RETRAITS (chaque venue partielle du client sur un bon de commande validé) ---

  // Création d'un retrait : d'abord en attente de validation Niveau 1.
  async creerRetrait(data: {
    commandeLigneId: number;
    quantite: number;
    creeParId: number;
    preuveFichierUrl?: string;
  }) {
    const ligne = await this.prisma.commandeLigne.findUnique({
      where: { id: data.commandeLigneId },
      include: { commande: true, produit: true },
    });
    if (!ligne) throw new BadRequestException('Ligne de commande introuvable.');
    if (ligne.commande.statut === 'EN_ATTENTE_VALIDATION') {
      throw new BadRequestException("Le bon de commande doit d'abord être validé avant tout retrait.");
    }
    const restant = ligne.quantiteTotale - ligne.quantiteRetireeCumulee;
    if (data.quantite > restant) {
      throw new BadRequestException(`Quantité restante insuffisante (il reste ${restant}).`);
    }

    const montantHt = ligne.prixUnitaireApplique * data.quantite;
    const montantTva = (montantHt * ligne.produit.tauxTva) / 100;

    return this.prisma.retrait.create({
      data: {
        commandeLigneId: data.commandeLigneId,
        quantite: data.quantite,
        montantHt,
        montantTva,
        montantTotalTtc: montantHt + montantTva,
        statut: 'EN_ATTENTE_VALIDATION',
        creeParId: data.creeParId,
        preuves: data.preuveFichierUrl ? { create: [{ fichierUrl: data.preuveFichierUrl }] } : undefined,
      },
      include: { preuves: true },
    });
  }

  // Niveau 1 valide le retrait — la quantité est alors déduite du bon de commande.
  async validerRetrait(retraitId: number, valideParId: number) {
    const retrait = await this.prisma.retrait.findUnique({
      where: { id: retraitId },
      include: { commandeLigne: { include: { commande: true } } },
    });
    if (!retrait) throw new NotFoundException('Retrait introuvable.');
    if (retrait.statut !== 'EN_ATTENTE_VALIDATION') {
      throw new BadRequestException('Ce retrait ne peut pas être validé depuis son statut actuel.');
    }

    const ligne = retrait.commandeLigne;
    const restant = ligne.quantiteTotale - ligne.quantiteRetireeCumulee;
    if (retrait.quantite > restant) {
      throw new BadRequestException(`Quantité restante insuffisante (il reste ${restant}) — le bon a peut-être été modifié entre temps.`);
    }

    await this.prisma.commandeLigne.update({
      where: { id: ligne.id },
      data: { quantiteRetireeCumulee: { increment: retrait.quantite } },
    });

    const misAJour = await this.prisma.retrait.update({
      where: { id: retraitId },
      data: { statut: 'VALIDE', valideParId, dateValidation: new Date() },
    });

    await this.mettreAJourStatutBon(ligne.commandeId);
    return misAJour;
  }

  async confirmerLivraisonRetrait(retraitId: number, livreConfirmeParId: number) {
    const retrait = await this.prisma.retrait.findUnique({ where: { id: retraitId } });
    if (!retrait) throw new NotFoundException('Retrait introuvable.');
    if (retrait.statut !== 'VALIDE') {
      throw new BadRequestException("Ce retrait doit d'abord être validé avant confirmation de livraison.");
    }
    return this.prisma.retrait.update({
      where: { id: retraitId },
      data: { statut: 'LIVRE', livreConfirmeParId, dateLivraisonConfirmee: new Date() },
    });
  }

  // Facturation partielle : génère la facture pour ce retrait précis, selon la quantité réellement enlevée.
  async facturerRetrait(retraitId: number) {
    const retrait = await this.prisma.retrait.findUnique({ where: { id: retraitId } });
    if (!retrait) throw new NotFoundException('Retrait introuvable.');
    if (retrait.statut !== 'LIVRE') {
      throw new BadRequestException('Seul un retrait livré peut être facturé.');
    }
    // NOTE : c'est ICI que l'appel à l'API FNE de la DGI se déclenchera pour ce retrait,
    // dès que l'intégration sera réactivée. Volontairement laissé en attente pour l'instant.
    return this.prisma.retrait.update({ where: { id: retraitId }, data: { statut: 'FACTURE' } });
  }

  async enregistrerPaiementRetrait(retraitId: number, montantPaye: number) {
    const retrait = await this.prisma.retrait.findUnique({ where: { id: retraitId } });
    if (!retrait) throw new NotFoundException('Retrait introuvable.');
    return this.prisma.retrait.update({ where: { id: retraitId }, data: { montantPaye } });
  }

  private async mettreAJourStatutBon(commandeId: number) {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: { lignes: true },
    });
    if (!commande) return;
    const toutEpuise = commande.lignes.every((l) => l.quantiteRetireeCumulee >= l.quantiteTotale);
    const nouveauStatut = toutEpuise ? 'TERMINE' : 'EN_COURS';
    if (commande.statut !== nouveauStatut) {
      await this.prisma.commande.update({ where: { id: commandeId }, data: { statut: nouveauStatut as any } });
    }

    await this.mettreAJourFrequenceAchatClient(commande.clientId);
  }

  private async mettreAJourFrequenceAchatClient(clientId: number) {
    const retraits = await this.prisma.retrait.findMany({
      where: { commandeLigne: { commande: { clientId } }, statut: { in: ['VALIDE', 'LIVRE', 'FACTURE'] } },
      orderBy: { dateValidation: 'asc' },
    });
    if (retraits.length < 2) return;

    const dates = retraits.map((r) => r.dateValidation).filter((d): d is Date => !!d);
    if (dates.length < 2) return;
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

  private async getBonOrThrow(id: number) {
    const commande = await this.prisma.commande.findUnique({ where: { id }, include: { lignes: true } });
    if (!commande) throw new NotFoundException('Bon de commande introuvable.');
    return commande;
  }
}
