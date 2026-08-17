import { Module } from '@nestjs/common';
import { DepensesController } from './depenses.controller';

@Module({ controllers: [DepensesController] })
export class DepensesModule {}
