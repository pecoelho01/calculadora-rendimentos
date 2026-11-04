import Link from "next/link";

export default function AccountSettings() {
  return <>
    <div className="page-heading"><h1>Definições da conta</h1></div>
    <p className="account-settings-intro">Gere a tua sessão e escolhe onde guardar as tuas carteiras.</p>
    <Link className="button secondary account-back" href="/">Voltar às carteiras</Link>
  </>;
}
