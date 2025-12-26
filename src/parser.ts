export function parseResult(rawText: string) {
  const labels = {
    license_plate: 'Biển kiểm soát',
    plate_color: 'Màu biển',
    vehicle_type: 'Loại phương tiện',
    violation_time: 'Thời gian vi phạm',
    violation_location: 'Địa điểm vi phạm',
    violation_raw: 'Hành vi vi phạm',
    status: 'Trạng thái',
    detecting_unit: 'Đơn vị phát hiện vi phạm',
    resolving_unit: 'Nơi giải quyết vụ việc',
    resolving_address: 'Địa chỉ',
  };

  const result: any = {};

  const labelKeys = Object.keys(labels) as Array<keyof typeof labels>;
  for (let i = 0; i < labelKeys.length; i++) {
    const key = labelKeys[i];
    const label = labels[key];
    const nextLabel = i < labelKeys.length - 1 ? labels[labelKeys[i + 1]] : null;
    let regexStr = `${label}\\s*:\\s*([\\s\\S]*?)`;
    if (nextLabel) {
      regexStr += `(?=\\n\\s*${nextLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:|$)`;
    } else {
      regexStr += '$';
    }
    const regex = new RegExp(regexStr, 'i');
    const match = rawText.match(regex);
    result[key] = match ? match[1].trim().replace(/\n\s*/g, ' ') : null;
  }

  return result;
}

export function normalizeViolation(data: any) {
  let code: string | null = null;
  let description: string | null = null;

  if (data.violation_raw) {
    const codeMatch = data.violation_raw.match(/^(\d+\.\d+\.\d+\.[a-zA-Z]+\.\d+\.)/);
    if (codeMatch) {
      code = codeMatch[1];
      description = data.violation_raw.slice(codeMatch[1].length).trim();
    } else {
      description = data.violation_raw.trim();
    }
  }

  return {
    ...data,
    violation_code: code,
    violation_description: description,
  };
}

export function parseVietnameseDatetime(str: string | null): Date | null {
  if (!str) return null;
  const cleanStr = str.trim();
  const match = cleanStr.match(/(\d{2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;

  const [, hour, minute, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}