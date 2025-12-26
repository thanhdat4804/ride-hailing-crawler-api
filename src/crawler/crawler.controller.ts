import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { CrawlerService } from './crawler.service';

@Controller('check-violation')
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}
  @Get()
  async check(
    @Query('plate') plate: string,
    @Query('vehicleType') vehicleType: string, 
  ) {
    if (!plate) {
      throw new BadRequestException('Thiếu biển số xe');
    }

    const normalizedPlate = plate.trim().toUpperCase().replace(/[-\s]/g, '-');

    let loaiXe: string;
    const typeLower = vehicleType.toLowerCase();

    switch (typeLower) {
      case 'car':
        loaiXe = '1'; // Ô tô
        break;
      case 'motorbike':
        loaiXe = '2'; // Xe máy
        break;
      case 'electric_bike':
        loaiXe = '3'; // Xe điện
        break;
      default:
        throw new BadRequestException(
          'Loại xe không hợp lệ. Chỉ chấp nhận: car, motorbike, electric_bike',
        );
    }

    const result = await this.crawlerService.checkViolationsRealtime(normalizedPlate, loaiXe);

    return {
      success: true,
      licensePlate: normalizedPlate,
      vehicleType: typeLower, // trả về loại xe đã dùng để Gin biết
      timestamp: new Date().toISOString(),
      ...result,
    };
  }
}