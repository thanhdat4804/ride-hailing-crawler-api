import { Controller, Get, Query } from "@nestjs/common"
import { TaxCrawlerService } from "./tax-crawler.service"

@Controller("tax")
export class TaxCrawlerController {

  constructor(
    private readonly taxService: TaxCrawlerService
  ) {}

  @Get()
  async getTax(
    @Query("taxCode") taxCode: string
  ) {

    if (!taxCode) {
      return {
        message: "taxCode is required"
      }
    }

    return this.taxService.getTaxInfo(taxCode)

  }

}