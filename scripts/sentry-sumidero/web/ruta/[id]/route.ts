export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const cuerpo = await request.text();
  // El caso normal: se llama a la API y la API falla.
  await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/proveedor-ruta`, {
    cache: "no-store",
  });
  throw new Error(`ruta ${params.id} ${cuerpo} ${request.url}`);
}
