import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../config";

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService<Env, true>) {
    const accountId = configService.get("R2_ACCOUNT_ID", { infer: true });
    this.bucket = configService.get("R2_BUCKET_NAME", { infer: true });
    this.publicUrl = configService.get("R2_PUBLIC_URL", { infer: true });

    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configService.get("R2_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: configService.get("R2_SECRET_ACCESS_KEY", {
          infer: true,
        }),
      },
    });
  }

  async uploadFile(
    buffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return `${this.publicUrl}/${key}`;
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
