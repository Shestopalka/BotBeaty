import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLeadDto {
  @IsString() @MinLength(1) @MaxLength(80)
  name: string;

  @IsIn(['instagram', 'telegram'])
  channel: 'instagram' | 'telegram';

  @IsString() @MinLength(1) @MaxLength(120)
  handle: string;

  @IsOptional() @IsString() @MaxLength(60)
  craft?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  text?: string;

  @IsOptional() @IsString() @MaxLength(32)
  source?: string;

  /** Пастка для ботів: поле приховане на сайті, людина його не заповнює. */
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}
