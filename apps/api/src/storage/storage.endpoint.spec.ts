import { describe, expect, it, vi } from "vitest";

const construcciones: Array<Record<string, unknown>> = [];
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(opts: Record<string, unknown>) {
      construcciones.push(opts);
    }
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  DeleteObjectCommand: class {},
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));

const { StorageService } = await import("./storage.service");

/**
 * `R2_ENDPOINT` existe para poder gobernar la frontera de almacenamiento con un
 * sustituto local declarado — la tercera costura de la misma clase que
 * `VOYAGE_BASE_URL`, y la que faltaba.
 *
 * Lo que NO puede hacer es cambiar nada cuando no está. Esta es la mitad que
 * importa: dos procesadores BORRAN objetos por aquí, y una caja desplegada no
 * declara esta variable. Si su ausencia moviera el destino aunque fuese un
 * carácter, el arreglo del ensayo habría roto producción.
 */

const BASE = {
  R2_ACCOUNT_ID: "cuenta123",
  R2_ACCESS_KEY_ID: "ak",
  R2_SECRET_ACCESS_KEY: "sk",
  R2_BUCKET_NAME: "un-bucket",
};

type Config = { get: (clave: string, opts?: unknown) => unknown };
const config = (valores: Record<string, unknown>): Config => ({
  get: (clave) => valores[clave],
});

const construir = (extra: Record<string, unknown> = {}) => {
  construcciones.length = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new StorageService(config({ ...BASE, ...extra }) as any);
  return construcciones[0]!;
};

describe("StorageService · destino del cliente", () => {
  it("sin la variable, el destino se deriva de la cuenta — como en toda caja desplegada", () => {
    expect(construir().endpoint).toBe(
      "https://cuenta123.r2.cloudflarestorage.com",
    );
  });

  it("y sin la variable NO se fuerza el estilo de ruta: producción queda igual", () => {
    // La adición de `forcePathStyle` es la única otra diferencia que introduce
    // la costura. Si se filtrara al camino sin override, cambiaría cómo se
    // direccionan TODOS los objetos de producción.
    expect(Object.keys(construir())).not.toContain("forcePathStyle");
  });

  it("con la variable vacía tampoco: una cadena vacía no es un destino", () => {
    const opts = construir({ R2_ENDPOINT: "" });
    expect(opts.endpoint).toBe("https://cuenta123.r2.cloudflarestorage.com");
    expect(Object.keys(opts)).not.toContain("forcePathStyle");
  });

  it("con un destino declarado, se usa ese y sólo ese", () => {
    const opts = construir({ R2_ENDPOINT: "http://127.0.0.1:4566" });
    expect(opts.endpoint).toBe("http://127.0.0.1:4566");
    // Y el bucket viaja en la RUTA, para que el sustituto reciba la llamada en
    // vez de morir resolviendo `un-bucket.127.0.0.1`.
    expect(opts.forcePathStyle).toBe(true);
  });

  it("las credenciales siguen siendo las declaradas, con override o sin él", () => {
    for (const extra of [{}, { R2_ENDPOINT: "http://127.0.0.1:4566" }]) {
      expect(construir(extra).credentials).toEqual({
        accessKeyId: "ak",
        secretAccessKey: "sk",
      });
    }
  });
});
