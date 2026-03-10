import { Injectable, OnModuleInit } from "@nestjs/common"
import puppeteer, { Browser, Page } from "puppeteer-core"
import chromium from "@sparticuz/chromium"
import * as cheerio from "cheerio"

@Injectable()
export class CrawlerService implements OnModuleInit {

  private browser: Browser

  async onModuleInit() {

    if (process.platform === "win32") {

      // DEV (Windows)
      this.browser = await puppeteer.launch({
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox"
        ]
      })

    } else {

      // SERVER (Linux / Docker / Render)

      const executablePath = await chromium.executablePath()

      this.browser = await puppeteer.launch({
        executablePath,
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox"
        ],
        headless: true
      })

    }

    console.log("Crawler browser started")

  }

  async checkViolations(
    plate: string,
    vehicleType: string
  ) {

    let page: Page | null = null

    try {

      page = await this.browser.newPage()

      page.setDefaultNavigationTimeout(30000)
      page.setDefaultTimeout(30000)

      await page.goto(
        "https://www.csgt.vn/index.php/tra-cuu-phat-nguoi",
        { 
          waitUntil: "domcontentloaded",
          timeout: 60000
        }
      )

      await page.waitForSelector('input[name="plate_number"]')

      await page.type('input[name="plate_number"]', plate)

      await page.select('select[name="vehicle_type"]', vehicleType)

      await Promise.all([
        page.click("#submitBtn"),
        page.waitForSelector("#result")
      ])

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

        return {
          licensePlate: plate,
          hasViolation: false,
          message: "Không phát hiện vi phạm"
        }

      }

      const description = card
        .find(".info-item:contains('Lỗi vi phạm') .value")
        .text()
        .trim()

      if (!description) {

        return {
          licensePlate: plate,
          hasViolation: false,
          message: "Không phát hiện vi phạm"
        }

      }

      const time = card
        .find(".info-item:contains('Thời gian') .value")
        .text()
        .trim()

      const location = card
        .find(".info-item:contains('Địa điểm') .value")
        .text()
        .trim()

      const status = card
        .find(".status-badge")
        .text()
        .trim()

      const code = description.split(".")[0]

      return {

        licensePlate: plate,

        hasViolation: true,

        message: "Phát hiện vi phạm",

        violation: {
          time,
          location,
          description,
          code,
          status
        }

      }

    } catch (err) {

      console.error("Crawler error:", err)

      return {
        licensePlate: plate,
        hasViolation: false,
        message: "Crawler error"
      }

    } finally {

      if (page && !page.isClosed()) {
        await page.close()
      }

    }

  }

}