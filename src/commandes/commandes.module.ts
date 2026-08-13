import { Module } from '@nestjs/common';
import { CommandesController } from './commandes.controller';
import { CommandesService } from './commandes.service';

@Module({ controllers: [CommandesController], providers: [CommandesService] })
export class CommandesModule {}
