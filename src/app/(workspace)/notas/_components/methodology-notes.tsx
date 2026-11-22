import { Icon } from "@/components/icon";

type MethodologyNotesProps = {
  isAccountMode: boolean;
};

export function MethodologyNotes({ isAccountMode }: MethodologyNotesProps) {
  function openNoteSection(event: React.MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement).closest("a");
    const target = link?.getAttribute("href")?.slice(1);
    if (target) {
      document
        .getElementById(target)
        ?.closest("details")
        ?.setAttribute("open", "");
    }
  }

  return (
    <div className="notes-layout">
      <aside className="panel notes-index no-print">
        <strong>NESTA PÁGINA</strong>
        <nav
          aria-label="Índice das notas"
          onClick={openNoteSection}
        >
          <a href="#fifo">Custo de aquisição FIFO</a>
          <a href="#roi">Ganho e ROI total</a>
          <a href="#posicoes-abertas">Rentabilidade das posições abertas</a>
          <a href="#ganho-transacao">Ganho por transação</a>
          <a href="#historico">Histórico da carteira</a>
          <a href="#moedas">Moedas, preços e limites</a>
          <a href="#exportar">Guardar e exportar</a>
          <a href="#projeto">Sobre o projeto</a>
        </nav>
      </aside>
      <section className="panel notes">
        <h2>Como calculamos a rentabilidade</h2>
        <h3 id="fifo">Custo de aquisição FIFO</h3>
        <p>
          Cada venda consome primeiro as unidades compradas há mais tempo. O
          ganho realizado é a receita da venda menos o custo desses lotes. O
          custo médio FIFO é a média dos lotes que continuam abertos. No mesmo
          dia, preservamos a ordem de registo das transações.
        </p>
        <div className="formula">
          Ganho realizado = Valor da venda − Custo de aquisição FIFO
        </div>
        <h3 id="roi">Ganho e ROI total</h3>
        <p>
          Ganho não realizado = valor das posições abertas − custo FIFO dos
          lotes restantes. Ganho total = realizado + não realizado. ROI = ganho
          total ÷ valor de todas as compras × 100. Não é uma taxa anualizada nem
          uma rentabilidade ponderada pelo tempo.
        </p>
        <div className="formula">
          ROI total = Ganho total ÷ Compras acumuladas × 100
        </div>
        <p>
          Na tabela de posições, o período é independente do gráfico; as
          posições abertas usam o custo FIFO dos lotes ainda detidos no início
          do intervalo ou o preço de compra dos lotes adquiridos durante ele.
        </p>
        <details className="notes-disclosure">
          <summary id="posicoes-abertas">
            Rentabilidade das posições abertas
            <Icon name="chevron" />
          </summary>
          <p>
            Ganho não realizado ÷ custo FIFO das posições abertas × 100. Sem
            posições abertas, a percentagem fica indisponível. O toggle do
            gráfico permite consultar esta métrica ou o ROI total. No histórico,
            consideramos as posições abertas em cada data; as vendas podem
            alterar a percentagem sem alterar as cotações.
          </p>
        </details>
        <details className="notes-disclosure">
          <summary id="ganho-transacao">
            Ganho por transação
            <Icon name="chevron" />
          </summary>
          <p>
            Nas compras, mostramos o ganho total do lote: o realizado nas vendas
            mais o não realizado das unidades ainda em carteira, sobre o custo
            original da compra. Nas vendas, mostramos o ganho realizado sobre o
            custo FIFO das unidades vendidas. Os preços das transações devem ser
            superiores a zero. Os valores não incluem comissões nem impostos.
          </p>
        </details>
        <details className="notes-disclosure">
          <summary id="historico">
            Histórico da carteira
            <Icon name="chevron" />
          </summary>
          <p>
            Em 1D, usamos observações intradiárias de cinco minutos do dia UTC,
            com horas em UTC e possíveis atrasos. Sem esses dados, o gráfico
            fica indisponível. Em falhas curtas, reutilizamos a última cotação
            válida por até 15 minutos e identificamos o valor como estimado;
            após esse prazo, mantemos a interrupção, mesmo que outra bolsa
            esteja aberta. Como as transações não têm hora, as transações do dia
            aplicam-se a todas as observações desse dia, pela ordem de registo.
            Reconstruímos a carteira com fechos diários em 5D e 1M e semanais
            nos restantes períodos, usando apenas preços desse dia ou
            anteriores, nas datas disponíveis dos ativos da carteira. Em Máximo,
            a carteira mantém os custos originais. Em 1D, 5D, 1M, 6M, YTD e 1A,
            as posições iniciais usam o último fecho anterior ao início efetivo
            do intervalo. A rentabilidade total inclui as compras e vendas do
            período; nas posições abertas, só contam os lotes ainda detidos,
            desde o início do intervalo ou a aquisição. 1D abrange o dia atual e
            5D os últimos cinco dias de calendário. YTD começa em 1 de janeiro.
            As compras entram integralmente na base, sem ponderação temporal.
          </p>
        </details>
        <details className="notes-disclosure">
          <summary id="moedas">
            Moedas, preços e limites
            <Icon name="chevron" />
          </summary>
          <p>
            Os preços das ordens devem estar na moeda da carteira. Cotações
            noutra moeda não são convertidas e impedem a valorização de posições
            abertas. Dividendos, impostos, comissões e ajustes automáticos de
            quantidades por splits não estão incluídos. O Yahoo pode ajustar
            retroativamente os preços históricos por splits; nesses ativos,
            adapta também as transações antes de interpretar a série.
          </p>
        </details>
        <details className="notes-disclosure">
          <summary id="exportar">
            Guardar e exportar
            <Icon name="chevron" />
          </summary>
          <p>
            {isAccountMode
              ? "As carteiras deste modo são guardadas na tua conta e podem ser abertas noutros dispositivos. As carteiras locais permanecem separadas."
              : "Os dados ficam apenas neste navegador. Não sincronizam com outros dispositivos. A limpeza dos dados do navegador remove as carteiras."}{" "}
            Exporta regularmente uma cópia JSON. O CSV contém apenas as
            transações da carteira selecionada. «Relatório PDF» abre a impressão
            do navegador: escolhe «Guardar como PDF».
          </p>
        </details>
        <details className="notes-disclosure">
          <summary id="projeto">
            Sobre o projeto
            <Icon name="chevron" />
          </summary>
          <p>
            Criado por Pedro, estudante de Engenharia Informática, para
            acompanhar investimentos de forma simples. A integração Yahoo
            Finance é não oficial e pode sofrer atrasos ou interrupções.
          </p>
        </details>
      </section>
    </div>
  );
}
