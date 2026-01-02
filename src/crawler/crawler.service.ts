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
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY không được định nghĩa');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  private async solveCaptcha(page: puppeteer.Page): Promise<string | null> {
    const el = await page.$('img#imgCaptcha');
    if (!el) return null;

    const base64 = (await el.screenshot({ encoding: 'base64' })) as string;

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
      const result = await model.generateContent([
        'Read the 6 alphanumeric characters in this CAPTCHA image. Return only the text, no explanation.',
        { inlineData: { data: base64, mimeType: 'image/png' } },
      ]);
      const text = await result.response.text();
      return text.trim().replace(/[^a-z0-9]/gi, '').toLowerCase();
    } catch (error) {
      console.error('Lỗi khi gọi Gemini:', error);
      return null;
    }
  }

  /**
   * Kiểm tra phạt nguội realtime bằng serverless Chrome (browserless.io)
   * Không cần launch Chrome local → chạy mượt trên Render free tier
   */
  async checkViolationsRealtime(licensePlate: string, loaiXe: string = '1') {
    const browserlessToken = this.configService.get<string>('BROWSERLESS_TOKEN');
    if (!browserlessToken) {
      console.error('BROWSERLESS_TOKEN chưa được cấu hình');
      return {
        hasViolation: false,
        message: 'Dịch vụ tạm thời không khả dụng (thiếu cấu hình)',
      };
    }

    let browser: puppeteer.Browser | null = null;
    let page: puppeteer.Page | null = null;

    try {
      // Kết nối đến Chrome serverless của browserless.io
      browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}&--no-sandbox&--disable-setuid-sandbox&--disable-dev-shm-usage&--disable-gpu`,
      });

      page = await browser.newPage();

      console.log(`Bắt đầu kiểm tra phạt nguội cho biển số: ${licensePlate} (loại xe: ${loaiXe === '1' ? 'xe máy' : 'ô tô'})`);

      await page.goto('https://phatnguoi.csgt.vn/tra-cuu-phuong-tien-vi-pham.html', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      await page.type('input[name="BienKiemSoat"]', licensePlate);
      await page.select('select[name="LoaiXe"]', loaiXe);

      let solved = false;
      let attempts = 0;
      const maxAttempts = 6;

      while (!solved && attempts < maxAttempts) {
        attempts++;
        console.log(`Lần thử CAPTCHA thứ ${attempts}/${maxAttempts}`);

        const code = await this.solveCaptcha(page);
        if (!code) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        await page.evaluate(() => {
          const input = document.querySelector('input[name="txt_captcha"]') as HTMLInputElement | null;
          if (input) input.value = '';
        });

        await page.type('input[name="txt_captcha"]', code);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
          page.click('.btnTraCuu'),
        ]);

        await new Promise(r => setTimeout(r, 5000));

        const hasResult = await page.evaluate(() => {
          return !!document.querySelector('#bodyPrint123') || !!document.querySelector('#divKetQuaTraCuu');
        });

        if (hasResult) {
          solved = true;
          console.log('CAPTCHA đúng!');
        } else {
          console.log('CAPTCHA sai, reload trang để thử lại...');
          await page.reload({ waitUntil: 'networkidle2' });
          await page.type('input[name="BienKiemSoat"]', licensePlate);
          await page.select('select[name="LoaiXe"]', loaiXe);
        }
      }

      if (!solved) {
        return {
          hasViolation: false,
          message: 'Không thể kiểm tra do CAPTCHA quá khó. Vui lòng thử lại sau vài phút.',
        };
      }

      // Kiểm tra có vi phạm thực sự không
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
        message: 'Cảnh báo: Xe có phạt nguội chưa xử lý',
        violation: {
          time: data.violation_time?.trim() || 'Không rõ',
          location: data.violation_location?.trim() || 'Không rõ',
          description: data.violation_description?.trim() || data.violation_raw?.trim() || 'Không rõ hành vi',
          code: data.violation_code?.trim() || null,
          status: data.status?.trim() || 'Chưa xử phạt',
        },
      };
    } catch (error: any) {
      console.error('Lỗi nghiêm trọng trong quá trình crawl:', error);
      return {
        hasViolation: false,
        message: 'Lỗi hệ thống khi kiểm tra phạt nguội. Vui lòng thử lại sau.',
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}