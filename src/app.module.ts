import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ProduitsModule } from './produits/produits.module';
import { CommandesModule } from './commandes/commandes.module';
import { DepensesModule } from './depenses/depenses.module';
import { ObjectifsModule } from './objectifs/objectifs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ClientsModule,
    ProduitsModule,
    CommandesModule,
    DepensesModule,
    ObjectifsModule,
  ],
})
export class AppModule {}
