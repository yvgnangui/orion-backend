import { Module } from '@nestjs/common';
import { ObjectifsController } from './objectifs.controller';

@Module({ controllers: [ObjectifsController] })
export class ObjectifsModule {}
