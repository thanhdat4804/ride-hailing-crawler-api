import { Injectable, OnModuleInit } from "@nestjs/common"
import * as puppeteer from "puppeteer"
import * as cheerio from "cheerio"

export interface ViolationResult {
  plate: string
  vehicleType: string
  plateColor: string
  violation: string
  time: string
  location: string
  detectedBy: string
  detectedAddress: string
  status: string
}

@Injectable()
export class CrawlerService implements OnModuleInit {

  private browser: puppeteer.Browser

  async onModuleInit() {

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    })

    console.log("Crawler browser started")

  }

  async checkViolations(
    plate: string,
    vehicleType: string
  ): Promise<ViolationResult | null> {

    const page = await this.browser.newPage()

    try {

      await page.goto(
        "https://www.csgt.vn/index.php/tra-cuu-phat-nguoi",
        { waitUntil: "domcontentloaded" }
      )

      await page.waitForSelector('input[name="plate_number"]')

      await page.type('input[name="plate_number"]', plate)

      await page.select('select[name="vehicle_type"]', vehicleType)

      await page.click("#submitBtn")

      await page.waitForFunction(() => {

        const el = document.querySelector("#result") as HTMLElement | null

        if (!el) return false

        const text = el.innerText.trim()

        return text.length > 0 && !text.includes("Đang tra cứu")

      })

      const html = await page.$eval("#result", el => el.innerHTML)

      const $ = cheerio.load(html)

      const card = $(".violation-card")

      if (!card.length) {
        return null
      }

      const result: ViolationResult = {

        plate: card.find(".violation-title")
          .text()
          .replace("Biển số:", "")
          .trim(),

        vehicleType: card.find(".info-item:contains('Loại xe') .value").text().trim(),

        plateColor: card.find(".info-item:contains('Màu biển') .value").text().trim(),

        violation: card.find(".info-item:contains('Lỗi vi phạm') .value").text().trim(),

        time: card.find(".info-item:contains('Thời gian') .value").text().trim(),

        location: card.find(".info-item:contains('Địa điểm') .value").text().trim(),

        detectedBy: card.find(".info-item:contains('Đơn vị phát hiện') .value").text().trim(),

        detectedAddress: card
          .find(".info-item:contains('Địa chỉ')")
          .first()
          .find(".value")
          .text()
          .trim(),

        status: card.find(".status-badge").text().trim()

      }

      return result

    } catch (err) {

      console.error("Crawler error:", err)
      return null

    } finally {

      await page.close()

    }

  }

}