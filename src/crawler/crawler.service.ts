// src/crawler/crawler.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseResult, normalizeViolation } from '../parser';

@Injectable()
export class CrawlerService {
  private readonly genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY không được định nghĩa');

    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  // retry goto tránh crash frame detach
  private async safeGoto(page: puppeteer.Page, url: string) {
    for (let i = 0; i < 3; i++) {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        return;
      } catch (err) {
        console.log(`Goto retry ${i + 1}`);
        if (i === 2) throw err;
      }
    }
  }

  private async solveCaptcha(page: puppeteer.Page): Promise<string | null> {
    const el = await page.$('img#imgCaptcha');
    if (!el) return null;

    const base64 = (await el.screenshot({ encoding: 'base64' })) as string;

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    try {
      const result = await model.generateContent([
        'Read the 6 alphanumeric characters in this CAPTCHA image. Return only the text.',
        { inlineData: { data: base64, mimeType: 'image/png' } },
      ]);

      const text = await result.response.text();

      return text
        .trim()
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
    } catch (error) {
      console.error('Gemini error:', error);
      return null;
    }
  }

  async checkViolationsRealtime(licensePlate: string, loaiXe: string = '1') {
    const browserlessToken =
      this.configService.get<string>('BROWSERLESS_TOKEN');

    if (!browserlessToken) {
      return {
        hasViolation: false,
        message: 'Dịch vụ tạm thời không khả dụng',
      };
    }

    let browser: puppeteer.Browser | null = null;
    let page: puppeteer.Page | null = null;

    try {
      browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}`,
      });

      page = await browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
      );

      await page.setViewport({
        width: 1280,
        height: 800,
      });

      console.log(`Checking plate: ${licensePlate}`);

      await this.safeGoto(
        page,
        'https://phatnguoi.csgt.vn/tra-cuu-phuong-tien-vi-pham.html',
      );

      await page.waitForSelector('input[name="BienKiemSoat"]');

      await page.type('input[name="BienKiemSoat"]', licensePlate);
      await page.select('select[name="LoaiXe"]', loaiXe);

      let solved = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!solved && attempts < maxAttempts) {
        attempts++;

        console.log(`Captcha attempt ${attempts}`);

        const code = await this.solveCaptcha(page);

        if (!code) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        await page.evaluate(() => {
          const input = document.querySelector(
            'input[name="txt_captcha"]',
          ) as HTMLInputElement;

          if (input) input.value = '';
        });

        await page.type('input[name="txt_captcha"]', code);

        await page.click('.btnTraCuu');

        // site dùng ajax nên đợi selector thay vì navigation
        await page
          .waitForSelector('#divKetQuaTraCuu', { timeout: 15000 })
          .catch(() => {});

        const hasResult = await page.evaluate(() => {
          return (
            !!document.querySelector('#bodyPrint123') ||
            !!document.querySelector('#divKetQuaTraCuu')
          );
        });

        if (hasResult) {
          solved = true;
          console.log('Captcha solved');
        } else {
          console.log('Captcha failed → reload');

          await page.reload({
            waitUntil: 'domcontentloaded',
          });

          await page.waitForSelector('input[name="BienKiemSoat"]');

          await page.type('input[name="BienKiemSoat"]', licensePlate);
          await page.select('select[name="LoaiXe"]', loaiXe);
        }
      }

      if (!solved) {
        return {
          hasViolation: false,
          message: 'Không thể giải CAPTCHA',
        };
      }

      const hasViolationBody = await page.evaluate(() => {
        const bodyPrint = document.querySelector('#bodyPrint123');

        return bodyPrint && bodyPrint.textContent?.trim().length > 100;
      });

      if (!hasViolationBody) {
        return {
          hasViolation: false,
          message: 'Xe sạch - Không có phạt nguội',
        };
      }

      const rawText = await page.evaluate(() => {
        const container = document.querySelector('#bodyPrint123');
        return container?.textContent?.trim() || '';
      });

      const parsed = parseResult(rawText);
      const data = normalizeViolation(parsed);

      return {
        hasViolation: true,
        message: 'Xe có phạt nguội chưa xử lý',
        violation: {
          time: data.violation_time?.trim() || 'Không rõ',
          location: data.violation_location?.trim() || 'Không rõ',
          description:
            data.violation_description?.trim() ||
            data.violation_raw?.trim() ||
            'Không rõ hành vi',
          code: data.violation_code?.trim() || null,
          status: data.status?.trim() || 'Chưa xử phạt',
        },
      };
    } catch (error) {
      console.error('Crawler error:', error);

      return {
        hasViolation: false,
        message: 'Lỗi hệ thống khi kiểm tra phạt nguội',
      };
    } finally {
      if (page && !page.isClosed()) {
        await page.close();
      }

      if (browser) {
        await browser.close();
      }
    }
  }
}