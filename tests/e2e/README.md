# Testes E2E

Os testes Playwright estão divididos por modo de build: `local/` corre num build sem Supabase, `account/` num build com configuração Supabase fictícia em que Auth e `/api/account` são simulados por mocks HTTP (`tests/helpers/account/mock-backend.ts`), e `supabase-real/` contra uma stack Supabase local descartável. Os comandos e a preparação de cada modo estão na secção [Validação do README](../../README.md#validação): `npm run test:e2e -- tests/e2e/local/`, `TEST_ACCOUNT_AUTH=1 npm run test:e2e -- tests/e2e/account/` e `npm run test:e2e:supabase-real`. A configuração `config/playwright.config.ts` define os projetos `desktop` (Desktop Chrome) e `mobile` (iPhone 13 em Chromium). Os testes com a tag `@desktop-only` são excluídos do projeto `mobile` por `grepInvert`; outros saltam um projeto em runtime com `test.skip`, o que está indicado na coluna "Projetos".

## Local

Build sem configuração Supabase. Salvo indicação, as respostas de `/api/market` e `/api/geography` são simuladas no navegador. Os testes de `local/entry-without-account.spec.ts` só correm com `TEST_NO_ACCOUNT_CONFIG=1`, como na CI.

### `local/entry-without-account.spec.ts`

Página de entrada e ligações Auth num build sem contas.

| Teste                                                                                          | O que verifica                                                                                                                                                                                | Projetos         |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| entrada sem Supabase conserva acesso explícito ao modo local                                   | A entrada indica que as contas estão indisponíveis, sem botão de login nem dashboard; "Continuar sem sessão" abre a Visão Geral, que se mantém após recarregar.                               | desktop e mobile |
| limpar callback Auth sem Supabase e preservar modo local (`fragmento`/`query`/`código`/`erro`) | Uma ligação com tokens, código ou erro Auth mostra o aviso de ligação inválida, remove esses parâmetros do URL mantendo os restantes, não faz pedidos Auth e permite continuar no modo local. | desktop e mobile |

### `local/security/auth-callback.spec.ts`

Limpeza de ligações Auth com tokens, no servidor e no cliente.

| Teste                                                                 | O que verifica                                                                                                                                                                                                                                     | Projetos   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| rejeitar tokens por HTTP sem servir a página e preservar códigos PKCE | Um pedido com tokens na query recebe 303 para `/?preservar=1#error=invalid_callback`, com `no-store`, `no-referrer` e sem o segredo no corpo; um código PKCE isolado recebe 200 e `/api/account` com token na query responde 401 sem redirecionar. | só desktop |
| limpar a query mesmo sem JavaScript e substituir o fragmento original | Com JavaScript desativado, a página fica só com `?preservar=1` e o fragmento `#error=invalid_callback`, sem o segredo no HTML.                                                                                                                     | só desktop |
| limpar antes da hidratação e rejeitar sem pedidos Auth                | Com os scripts da aplicação retidos, o URL já está limpo antes da hidratação; depois aparece o aviso de ligação inválida, o fragmento é removido, não há pedidos Auth e é possível continuar no modo local.                                        | só desktop |

### `local/security/content-security-policy.spec.ts`

Content Security Policy com nonce por documento.

| Teste                                                                         | O que verifica                                                                                                                                                                                                                                                          | Projetos   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| documentos têm nonce novo, hidratação funcional e bloqueiam scripts sem nonce | Em `/` e `/definicoes`, cada resposta tem um nonce novo, ignora o nonce e a CSP enviados pelo cliente, não usa `unsafe-eval` nem cache; um script e um handler `onload` injetados no HTML são bloqueados (`script-src-elem` e `script-src-attr`) e a aplicação hidrata. | só desktop |

### `local/security/market-api.spec.ts`

Validação de parâmetros da API de mercado.

| Teste                                                           | O que verifica                                                                  | Projetos   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| API rejeita datas e símbolos inválidos antes de consultar Yahoo | `/api/market` responde 400 a uma data impossível e a um ticker em forma de URL. | só desktop |

### `local/navigation/mobile-nav.spec.ts`

Navegação inferior e gaveta de navegação no telemóvel.

| Teste                                                                     | O que verifica                                                                                                                                                                                                                                                                       | Projetos                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| barra inferior permite navegar e mantém o conteúdo acessível no telemóvel | No telemóvel, a barra inferior navega por teclado entre Posições, Transações e Visão geral com uma só ligação ativa, não tapa o último conteúdo e desaparece na impressão e em largura de desktop. No desktop confirma apenas que a barra está oculta e a navegação lateral visível. | desktop e mobile            |
| gaveta móvel contém o foco, fecha pelo fundo e adapta-se ao desktop       | A gaveta mantém o foco no interior, fecha ao tocar no fundo e devolve o foco ao botão do menu, também após Escape ou diálogos de criar e renomear carteira; ao alargar para desktop passa a sidebar não modal.                                                                       | só mobile (skip em runtime) |

### `local/navigation/routes.spec.ts`

Rotas por carteira, redirecionamentos e parâmetro de retorno.

| Teste                                                                                                       | O que verifica                                                                                                                                     | Projetos                     |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| abre diretamente transações e mantém a rota após recarregar                                                 | Abrir `/carteira/<id>/transacoes` mostra Transações e o URL mantém-se após recarregar.                                                             | desktop e mobile             |
| redireciona uma carteira inexistente com aviso                                                              | Uma carteira desconhecida no URL redireciona para a primeira carteira com um aviso.                                                                | desktop e mobile             |
| a raiz regressa à última carteira aberta                                                                    | A carteira escolhida no seletor fica gravada como a última aberta e `/` redireciona para ela.                                                      | desktop e mobile             |
| preserva q ao recarregar a pesquisa                                                                         | A pesquisa de posições fica no parâmetro `q` e mantém-se após recarregar.                                                                          | desktop e mobile             |
| mostra 404 com ligação para as carteiras                                                                    | Um caminho desconhecido mostra "Página não encontrada" com ligação para `/`.                                                                       | desktop e mobile             |
| usa o id codificado de uma carteira com caracteres especiais (`carteira # especial?`/`carteira%20especial`) | Depois de restaurar um backup com esse id, o URL usa o id codificado uma única vez e a carteira fica selecionada.                                  | desktop e mobile             |
| a pesquisa acompanha o URL ao abrir todas as posições e ao voltar                                           | A pesquisa da visão geral passa para Posições através de "Ver todas", limpar atualiza o URL e voltar atrás repõe o valor anterior.                 | só desktop (skip em runtime) |
| link aberto antes de entrar passa pela página inicial e regressa                                            | Sem escolha de modo na sessão, um link profundo leva a `/?voltar=…` e, após continuar sem sessão, regressa ao destino com a pesquisa.              | desktop e mobile             |
| o retorno só aceita caminhos do próprio site                                                                | Valores de `voltar` externos, com `//`, tabulação, quebra de linha, barra invertida ou `javascript:` são ignorados e levam à carteira por omissão. | desktop e mobile             |
| o retorno mantém os outros parâmetros do endereço                                                           | `/?voltar=/definicoes&manter=1` leva a `/definicoes?manter=1`.                                                                                     | desktop e mobile             |
| links curtos e o endereço antigo das definições continuam a funcionar                                       | `/carteira/<id>` redireciona para a visão geral e `/conta` para `/definicoes`.                                                                     | desktop e mobile             |

### `local/navigation/sidebar.spec.ts`

Sidebar de navegação e lista de carteiras.

| Teste                                                                                   | O que verifica                                                                                                                                                                                                                                | Projetos                     |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| recolher navegação mantém atalhos no desktop e devolve foco no telemóvel                | No desktop, recolher deixa uma barra estreita com atalhos funcionais e reabrir repõe a largura e o foco; no telemóvel, a gaveta fecha por botão ou Escape e devolve o foco ao menu. Não há deslocamento horizontal e a gaveta não é impressa. | desktop e mobile             |
| sidebar com dez carteiras mantém navegação, lista e rodapé alcançáveis                  | Com dez carteiras e alturas de 800, 600 e 480 px, a lista desloca-se internamente com o cabeçalho alinhado ao topo, e a navegação, a última carteira e o rodapé continuam alcançáveis sem deslocamento horizontal.                            | só desktop (skip em runtime) |
| percorrer muitas carteiras sem sobrepor navegação e rodapé                              | Com 30 carteiras, a última carteira e o rodapé são alcançáveis (no desktop, a navegação e o rodapé ficam inteiros e o cabeçalho da lista é fixo) e selecionar a última carteira funciona.                                                     | desktop e mobile             |
| dimensionar sidebar por arrasto e teclado respeita limites e mantém o conteúdo alinhado | Arrastar e as teclas de seta, Home e End ajustam a largura entre 224 e 420 px, o conteúdo principal acompanha, a largura mantém-se ao fechar e reabrir e, em largura de telemóvel, a pega desaparece e a gaveta usa largura própria.          | só desktop (skip em runtime) |

### `local/appearance/responsive-ui.spec.ts`

Layout responsivo do seletor de carteiras, listas e formulário de transação.

| Teste                                                                        | O que verifica                                                                                                                                                                                                                                                                                        | Projetos         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| trocar carteira pelo seletor e abrir conta pela navegação móvel              | O seletor alterna entre uma carteira EUR com posição e uma carteira USD vazia; no telemóvel, a navegação inferior abre Conta sem deslocamento horizontal a 320 e 375 px e regressa a Posições na mesma carteira.                                                                                      | desktop e mobile |
| manter listas e formulários legíveis nas larguras do handoff                 | De 375 a 1440 px, Posições e Transações mostram a linha dentro do ecrã sem deslocamento horizontal e o diálogo "Nova transação" cabe sem deslocamento.                                                                                                                                                | desktop e mobile |
| respeitar a densidade das referências e calcular a pré-visualização da ordem | No desktop o gráfico tem altura entre 300 e 380 px e as posições aparecem acima da dobra; no telemóvel a lista aparece perto do topo. O formulário calcula o total da ordem, mantém-no na venda e mostra "—" com quantidade inválida; cancelar fecha o formulário sem alterar as carteiras guardadas. | desktop e mobile |

### `local/appearance/theme.spec.ts`

Tema claro, escuro ou do sistema e a sua persistência local.

| Teste                                                                        | O que verifica                                                                                                                                                                                                 | Projetos         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| seguir o sistema por omissão e voltar a segui-lo nas definições              | Sem preferência o tema segue o sistema; Escuro ou Claro (também por setas) persiste após recarregar e ignora o sistema; voltar a Sistema apaga a preferência e volta a seguir o sistema, sem erros na consola. | só desktop       |
| ignorar preferência inválida e sincronizar entre separadores                 | Um valor inválido gravado é tratado como Sistema; mudar o tema noutro separador atualiza este e limpar o armazenamento volta a Sistema.                                                                        | só desktop       |
| sincronizar tema com dashboard aberto noutro separador                       | Escolher Escuro e depois Sistema nas definições de outro separador altera o tema de um dashboard já aberto, e o seletor deste reflete a escolha.                                                               | só desktop       |
| sincronizar o botão rápido da entrada com o seletor                          | Ativar o tema escuro na página de entrada deixa "Escuro" selecionado nas definições.                                                                                                                           | só desktop       |
| permitir mudar tema quando o armazenamento está bloqueado                    | Com leitura e escrita da preferência a falhar, escolher Escuro aplica o tema.                                                                                                                                  | só desktop       |
| manter a preferência entre controlos quando a escrita no armazenamento falha | Com a escrita a falhar, o tema escuro escolhido na entrada mantém-se nos outros controlos de tema e nas definições.                                                                                            | só desktop       |
| apresentar dados e diálogos em escuro e imprimir em claro                    | Em tema escuro, os valores importados aparecem e a página e o diálogo de importação cabem sem deslocamento horizontal; na impressão o esquema passa a claro e os controlos de tema ficam ocultos.              | desktop e mobile |

### `local/dashboard/csv-import.spec.ts`

Importação de CSV e valores calculados a partir dela.

| Teste                                                                  | O que verifica                                                                                                                                                                                                                                                                        | Projetos         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| consultar e descarregar o exemplo antes de escolher o CSV              | O diálogo de importação mostra o exemplo de CSV, o modelo descarregado (`modelo_site_ativos.csv`) é igual ao exemplo e importá-lo grava 2 transações.                                                                                                                                 | desktop e mobile |
| importar, calcular, persistir, filtrar e imprimir                      | Um CSV com duas compras e uma venda produz o valor, o ganho e a rentabilidade esperados no resumo, na posição e em cada transação (venda realizada e lotes FIFO); os dados persistem após recarregar, a pesquisa vazia mostra mensagem e a tabela cabe na impressão A4 sem a sidebar. | desktop e mobile |
| falha de mercado e CSV inválido não inventam valores nem perdem ordens | Com o mercado a responder 503, aparece o alerta, o valor fica "—" e a rentabilidade "Indisponível", mas o ganho realizado mantém-se; um CSV com venda superior à posição é bloqueado na revisão e as ordens gravadas ficam intactas.                                                  | desktop e mobile |

### `local/dashboard/csv-review.spec.ts`

Revisão e edição das linhas de um CSV antes de importar.

| Teste                                                                            | O que verifica                                                                                                                                                                                                     | Projetos         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| rever e cancelar não grava nem consulta o mercado                                | Escolher um CSV abre a revisão com a carteira de destino e os valores lidos, sem gravar nem pedir mercado ou geografia; cancelar mantém o armazenamento igual.                                                     | desktop e mobile |
| corrigir todos os campos e validar vendas antes de importar atomicamente         | Linhas inválidas bloqueiam a confirmação; após editar todos os campos, uma venda excessiva continua bloqueada até ser corrigida e só então as duas ordens corrigidas são gravadas juntas.                          | só desktop       |
| duplicados existentes e internos exigem decisão e atualizam ao editar ou excluir | Linhas iguais a ordens existentes ou entre si são assinaladas como possíveis duplicados e bloqueiam a confirmação; excluir ou editar atualiza a contagem e um duplicado só é importado após confirmação explícita. | só desktop       |
| paginar conserva edições e exclusões e encontra erros fora da primeira página    | Com 26 linhas, a revisão pagina a 25, "Ver primeiro erro" leva à linha inválida na página seguinte e as edições e exclusões da primeira página mantêm-se até gravar.                                               | só desktop       |
| falha de gravação conserva o editor e as edições                                 | Se gravar no `localStorage` falhar, o diálogo mantém-se com o aviso e as edições, e o armazenamento não muda.                                                                                                      | só desktop       |
| destino fica fixo mesmo que a seleção mude durante a leitura do ficheiro         | Mudar de carteira enquanto o ficheiro é lido não altera o destino: as ordens vão para a carteira original e a outra fica vazia.                                                                                    | desktop e mobile |
| revisão mantém tabela utilizável nos dois temas e fica fora da impressão         | Em tema claro e escuro, de 320 a 1440 px, a revisão não provoca deslocamento horizontal e os campos recebem foco; na impressão o diálogo fica oculto e as métricas visíveis.                                       | desktop e mobile |

### `local/dashboard/geography-speed.spec.ts`

Carregamento da geografia separado dos preços e validação da API de geografia.

| Teste                                                                         | O que verifica                                                                                                                                                                                                                                     | Projetos         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| mostrar preços antes da geografia e reutilizar pedidos pendentes e resultados | Os preços aparecem enquanto a geografia carrega; o pedido de geografia envia só os tickers das posições abertas e atualizar preços, mudar de página ou de carteira com o mesmo ticker reutiliza o pedido pendente e o resultado (um único pedido). | desktop e mobile |
| resposta antiga não altera a geografia da carteira selecionada                | Uma resposta lenta da primeira carteira não substitui a geografia da carteira entretanto selecionada; ao voltar à primeira, aparece o resultado dela.                                                                                              | desktop e mobile |
| falha geográfica não bloqueia preços nem é repetida ao atualizar              | Com a geografia a responder 503, os preços aparecem, a distribuição fica "Sem classificação" e atualizar preços não repete o pedido.                                                                                                               | desktop e mobile |
| validar pedidos geográficos antes de consultar fontes                         | `/api/geography` responde 400 sem tickers, com um símbolo inválido ou com mais de 20 tickers.                                                                                                                                                      | só desktop       |

### `local/dashboard/geography.spec.ts`

Distribuição da carteira por ETFs e por continente.

| Teste                                                                                         | O que verifica                                                                                                                                                                                                                     | Projetos         |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| mostrar exposição geográfica ponderada, cobertura e fonte em ecrã e impressão                 | A distribuição agrupa os países por continente com o peso esperado, inclui a parte sem classificação, a cobertura, a ligação para a fonte, a data e o número de posições, e mantém esta informação na impressão.                   | desktop e mobile |
| exposição sem composição permanece sem classificação e moeda incompatível impede percentagens | Sem composição, o ativo fica 100% "Sem classificação"; com cotação noutra moeda, o gráfico é substituído pela mensagem que exige cotações na moeda da carteira.                                                                    | desktop e mobile |
| agrupar composição completa apenas por continentes em ecrã e impressão                        | Com 23 países, a lista mostra apenas os 5 continentes, sem países nem botão "Países", e as linhas não transbordam o painel no ecrã nem na impressão.                                                                               | desktop e mobile |
| alternar distribuição no mesmo card e alinhar altura com a rentabilidade                      | O card alterna entre ETFs e Geografia sem mudar o layout; no desktop tem a altura e o topo do gráfico de rentabilidade. Na impressão mostra a geografia e oculta o seletor e a vista de ETFs.                                      | desktop e mobile |
| explorar fatias dos ETFs e continentes por rato, toque e teclado                              | As fatias de ETFs e continentes são selecionáveis por rato (desktop), toque (telemóvel) e teclado, com destaque e percentagem, e um ativo com cotação zero aparece com 0%; na impressão a seleção é removida e mostra a cobertura. | desktop e mobile |

### `local/dashboard/overview.spec.ts`

Visão geral, estados vazios, menu de ações e metodologia impressa.

| Teste                                                                      | O que verifica                                                                                                                                                                                                                                                                   | Projetos         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| mostrar o resumo apenas na visão geral                                     | Métricas e gráficos só aparecem na Visão geral; Posições e Transações mostram o próprio título, uma faixa de 3 métricas, a tabela e a pesquisa, sem deslocamento horizontal e também na impressão.                                                                               | desktop e mobile |
| distinguir carteira vazia de posições fechadas                             | Uma carteira vazia mostra estados vazios próprios em Posições e Transações; depois de uma compra e venda total, Posições indica que não há posições abertas e o filtro "Fechadas" mostra a posição fechada.                                                                      | desktop e mobile |
| ações agrupadas acessíveis por teclado e metodologia completa na impressão | O menu de ações abre com Enter e fecha com Escape devolvendo o foco; `transacoes.csv` exportado tem exatamente as ordens importadas, pela ordem de registo, e o menu fecha. As datas do eixo não se sobrepõem e a metodologia, recolhida no ecrã, aparece completa na impressão. | desktop e mobile |
| acomodar totais elevados nos cartões e recuperar de um filtro sem vendas   | Com uma transação de valor muito elevado, o filtro "Vendas" vazio mostra mensagem e permite voltar a todas; a 360 e 390 px os montantes ficam numa linha dentro da célula.                                                                                                       | desktop e mobile |

### `local/dashboard/performance-chart.spec.ts`

Gráfico de rentabilidade: métricas, períodos e dados intradiários.

| Teste                                                                                        | O que verifica                                                                                                                                                                                                                                                                      | Projetos         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| explorar rentabilidade por rato, toque e teclado sem confundir o histórico com o valor atual | "Posições atuais" e "Desempenho da carteira" mostram valores distintos; o último ponto indica "Atual", o teclado percorre as datas históricas sem benchmark e o seletor tem alvos de toque de pelo menos 44 px. A impressão oculta leitura, cursor e seletor.                       | desktop e mobile |
| distinguir preço histórico zero de retorno atual zero                                        | Com o preço atual igual ao custo, o retorno atual é +0%, enquanto um fecho histórico zero aparece como -100% no gráfico.                                                                                                                                                            | desktop e mobile |
| alternar ROI total e posições abertas com FIFO no resumo, histórico e impressão              | "Desempenho da carteira" mostra o ROI sobre todas as compras e "Posições atuais" o ganho com custo FIFO, no resumo, no histórico e na impressão; sem dados ambos ficam "Indisponível" e, após fechar a posição, o valor atual fica indisponível mas o histórico anterior mantém-se. | desktop e mobile |
| Os sete períodos recalculam o destaque e o hover sem benchmark                               | Em 1D, 5D, 1M, 6M, YTD, 1A e Máximo, nos dois modos, o destaque e o último ponto mostram a rentabilidade esperada do período, o 1D usa as observações intradiárias em horas UTC e nunca aparece benchmark; o YTD mantém-se na impressão.                                            | desktop e mobile |
| 1D preenche falhas curtas, identifica estimativas e mantém interrupções longas               | No 1D, falhas de até 15 minutos são preenchidas e marcadas como "Estimado", enquanto uma interrupção mais longa fica "Indisponível" e parte a linha em dois segmentos.                                                                                                              | desktop e mobile |
| 1D sem observações intradiárias não desenha uma reta com os fechos diários                   | Sem dados intradiários, o 1D mostra "Sem dados intradiários neste dia" e "Indisponível" sem gráfico interativo; o período Máximo volta a mostrar o gráfico.                                                                                                                         | desktop e mobile |

### `local/dashboard/period-preferences.spec.ts`

Períodos predefinidos do gráfico e das posições nas definições locais.

| Teste                                                                    | O que verifica                                                                                                                                                                                                                         | Projetos         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| guardar e aplicar o período predefinido do gráfico                       | O período escolhido nas definições é gravado e aplicado ao abrir o gráfico; os botões do gráfico mudam só a vista sem alterar a preferência, e o valor gravado `max` seleciona "Máximo".                                               | desktop e mobile |
| preferência das posições é independente do gráfico e das escolhas locais | As preferências de período das posições e do gráfico são independentes, são gravadas e mantêm-se após recarregar; mudar o período na tabela não altera a preferência e a lista compacta da visão geral não usa o rótulo desse período. | desktop e mobile |

### `local/dashboard/portfolios.spec.ts`

Renomear e eliminar carteiras locais.

| Teste                                                                        | O que verifica                                                                                                                                                                                                    | Projetos         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| renomear por botão direito ou edição preserva seleção, transações e gravação | Renomear por clique direito (desktop), botão (telemóvel) ou Shift+F10 rejeita nomes vazios, remove espaços, mantém a carteira selecionada e as transações e cancelar não altera; após recarregar só o nome mudou. | desktop e mobile |
| conflito ao renomear mostra erro no diálogo e preserva a versão mais recente | Se a carteira mudar noutro separador durante a edição, gravar mostra erro no diálogo e não sobrescreve; ao cancelar aparece a versão mais recente com aviso de alteração noutro separador.                        | desktop e mobile |
| eliminar a última carteira local mantém uma carteira vazia no navegador      | Eliminar a única carteira cria uma carteira vazia nova, com outro id e sem ordens, que persiste após recarregar.                                                                                                  | desktop e mobile |

### `local/dashboard/positions.spec.ts`

Tabela de posições: pesquisa, períodos, ordenação e cotações ausentes.

| Teste                                                                                       | O que verifica                                                                                                                                                                                                                                                                 | Projetos         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| manter pesquisas independentes e permitir limpar resultados vazios                          | Cada página (Visão geral, Posições, Transações) guarda a sua pesquisa; pesquisas sem resultados mostram mensagem e "Limpar pesquisa" repõe a lista. Na impressão o título da página aparece sem o nome da carteira.                                                            | desktop e mobile |
| ganhos de compras fechadas e vendas permanecem sem cotação atual                            | Sem cotações, a compra fechada e a venda mostram o ganho realizado, enquanto a compra ainda aberta mostra "—" em vez de zero.                                                                                                                                                  | desktop e mobile |
| período da tabela é independente, aplica-se às posições abertas e adapta-se a telemóvel     | Os períodos da tabela (1D a Máximo) calculam a rentabilidade e o ganho de cada período sem alterar a preferência do gráfico; posições fechadas mostram o ganho realizado e o seletor continua visível a 390 px sem deslocamento horizontal.                                    | desktop e mobile |
| organizar posições por estado, valor e rentabilidade sem confundir zero com cotação ausente | A tabela ordena por valor, rentabilidade e ativo, mostra exatamente "0,00 €" para cotação zero e distingue-a de cotação ausente ou noutra moeda ("—", com aviso de moeda), filtra fechadas e todas, cabe de 360 a 1440 px e mostra detalhes e contexto do filtro na impressão. | desktop e mobile |

### `local/dashboard/storage-recovery.spec.ts`

Conflitos entre separadores, backups JSON e armazenamento corrompido.

| Teste                                                                      | O que verifica                                                                                                                                                                     | Projetos         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| alteração noutro separador impede sobrescrita                              | Depois de um separador gravar uma importação, uma importação no segundo separador falha com aviso de alteração noutro separador e as ordens gravadas pelo primeiro mantêm-se.      | só desktop       |
| restaurar backup JSON e assinalar cotações noutra moeda                    | Restaurar um backup seleciona a carteira recuperada, que persiste após recarregar; com cotação em USD numa carteira EUR, o valor fica "—" e a posição indica a diferença de moeda. | desktop e mobile |
| armazenamento corrompido preserva dados até reposição explícita            | Dados corrompidos abrem "Recuperar carteiras" sem os alterar; é possível exportá-los tal como estão, recusar a reposição sem perda e, após confirmar, criar carteiras novas.       | desktop e mobile |
| reposição de armazenamento corrompido preserva alterações noutro separador | Se outro separador gravar dados válidos antes da reposição, repor é recusado com aviso e os dados novos ficam intactos.                                                            | só desktop       |

### `local/dashboard/transactions.spec.ts`

Registo, filtros, ordenação e remoção de transações.

| Teste                                                                               | O que verifica                                                                                                                                                                                                                                                      | Projetos         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| escolher tickers da carteira e registar um novo ativo                               | A nova transação lista os tickers da carteira, incluindo os fechados, e preenche o nome; um ticker novo também é aceite, as duas ordens são gravadas e o novo ticker passa a constar da lista.                                                                      | desktop e mobile |
| registar ordens, bloquear venda excessiva e criar carteira                          | Uma compra é gravada e uma venda acima da posição é recusada com erro; uma nova carteira USD fica selecionada com o formulário vazio e o backup `carteiras.json` exportado contém exatamente as carteiras guardadas, incluindo a nova.                              | desktop e mobile |
| filtrar e ordenar transações, consultar detalhes e preservar a validação de remoção | As transações aparecem da mais recente para a mais antiga, com filtros, pesquisa, ordenação e detalhes, cabem de 360 a 1440 px e na impressão sem botões de remoção; remover uma compra é permitido, mas uma remoção que deixaria uma venda sem posição é recusada. | desktop e mobile |

## Conta

Build com a configuração pública fictícia descrita no README. Auth e `/api/account` são respondidos pelos mocks de `tests/helpers/account/mock-backend.ts`, por isso estes testes verificam a interface, o isolamento do estado e os pedidos enviados, não o SQL nem o RLS. Todos os ficheiros saltam sem `TEST_ACCOUNT_AUTH=1`; os testes de CAPTCHA exigem também `TEST_CAPTCHA=1` e um build com site key Turnstile fictícia, como na CI.

### `account/auth-locks.spec.ts`

Exclusão mútua dos pedidos Auth entre separadores (Web Locks), login, renovação e logout.

| Teste                                                                                | O que verifica                                                                                                                                                                                              | Projetos   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| login pendente bloqueia fecho, Escape e reentrada até concluir                       | Com o login pendente, o diálogo não fecha por botão nem Escape e os campos ficam desativados; ao concluir abre a conta, e sair e entrar com outro utilizador mostra as carteiras deste.                     | só desktop |
| pedidos Auth noutro separador não ultrapassam um login pendente                      | Um login noutro separador, durante um login pendente, é recusado com aviso de pedido em curso e não envia pedidos Auth.                                                                                     | só desktop |
| recuperar, alterar palavra-passe e sair mantêm os pedidos pendentes protegidos       | Com os pedidos de recuperação, nova palavra-passe e logout pendentes, o diálogo não fecha e o login fica desativado até a resposta chegar.                                                                  | só desktop |
| sem Web Locks não enviar credenciais, incluindo renovação (`false`/`true`/`expired`) | Sem `navigator.locks`, sem sessão gravada, com sessão válida ou expirada, não há pedidos Auth (nem renovação); a aplicação avisa que não pode proteger os pedidos e permite continuar no modo local.        | só desktop |
| sessão expirada não renova com o lock ocupado e permite tentar novamente             | Com o lock Auth ocupado, uma sessão expirada não é renovada nem a conta é lida; libertado o lock, o login funciona com uma única renovação.                                                                 | só desktop |
| renovação por temporizador e foco respeita um lock noutro separador                  | Enquanto outro separador detém o lock, o temporizador e os eventos de foco tentam obter o lock mas não enviam pedidos de renovação; libertado o lock, há uma única renovação e a conta continua utilizável. | só desktop |
| temporizador não renova durante logout nem restaura a sessão depois                  | Uma sessão expirada gravada durante um logout pendente não é renovada (o temporizador e o foco nem pedem o lock) nem restaurada; no fim a sessão é apagada e não há renovações posteriores.                 | só desktop |
| logout com erro limpa uma sessão gravada durante o pedido                            | Mesmo com o logout a responder com erro, a sessão gravada durante o pedido é apagada e não volta a ser renovada.                                                                                            | só desktop |
| renovação pendente mantém o lock até persistir e bloqueia logout concorrente         | Durante uma renovação pendente o lock fica ocupado e sair é recusado com aviso, sem pedido de logout; depois de gravada a nova sessão, o lock é libertado e o logout apaga a sessão definitivamente.        | só desktop |

### `account/captcha.spec.ts`

Verificação Turnstile simulada nos formulários Auth.

| Teste                                                                        | O que verifica                                                                                                                                                                                 | Projetos         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| CAPTCHA mantém o nonce do documento após navegar para as definições da conta | Depois de sair pelas definições, o script Turnstile carregado no login usa o nonce CSP do documento; o login com token envia um único pedido e a sessão mantém-se ao recarregar as definições. | desktop e mobile |
| CAPTCHA expira e cada tentativa Auth exige um token novo                     | O login só fica ativo com um token válido e volta a desativar-se quando o token expira ou após uma falha; as duas tentativas enviam tokens diferentes e o formulário cabe no ecrã.             | desktop e mobile |
| CAPTCHA bloqueado permite repetir a verificação sem enviar Auth              | Com o script Turnstile bloqueado, o registo fica desativado com aviso e sem pedidos Auth; repetir a verificação carrega-a e um timeout volta a desativar o registo.                            | só desktop       |

### `account/data.spec.ts`

Dados da conta: migração de carteiras locais, criação, eliminação, CSV e backups.

| Teste                                                                                | O que verifica                                                                                                                                                                                                          | Projetos         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| migração local explícita é repetível e conserva dados dos dois modos                 | Copiar as carteiras locais para a conta só acontece após confirmação e envia-as com uma chave de migração; repetir reutiliza a mesma chave sem duplicar e as carteiras locais ficam intactas.                           | desktop e mobile |
| conta vazia permite criar a primeira carteira sem copiar dados locais                | Numa conta sem carteiras, a nova transação fica desativada até criar uma carteira; a criação é gravada como carteira nova e a primeira transação incrementa a revisão, sem tocar nos dados locais.                      | desktop e mobile |
| eliminar a última carteira da conta mantém a conta vazia após confirmação e recarga  | A interface só remove a última carteira depois de a conta confirmar a remoção com a revisão esperada; a conta fica vazia, também após recarregar, e permite criar uma nova carteira.                                    | desktop e mobile |
| recarregar conta limpa as pesquisas de todos os separadores e preserva os títulos    | "Recarregar dados da conta" limpa as pesquisas de cada página da carteira sem enviar gravações.                                                                                                                         | desktop e mobile |
| CSV remoto é atómico, conserva ordem no mesmo dia e só envia tickers/data ao mercado | A importação grava compra e venda do mesmo dia pela ordem do ficheiro numa única gravação; os pedidos de mercado e geografia levam só tickers e data inicial; um CSV com venda excessiva é rejeitado sem nova gravação. | só desktop       |
| restauro JSON na conta valida todas as carteiras antes do lote com revisões          | Um backup com uma carteira inválida é rejeitado sem gravar; um backup válido substitui as carteiras da conta num único lote com exatamente as duas alterações e as revisões esperadas.                                  | só desktop       |

### `account/entry-local-mode.spec.ts`

Página de entrada com contas disponíveis e alternância com o modo local.

| Teste                                                                                        | O que verifica                                                                                                                                                                                                                | Projetos         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| entrada exige escolha, permite teclado e conserva o modo local só na mesma aba               | A entrada oferece login, registo e modo local sem ler carteiras locais nem pedir conta ou mercado; escolher o modo local por teclado abre as carteiras locais, que se mantêm ao recarregar, mas uma aba nova volta à entrada. | desktop e mobile |
| modo local continua utilizável se o navegador bloquear sessionStorage                        | Com `sessionStorage` bloqueado, continuar sem sessão abre as carteiras locais.                                                                                                                                                | desktop e mobile |
| sidebar local permite registo e login sem duplicar controlos no dashboard                    | No modo local a sidebar oferece login e registo sem os repetir no dashboard; após o login, as definições mostram a conta, o modo local mostra as carteiras locais e recarregar mantém a conta, sem gravações remotas.         | desktop e mobile |
| terminar sessão diretamente na sidebar preserva carteiras locais (modo local `false`/`true`) | Sair pela sidebar, no modo conta ou no modo local, faz logout, apaga a sessão e volta à entrada; as carteiras locais ficam intactas e a sidebar passa a oferecer "Iniciar sessão".                                            | desktop e mobile |
| recuperação local permite iniciar sessão sem repor dados corrompidos                         | Com dados locais corrompidos, a página de recuperação permite ir à conta e iniciar sessão; os dados corrompidos ficam intactos e não há gravações.                                                                            | desktop e mobile |
| ignorar resposta pendente depois de mudar para modo local                                    | Uma gravação de tema na conta ainda pendente quando se muda para o modo local não altera o tema local nem a cache do tema da conta.                                                                                           | desktop e mobile |

### `account/password.spec.ts`

Registo, recuperação de acesso e reautenticação para alterar a palavra-passe.

| Teste                                                                       | O que verifica                                                                                                                                                                              | Projetos         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| registo pede confirmação por email e recuperação envia ligação              | O registo pede confirmação por email sem abrir a conta e "Esqueci a palavra-passe" envia o pedido de recuperação; com CAPTCHA ativo, ambos os pedidos levam token.                          | desktop e mobile |
| alteração de palavra-passe pede código quando Auth exige reautenticação     | Quando o Auth exige reautenticação, gravar a nova palavra-passe pede um código enviado uma única vez; um código inválido mostra erro sem novo envio e um código válido conclui a alteração. | desktop e mobile |
| falha ao enviar código permite reenviar sem perder recuperação              | Uma falha no envio do código permite reenviar mantendo a palavra-passe escrita; se entretanto entrar outra sessão, a recuperação fecha com aviso.                                           | só desktop       |
| mudar de sessão durante envio de reautenticação descarta a conclusão antiga | Se a sessão mudar enquanto o código é enviado, a recuperação fecha com aviso, a resposta tardia é ignorada e nenhum código é submetido.                                                     | só desktop       |

### `account/recovery-pkce.spec.ts`

Validação das ligações Auth com PKCE e proteção do formulário de recuperação.

| Teste                                                                                                   | O que verifica                                                                                                                                                                        | Projetos   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| o parâmetro recovery isolado não autoriza alteração de palavra-passe                                    | `?recovery=1` sem código mostra ligação inválida, não abre o formulário nem envia palavra-passe e é removido do URL; a sessão existente mantém-se.                                    | só desktop |
| recuperação PKCE valida o verifier antes de definir palavra-passe                                       | Uma recuperação pedida neste navegador troca o código com o verifier, permite definir a nova palavra-passe e limpa o URL; reutilizar a ligação é rejeitado.                           | só desktop |
| confirmação PKCE abre a conta sem autorizar formulário de recuperação                                   | O registo usa PKCE (`s256`) e a ligação de confirmação, mesmo com `recovery=1`, abre a conta sem o formulário de nova palavra-passe.                                                  | só desktop |
| recuperação PKCE válida não é apagada pela sessão anterior expirada                                     | Com uma sessão anterior expirada e a renovação a falhar, a ligação de recuperação abre o formulário sem tentar renovar a sessão antiga.                                               | só desktop |
| callback PKCE inválido preserva a renovação da sessão anterior                                          | Um código não pedido é rejeitado sem pedidos Auth e a sessão anterior continua a ser renovada normalmente.                                                                            | só desktop |
| uma sessão recebida após a troca PKCE não herda o formulário de recuperação                             | Se outro separador gravar outra sessão logo após a troca do código, abre a conta desse utilizador sem o formulário de recuperação.                                                    | só desktop |
| renovar o token da mesma sessão conserva a recuperação e usa o token atual                              | Uma renovação do token da mesma sessão mantém o formulário e a palavra-passe escrita, e a alteração é enviada com o token renovado.                                                   | só desktop |
| outra sessão do mesmo utilizador invalida a recuperação (`33333333-…`/`sem identificador`)              | Uma nova sessão do mesmo utilizador, com outro identificador de sessão ou sem ele, fecha o formulário com aviso e nenhuma palavra-passe é enviada.                                    | só desktop |
| revalidar a sessão dentro do lock impede submissão sem evento de mudança                                | Se outra sessão foi gravada sem o evento chegar a este separador, submeter deteta a mudança, fecha o formulário e não envia a palavra-passe.                                          | só desktop |
| rejeitar sessão por tokens na ligação e preservar sessão anterior (`false`/`true`, `fragmento`/`query`) | Tokens de sessão no fragmento ou na query são rejeitados sem pedidos Auth nem gravações; a sessão anterior, se existir, mantém-se, o URL fica limpo e os dados locais ficam intactos. | só desktop |
| código sem verifier não inicia sessão nem substitui sessão anterior (`false`/`true`)                    | Um código sem verifier local é rejeitado sem pedidos Auth e removido do URL; a sessão anterior mantém-se ou continua a não haver sessão.                                              | só desktop |
| query contaminada rejeita código PKCE válido sem consumir o verifier nem a sessão anterior              | Um código válido acompanhado de tokens na query é rejeitado sem pedidos Auth; o verifier e a sessão anterior mantêm-se e o URL fica só com os parâmetros não Auth.                    | só desktop |
| código com verifier incorreto é rejeitado sem alterar carteiras                                         | Com o verifier errado, a troca falha, aparece o aviso de ligação inválida, não fica sessão gravada e não há gravações.                                                                | só desktop |

### `account/session.spec.ts`

Ciclo de vida da sessão, isolamento entre utilizadores e cabeçalhos de segurança.

| Teste                                                                             | O que verifica                                                                                                                                                                                                                          | Projetos         |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| iniciar sessão, alternar modo, sair e trocar utilizador preserva isolamento local | O login mostra só as carteiras da conta e alternar o modo troca entre carteiras locais e da conta; sair volta à entrada e esquece a escolha de modo, outro utilizador não vê as carteiras do anterior e os dados locais ficam intactos. | desktop e mobile |
| resposta pendente da conta não volta a apresentar dados depois de sair            | Uma gravação que termina depois do logout não volta a mostrar dados da conta na página de entrada.                                                                                                                                      | só desktop       |
| respostas incluem proteção contra enquadramento e fuga de referrer                | `/` e `/api/account` enviam CSP com `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff` e `no-referrer`; `/` usa nonce e `strict-dynamic` sem `unsafe-eval`, e `/api/account` sem sessão responde 401 sem cache.               | só desktop       |
| restaurar uma sessão válida aguarda Auth sem abrir carteiras locais               | Enquanto a renovação da sessão está pendente, mostra "A verificar sessão…" sem dashboard, opção local nem leitura de carteiras locais; concluída, abre a conta, e recarregar volta à conta mesmo após escolher o modo local.            | só desktop       |
| sessão expirada e refresh inválido devolvem a escolha sem montar carteiras        | Se a renovação falhar, volta à entrada com aviso, sem ler a conta, gravar nem pedir mercado; continuar sem sessão abre as carteiras locais intactas.                                                                                    | só desktop       |
| login pode ser repetido após falhar a recuperação da sessão expirada              | Depois de falhar a renovação de uma sessão expirada, um novo login funciona.                                                                                                                                                            | só desktop       |

### `account/settings.spec.ts`

Definições da conta, preferências sincronizadas e tema.

| Teste                                                                                | O que verifica                                                                                                                                                                                                    | Projetos         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| abrir definições aguarda o restauro inicial da sessão                                | Abrir as definições durante o restauro da sessão espera que este termine e depois mostra as definições da conta, sem gravações nem alteração dos dados locais.                                                    | só desktop       |
| preservar tema entre entrada, conta, modo local e saída                              | Com tema local escuro e tema da conta claro, cada modo usa o seu: a entrada e o modo local ficam escuros e as definições da conta claras; após sair e entrar com preferência clara, as definições ficam em claro. | desktop e mobile |
| acesso direto às definições sem sessão permite continuar local e voltar às carteiras | `/conta` sem sessão passa pela entrada e, no modo local, abre as definições com login e registo na sidebar e sem "Sair da conta"; o registo pede confirmação e a navegação para Posições funciona.                | desktop e mobile |
| definições mantêm acesso à conta e bloqueiam carteiras locais corrompidas            | Com dados locais corrompidos, mudar para o modo local mantém a conta acessível nas definições com alerta de recuperação, desativa "Criar carteira" e recusar a reposição não altera os dados.                     | desktop e mobile |
| definições mostram falhas de recarga e confirmação de cópia local                    | Uma falha a recarregar a conta mostra um alerta que desaparece após uma recarga bem-sucedida, e copiar as carteiras locais mostra a confirmação.                                                                  | só desktop       |
| preferências da conta guardam tema e período sem alterar preferências locais         | Mudar o tema e os períodos nas definições grava-os nos metadados do utilizador e numa cache da conta, sem alterar as preferências locais, e mantém-nos após recarregar.                                           | só desktop       |
| falha ao guardar preferência repõe o valor confirmado e permite fechar aviso         | Se gravar o período do gráfico falhar, aparece um aviso que se pode fechar, o seletor volta a "Máximo" e as preferências da conta e a sessão guardada mantêm os valores confirmados.                              | só desktop       |
| versão futura de preferências é só de leitura                                        | Preferências com uma versão futura mostram aviso; tema e período não mudam e não há pedidos de gravação.                                                                                                          | só desktop       |
| pintura inicial usa a cache da conta antes da preferência local                      | Com a cache da conta em escuro e a preferência local em claro, a página nunca pinta em claro antes de aplicar o tema escuro.                                                                                      | só desktop       |
| escolhas rápidas de tema guardam a última sem aviso                                  | Várias escolhas de tema seguidas, com a primeira gravação pendente, terminam com o último tema gravado e sem aviso de erro.                                                                                       | só desktop       |

### `account/sync-conflicts.spec.ts`

Gravações na conta com revisões, conflitos entre dispositivos e falhas.

| Teste                                                                                                | O que verifica                                                                                                                                                                                                | Projetos         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| gravar espera pela confirmação da conta, incrementa revisão e não grava localmente                   | Renomear mostra "A guardar…" e só atualiza a interface quando a conta confirma; a revisão é incrementada, nada é gravado localmente e o nome persiste após recarregar.                                        | desktop e mobile |
| conflito entre dispositivos preserva dados e exige recarga explícita                                 | Se a carteira mudou noutro dispositivo, gravar mostra o conflito e mantém o diálogo sem sobrescrever; depois de recarregar a conta, a nova gravação usa a revisão atual.                                      | só desktop       |
| falha de gravação mantém diálogo e valores confirmados                                               | Uma falha 503 mostra erro e mantém o diálogo com o nome escrito, enquanto a carteira e a revisão ficam como estavam.                                                                                          | só desktop       |
| remover pela tabela de transações da conta aguarda confirmação e preserva conflitos (`false`/`true`) | Remover uma transação só altera a tabela após a confirmação da conta; sem conflito fica removida e a revisão sobe, com conflito as duas transações mantêm-se com aviso e recarregar a conta limpa a pesquisa. | desktop e mobile |
| revisão CSV da conta aguarda confirmação e conserva edições perante conflito                         | A revisão de CSV não grava nem pede mercado; durante a gravação o diálogo fica bloqueado e só fecha após a confirmação com os valores editados; perante conflito (409), mantém as edições e a conta não muda. | só desktop       |

## Supabase real

Corre só com `npm run test:e2e:supabase-real`, que cria uma stack Supabase local descartável (Auth, Mailpit, PostgREST, PostgreSQL, migrations e RLS) e usa `config/playwright.supabase-real.config.ts`, com um único projeto `supabase-real-chromium` (Desktop Chrome). Detalhes no README.

### `supabase-real/supabase-real.spec.ts`

Integração real com Auth, RPC e RLS.

| Teste                                                           | O que verifica                                                                                                                                                                                                                          | Projetos   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| registo exige confirmação real por email antes de abrir a conta | O registo pela interface não devolve sessão e o login antes de confirmar falha com `email_not_confirmed`; a ligação recebida no Mailpit conclui a troca PKCE, limpa o URL, abre a conta confirmada e permite criar a primeira carteira. | só desktop |
| Auth, RPC, persistência e isolamento entre duas contas locais   | A carteira criada pela conta A aparece na RPC `get_account_portfolios` com revisão 1, é legível por A sob RLS e persiste após recarregar; a conta B não a vê (RPC e tabela) e a carteira criada por B não aparece a A.                  | só desktop |

## Manter este catálogo

Atualizar a tabela correspondente no mesmo PR que acrescenta, remove ou muda o propósito de um teste E2E. Os testes são identificados pelo título exato usado no Playwright, que é também o que aparece em `npx playwright test --list` e nos relatórios.
