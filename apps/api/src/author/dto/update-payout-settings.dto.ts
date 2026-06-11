import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdatePayoutSettingsDto {
  @IsString()
  @IsIn(["bank_ec", "paypal", "payphone", "manual"])
  method!: "bank_ec" | "paypal" | "payphone" | "manual";

  /**
   * Detalles libres por método. Ejemplos:
   *  - bank_ec: { bankName, accountType: "ahorros|corriente", accountNumber, accountHolder }
   *  - paypal:  { email }
   *  - payphone: { phone, accountHolder }
   *  - manual:  { instructions }
   * Nada se valida server-side aquí — finanzas confirma manualmente
   * antes de pagar. Cap 4000 chars en JSON.stringify para evitar spam.
   */
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalAddress?: string;
}
