import Link from "next/link";

export default function NotFound() {
  return (
    <main className="boot">
      <h1>Página não encontrada</h1>
      <p>Este endereço não corresponde a uma página disponível.</p>
      <Link
        className="button primary"
        href="/"
      >
        Voltar às carteiras
      </Link>
    </main>
  );
}
