import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { Page } from "puppeteer-core"

@Injectable()
export class CaptchaService {

  private genAI: GoogleGenerativeAI

  constructor(private configService: ConfigService) {

    const apiKey = this.configService.get<string>("GEMINI_API_KEY")

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY không được định nghĩa")
    }

    this.genAI = new GoogleGenerativeAI(apiKey)

  }

  async solveCaptcha(
    page: Page,
    selector: string
  ): Promise<string | null> {

    const el = await page.$(selector)

    if (!el) return null

    const base64 = (await el.screenshot({
      encoding: "base64"
    })) as string

    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash"
    })

    try {
      const prompt = `
      Read the captcha text exactly.
      Only return the characters.

      Rules:
      - 5 lowercase letters or numbers
      - no spaces
      - no explanation
      `
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64,
            mimeType: "image/png"
          }
        }
      ])

      const text = await result.response.text()

      const captcha = text
        .trim()
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()

      if (captcha.length < 4) return null

      return captcha

    } catch (err) {

      console.error("Captcha solve error:", err)

      return null

    }

  }

}