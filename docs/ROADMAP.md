# Atlas · Mercado Automotivo — lista de trabalho

Atualizado em 25/10/2026. Legenda: **feito** (no protótipo, branch `prototipo-reorganizacao`), **próximo** (proposto para a próxima etapa), **depende de você** (decisão, conta ou acesso).

## 1. O que você pediu

| Pedido | Situação |
|---|---|
| Reorganizar o site sem subabas nem gráficos escondidos, design mantido | **feito** — 6 páginas + Laboratório, rolagem contínua, índice de seções |
| Mitsubishi sempre comparada com o resto | **feito** — placar em todas as páginas; página própria; "marca em foco" troca para qualquer marca |
| Manter o ranking conectado | **feito** — em destaque em Concorrência (marcas ou modelos, ano anterior ou período anterior) |
| Mapa fluido com a marca líder por município | **feito** — 5.570 municípios num canvas, arrastar, pinça/Ctrl+rolagem |
| Clicar no estado e ver as informações básicas; navegar pelos municípios | **feito** — resumo ao passar o mouse; clique entra no estado (outros esmaecidos); cartão com total, variação em um ano, por mil habitantes, ranking de marcas e a marca em foco; busca, lista e ‹ › entre municípios; Esc volta |
| Filtros funcionando corretamente | **feito** — barra fixa, território em cascata, tudo no link; o que um gráfico não consegue aplicar aparece escrito |
| Comparar mais contra outras marcas | **feito** — "Comparar marcas" (até 5): volume, variação, participação, posição, venda direta, eletrificados, segmento principal, estado mais forte e linhas de 36 meses |
| Manter os gráficos de conexões | **feito** — Sankey e cordas em Concorrência (carregam ao chegar na seção) |
| Melhorar as animações | **feito em parte** — corrida das marcas nativa (play, linha do tempo, velocidade); demais animações seguem no Laboratório · **próximo**: mapa no tempo e bolhas nativos |
| Dados econômicos novos na base | **feito** — 17 séries com recibo (URL + sha256): juros, prazo, saldo e inadimplência do crédito de veículos, confiança, desemprego, renda e massa real, IBC-Br e IBC-Br Agro, IPCA e IPCA do carro novo, produção (Anfavea), vendas (Fenabrave), soja e boi (Deral/PR) e o cronograma do imposto de importação dos eletrificados |
| Modelagem matemática da economia | **feito** — elasticidades com intervalo de 90% e erros de Newey–West, decomposição do crescimento, simulador com covariância, parcela de referência (Price), validação fora da amostra; testes em `tests/test_econ_model.py` |
| Carregamento rápido da base histórica | **feito em parte** — pré-cálculo de Último mês, Ano atual, 12 meses e Ano passado; consultas pesadas só quando a seção aparece · **próximo**: ver seção 3 |

## 2. Análises, gráficos e mapas sugeridos

**Próximo (alto valor, dados já existem)**
- Mapa no tempo: a líder de cada município mês a mês (play), e a expansão das chinesas por município.
- Rede de concessionárias × demanda: 138 pontos da Rede Mitsubishi sobre o mapa; municípios com demanda de picape média sem concessionária a menos de X km (oportunidade de rede).
- Potencial municipal: emplacamentos esperados por município (renda, população, PIB agro) contra o observado — onde a marca está abaixo do potencial.
- Participação dessazonalizada (X-13) e marcos no tempo: lançamentos, troca L200 → Triton, IPI, imposto de importação.
- Ligar o simulador às projeções: projeção de 12 meses do mercado, do varejo e das picapes médias por cenário.
- Resumo automático do mês: o que mudou acima de limites (participação, posição, estado, segmento), em texto curto, com alerta por e-mail ou Slack.

**Depende de dados externos**
- Preço por versão (FIPE) para posicionamento de preço e preço × volume.
- Produção e exportação por montadora (Anfavea) e estoques em dias.
- Locadoras e frotistas: separar venda direta por tipo de comprador.

## 3. Back-end e dados (velocidade)

Hoje: Cloudflare Pages com 270 MB de arquivos estáticos; o navegador baixa os cubos mensais (≈0,85 MB cada) e calcula num worker; só os períodos rápidos sem filtro vêm prontos.

| Etapa | O que fazer | Ganho | Custo |
|---|---|---|---|
| A · agora, sem servidor | Agregados por mês × UF × município × marca × modelo × porte × canal × propulsão em **Parquet**, servidos pelo **R2** (CDN), consultados com **DuckDB-WASM** no worker (lê só as colunas e blocos necessários); pré-cálculo também por UF e por marca em foco | Filtro qualquer em ~0,3–1 s depois do primeiro carregamento; fim do limite de 25 MB por arquivo do Pages | quase zero |
| B · se o uso crescer | **API na borda**: Cloudflare Worker que recebe o mesmo pedido do worker atual (`marketRequestKey`) e responde de um banco analítico (**ClickHouse Cloud** ou **MotherDuck**), com cache na borda (Cache API/KV) por pedido | Respostas em < 100 ms, qualquer recorte, nada pesado no celular | US$ 50–200/mês |
| C · operação | **GitHub Actions** mensal: novo mês + séries econômicas → derivados → testes → publicação; manifesto versionado; checagens de qualidade (totais, nomes de municípios, classificação BD) | Atualização sem passo manual, auditável | zero |

Recomendação (orçamento de US$ 10/mês): A na próxima etapa (Pages + R2 gratuito), C junto com A; B só se o uso crescer.

## 4. Front-end

- Tirar as camadas antigas: 30+ folhas de estilo e componentes da versão atual depois de portar o que falta (Sankey, cordas, animações) — o pacote JS (1,8 MB) cai bastante.
- Dividir o código por página (carregar só a página aberta) e baixar malhas e dados de mapa sob demanda.
- Guardar no link também o lugar do mapa e as marcas comparadas (link compartilhável de qualquer vista).
- Relatório em PDF de uma página por área; PNG/CSV de cada gráfico (já existe nos cartões).
- Acessibilidade WCAG 2.2 (teclado no mapa e nos gráficos, contraste, leitores de tela) e tema escuro.
- Orçamento de desempenho e medição (Web Vitals) a cada publicação.

## 5. Qualidade e confiança

- Testes: unitários (Node e Python), conferências de auditoria e varredura visual do protótipo, da versão atual e da antiga (`npm run test:visual`).
- Página "Dados e metodologia" nativa: cobertura mensal, regras de classificação, método do modelo econômico, recibos das fontes.
- Versão do cálculo no pré-cálculo (`PRECOMPUTED_CALC_VERSION`) sempre que a resposta do worker mudar.

## 6. Para virar o site oficial

1. Validar o protótipo (você) e listar o que mover, cortar ou manter.
2. Portar Sankey, cordas e animações para componentes nativos; retirar a versão antiga do caminho principal.
3. Etapa A de dados (Parquet + DuckDB-WASM) e o fluxo mensal no GitHub Actions.
4. Revisão de acessibilidade e desempenho; testes visuais no celular.
5. Publicar em `main` (Cloudflare publica sozinho) com a versão atual em `?ui=atual` por um período.

## 7. Decisões (25/10/2026)

- **Acesso:** site aberto. Sem Cloudflare Access.
- **Orçamento:** até US$ 10/mês. Etapa A (Parquet no **R2** + **DuckDB-WASM** no navegador) cabe no plano gratuito do R2 (10 GB e saída sem custo); se precisar de API com cache na borda, **Workers Paid** (US$ 5/mês). A etapa B com banco analítico gerenciado fica fora do orçamento — só se o uso crescer.
- **Anfavea:** os dados detalhados virão de você (produção, exportação e licenciamento por montadora). Quando chegarem: script de carga com recibo, como as demais fontes, e os gráficos de oferta por montadora na Economia e na página da marca em foco.
- **Imposto de importação:** 35% em vigor para elétricos, híbridos e plug-in desde jul/2026 (destacado na Economia).
- **Pendente:** quem recebe o resumo automático do mês (e-mail, Slack) e dados FIPE (preço por versão).
