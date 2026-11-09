import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../config";

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  /**
   * The PUBLIC base for covers and illustrations. Absent on a private bucket —
   * protected media never uses it.
   */
  private readonly publicUrl: string | undefined;

  constructor(private readonly configService: ConfigService<Env, true>) {
    const accountId = configService.get("R2_ACCOUNT_ID", { infer: true });
    this.bucket = configService.get("R2_BUCKET_NAME", { infer: true });
    this.publicUrl = configService.get("R2_PUBLIC_URL", { infer: true }) as
      | string
      | undefined;

    // Absent in every deployed box: the endpoint derived from the account id,
    // exactly as before. Present only to drive this boundary with a declared
    // local stand-in — see `R2_ENDPOINT` in the env schema for why the
    // recovery rehearsal needs it.
    const endpointOverride = configService.get("R2_ENDPOINT", { infer: true });

    this.client = new S3Client({
      region: "auto",
      endpoint:
        endpointOverride || `https://${accountId}.r2.cloudflarestorage.com`,
      // Only with an override, and only because of how the SDK addresses
      // buckets: by default it puts the bucket in the HOSTNAME
      // (`bucket.host`), which against a stand-in on an address rather than a
      // domain does not resolve. The request would then fail in DNS — safe,
      // but it proves nothing: a call that never leaves is indistinguishable
      // from a call that was never made. Path style makes the stand-in RECEIVE
      // it, so the rehearsal can show where the delete actually went.
      ...(endpointOverride ? { forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: configService.get("R2_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: configService.get("R2_SECRET_ACCESS_KEY", {
          infer: true,
        }),
      },
    });
  }

  /**
   * Store bytes and return their PUBLIC URL.
   *
   * Only for assets that are meant to be public — covers, illustrations,
   * avatars. Protected media (audiobook, podcast, transcripts) stores the
   * OBJECT KEY and is read through `getSignedUrl`; handing one of those a
   * public URL would take it out of the signing path entirely.
   *
   * Throws rather than returning `undefined/key` when no public base is
   * configured. A malformed URL would be persisted and 404 forever, and the
   * failure would surface far from its cause.
   */
  async uploadFile(
    buffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.publicUrl) {
      throw new Error(
        "R2_PUBLIC_URL_NOT_CONFIGURED: this bucket has no public base URL, so it can only serve protected media read through getSignedUrl",
      );
    }

    await this.putObject(buffer, key, mimeType);
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Store bytes and return nothing.
   *
   * The shape protected media needs: the caller keeps the KEY it chose and
   * reads it back with `getSignedUrl`, so no public URL exists to be stored by
   * accident.
   */
  async putObject(
    buffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  /**
   * Delete ONE object by its exact key.
   *
   * Narrow on purpose, and not a feature: it exists so that bytes written for a
   * record that then fails to persist do not linger unreferenced. Callers pass a
   * key they minted moments earlier and nothing else — there is no prefix form,
   * no list-and-delete, and no product surface that reaches this.
   *
   * Never call it on a key that something already published points at. Deleting
   * a master to "roll back" would take content away from readers who have it.
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
