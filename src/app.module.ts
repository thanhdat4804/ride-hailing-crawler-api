import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrawlerController } from './crawler/crawler.controller';
import { CrawlerService } from './crawler/crawler.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // để dùng ConfigService ở mọi nơi mà không cần import lại
      envFilePath: '.env',
    }),
  ],
  controllers: [CrawlerController],
  providers: [CrawlerService],
})
export class AppModule {}