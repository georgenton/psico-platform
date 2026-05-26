import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsIn,
  Matches,
} from "class-validator";

const VALID_PLANS = ["FREE", "PRO", "ANNUAL", "B2B"] as const;

export class CreateBookDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase kebab-case (e.g. mi-libro)",
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @IsIn(VALID_PLANS)
  plan: (typeof VALID_PLANS)[number];
}
