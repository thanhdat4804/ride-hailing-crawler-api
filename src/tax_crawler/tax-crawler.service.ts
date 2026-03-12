import { Injectable, OnModuleInit } from "@nestjs/common"
import puppeteer, { Browser, Page } from "puppeteer"
import * as cheerio from "cheerio"
import { CaptchaService } from "../captcha.service"

@Injectable()
export class TaxCrawlerService implements OnModuleInit {

  private browser: Browser

  constructor(
    private readonly captchaService: CaptchaService
  ) {}

  async onModuleInit() {

    this.browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    })

    console.log("Tax crawler browser started")

  }

  async getTaxInfo(taxCode: string) {

    let page: Page | null = null
    const maxRetry = 3

    try {

      page = await this.browser.newPage()

      await page.goto(
        "https://tracuunnt.gdt.gov.vn/tcnnt/mstdn.jsp",
        { waitUntil: "domcontentloaded" }
      )

      for (let attempt = 1; attempt <= maxRetry; attempt++) {

        try {

          await page.waitForSelector('input[name="mst"]')

          await page.evaluate(() => {
            const mst = document.querySelector('input[name="mst"]') as HTMLInputElement
            const captcha = document.querySelector('#captcha') as HTMLInputElement
            if (mst) mst.value = ""
            if (captcha) captcha.value = ""
          })

          await page.type('input[name="mst"]', taxCode)

          const captcha = await this.captchaService.solveCaptcha(
            page,
            'img[src*="captcha.png"]'
          )

          if (!captcha) throw new Error("Captcha read failed")

          console.log("captcha:", captcha)

          await page.type("#captcha", captcha)

          await Promise.all([
            page.click("input.subBtn"),
            page.waitForSelector("#resultContainer", { timeout: 10000 })
          ])

          await new Promise(resolve => setTimeout(resolve, 2000))

          const html = await page.content()

          if (html.includes("Mã xác nhận không đúng")) {
            throw new Error("Captcha incorrect")
          }

          if (html.includes("Không tìm thấy")) {
            return {
              taxCode,
              message: "Tax code not found"
            }
          }

          const $ = cheerio.load(html)

          const row = $("table.ta_border tbody tr").eq(1)

          if (!row.length) {
            throw new Error("Result row not found")
          }

          const cols = row.find("td")

          const result = {
            taxCode: cols.eq(1).text().trim(),
            name: cols.eq(2).text().trim(),
            address: cols.eq(3).text().trim(),
            taxOffice: cols.eq(4).text().trim(),
            status: cols.eq(5).text().trim()
          }

          return result

        } catch (err) {

          console.log(`Captcha attempt ${attempt} failed`)

          if (attempt === maxRetry) throw err

          await page.reload({ waitUntil: "domcontentloaded" })

        }

      }

    } catch (err) {

      console.error("Tax crawler error:", err)

      return {
        taxCode,
        message: "Crawler error"
      }

    } finally {

      if (page && !page.isClosed()) {
        await page.close()
      }

    }

  }

}