import { accionQueFalla } from "./actions";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <form action={accionQueFalla}>
      <textarea name="texto" id="texto" />
      <button id="enviar">Enviar</button>
    </form>
  );
}
