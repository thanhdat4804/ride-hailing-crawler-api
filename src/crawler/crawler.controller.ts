import { Controller, Get, Query } from '@nestjs/common'
import { CrawlerService } from './crawler.service'

@Controller('check-violation')
export class CrawlerController {

  constructor(private readonly crawlerService: CrawlerService) {}

  @Get()
  async checkViolation(
    @Query('plate') plate: string,
    @Query('vehicleType') vehicleType: string
  ) {

    const result = await this.crawlerService.checkViolations(
      plate,
      vehicleType
    )

    return {
      hasViolation: !!result,
      data: result
    }

  }

}