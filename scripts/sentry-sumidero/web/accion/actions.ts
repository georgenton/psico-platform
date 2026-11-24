"use server";

export async function accionQueFalla(formData: FormData): Promise<void> {
  const texto = String(formData.get("texto"));
  throw new TypeError(
    `Cannot read properties of undefined (reading '${texto}')`,
  );
}
