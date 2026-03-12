import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrawlerController } from './crawler/crawler.controller';
import { CrawlerService } from './crawler/crawler.service';
import { TaxCrawlerController } from './tax_crawler/tax-crawler.controller';
import { CaptchaService } from './captcha.service';
import { TaxCrawlerService } from './tax_crawler/tax-crawler.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // để dùng ConfigService ở mọi nơi mà không cần import lại
      envFilePath: '.env',
    }),
  ],
  controllers: [CrawlerController, TaxCrawlerController],
  providers: [CrawlerService, TaxCrawlerService, CaptchaService],
})
export class AppModule {}