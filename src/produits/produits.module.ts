import { Module } from '@nestjs/common';
import { ProduitsController } from './produits.controller';

@Module({ controllers: [ProduitsController] })
export class ProduitsModule {}
