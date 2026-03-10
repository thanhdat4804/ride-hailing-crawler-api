export class ViolationDetailDto {

  time: string

  location: string

  description: string

  code: string

  status: string

}

export class CheckViolationResponseDto {

  licensePlate: string

  hasViolation: boolean

  message: string

  violation?: ViolationDetailDto

}