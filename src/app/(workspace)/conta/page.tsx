import Link from "next/link";

export default function AccountSettings() {
  return <>
    <div className="page-heading"><div><p className="eyebrow">A tua conta</p><h1>Definições da conta</h1><p>Controla a tua sessão e a forma como guardas as tuas carteiras.</p></div></div>
    <Link className="button secondary account-back" href="/">Voltar às carteiras</Link>
  </>;
}
