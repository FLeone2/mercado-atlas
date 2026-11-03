# Atlas · Mercado Automotivo

Painel dos emplacamentos de automóveis e comerciais leves no Brasil, publicado em
https://mercado-atlas.pages.dev. Seis páginas e um laboratório, em rolagem contínua (sem subabas),
uma barra de filtros fixa e a **marca em foco** (Mitsubishi por padrão) sempre comparada com o resto.
Lista de trabalho: `docs/ROADMAP.md`.

| Página | O que tem |
|---|---|
| Resumo | Mapa escuro com o total, placar da marca em foco, de onde veio a variação (mercado, mix, desempenho), ranking, ganhos e perdas, 24 meses |
| Mercado | Ritmo por dia útil (e projeção do mês aberto), 12 meses, ano contra ano, sazonalidade, o que o mercado compra × o que a marca vende, eletrificação, chinesas |
| Concorrência | Ranking conectado (marcas ou modelos), **versões** (ranking conectado por versão e versão × versão entre marcas), comparar marcas, ranking mês a mês, corrida das marcas, duelo, **conexões** (Sankey e cordas), concentração |
| Mitsubishi | Modelos, **versões da marca**, segmentos onde compete (participação, ranking de modelos e de versões), **mês a mês nos segmentos** (crescimento sobre o mês anterior ou o mesmo mês do ano anterior e participação, ao lado do segmento e do mercado), varejo × venda direta, força por estado, onde crescer |
| Territórios | Mapa dos 5.570 municípios (marca líder, volume, por mil habitantes, participação e índice da marca em foco), clique no estado para o cartão e a lista de municípios, **concessionárias Mitsubishi** (aparecem ao aproximar ou dentro do estado; botão para ligar e desligar); estados e regiões |
| Economia | Condições de compra, o que explica o mercado, peso de cada fator, simulador, parcela, imposto de importação, oferta, projeções, potencial regional e análises técnicas (coeficientes, validação, defasagens) |
| Laboratório | Perguntas rápidas, construtor de gráficos (com CSV), mapa no tempo, **mapa de calor**, **três primeiras marcas** (estados em faixas ou 1º·2º·3º lugar; municípios por lugar), **pirâmide de segmentos** (porte ou carroceria; área = volume, com a parte da marca em foco, das chinesas ou dos eletrificados), composição no tempo, Brasil em relevo e dados e metodologia |

- **Filtros.** Período, território em cascata (região → estado → município), marca em foco, porte, propulsão, canal e mais filtros (tipo de veículo, carroceria, combustível, modelo, **versão**, origem, ano de fabricação). Tudo fica no endereço da página. A marca em foco nunca recorta o mercado: é destacada e comparada com ele.
- **Versão** é o campo modelo do registro (Renavam, ex.: `MMC/TRITON HPE AT4`). O site mostra "Triton HPE AT4" e guarda o registro original no ⓘ e no CSV.
- Links antigos (`?a=panorama`, `?ui=atual`…) abrem a página equivalente do Atlas.

## Publicação (Cloudflare Pages)

| Configuração | Valor |
|---|---|
| Framework preset | Nenhum (ou Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variável de ambiente | `NODE_VERSION=22` |

Cada push em `main` publica sozinho. `dist/` leva o app, as fontes e `data/` (sem as fontes brutas de Economia), mais as
fatias por estado e por porte; a pasta `functions/` vira a rota `/api/market`. O build leva ~3 min (pré-cálculo + fatias).
Cabeçalhos de segurança e cache ficam em `public/_headers`.

## Rodar localmente

```sh
npm install
npm run dev                        # http://localhost:5173
npm run build && npm run preview   # versão de produção em http://localhost:8765
```

## Como está organizado

| Pasta | O quê |
|---|---|
| `src/atlas/` | O site: `App.jsx` (páginas, consulta principal, barra), `FilterBar.jsx`, `MapaBrasil.jsx`, `pages/` (uma por página, mais `versoes.jsx`, `conexoes.jsx` e `economia-modelos.jsx`), `charts.jsx`, `lib.js` (nomes, filtros, histórico), `base/` (cartões, gráficos de apoio, mapa dos estados, estilos de base) |
| `src/market/` | O motor: `core.js` (consultas, worker, pré-cálculo, histórico), `modules/` (histórico, nomes de municípios, marcas chinesas, pedido e pré-cálculo), `workers/` (o cálculo sobre os cubos, fora da tela) |
| `src/kit/` | Estado do painel na URL, exportação PNG/CSV e o aviso de erro de tela |
| `data/` | Cubos mensais, cubos de origem, geografia, histórico de 10 anos (`history/national`, `uf` e `versions`), população IBGE, rede Mitsubishi (`reference/concessionarias-mitsubishi.json`), cenários e `snapshot.json` |
| `scripts/` | Histórico, população, cenários, economia, pré-cálculo, fatias (`split-cubes.cjs`), motor do servidor (`build-server.cjs`), aquecimento (`warm-api.cjs`) e `update-derived.sh` |
| `functions/`, `server/` | O cálculo no servidor (Cloudflare Pages Function `/api/market`) |
| `tests/` | Testes automáticos (dados reais) e a varredura visual (`tests/visual/atlas.cjs`) |

`src/market/core.js` usa `/*@include arquivo*/` para juntar os módulos num só escopo e `/*@string a + b*/`
para embutir o código do worker. Quem faz isso é o plugin `atlas-market` em `vite.config.js`.

- **Consulta principal** (`atlas`): o mercado do recorte, a marca em foco e o mesmo período do ano anterior, agrupados por marca, modelo, versão, porte, carroceria, propulsão, canal e UF, mais quem faz cada versão (marca, modelo e porte) e porte/carroceria × marca e × propulsão (pirâmide).
- **Mapa nacional** (`leaders-br`): município × UF × marca numa só consulta.
- **Conexões** (`conexoes`): caminhos origem → canal → combustível → tipo de veículo e as ligações região × marca × combustível.
- **Histórico mensal**: `data/history/national.json.gz` (padrão), `uf.json.gz` (com filtro de estado) e `versions.json.gz` (painéis de versão e filtro de versão). Um filtro que o arquivo não tem aparece escrito embaixo do gráfico.

## Tempo de carregamento

- **Abertura:** os filtros vêm no pacote do site (`virtual:shell`, de `data/snapshot.json`), e o manifesto, o índice do
  pré-cálculo e a resposta da visão padrão começam a baixar junto com o código (`preload` em `index.html`).
- **Pré-cálculo:** `scripts/precompute.cjs` usa o mesmo cálculo do navegador para gerar, sem filtros, Último mês, Ano atual,
  12 meses e Ano passado das três consultas (`data/precomputed.json` + `data/precomputed/*.json.gz`, ~7 MB, ~1 min).
  O site usa um arquivo só quando ele foi gerado do manifesto em uso e responde ao mesmo pedido.
- **Fatias:** `scripts/split-cubes.cjs` separa os últimos 36 meses por estado e por porte (`data/cubes-split/`, ~45 s, não
  versionado). Com um estado (ou um porte) no filtro, o cálculo lê só a fatia, com a mesma resposta.
- **Servidor:** `functions/api/market.js` calcula na Cloudflare com o mesmo motor (`server/engine.js`, gerado por
  `scripts/build-server.cjs`) e guarda cada resposta no cache e no KV `RESPOSTAS`. Fica desligado (404) enquanto o KV não
  estiver ligado ao projeto; então o navegador calcula sozinho. Para ligar: `docs/ROADMAP.md`, seção 3.
- **Aparelho:** `public/sw.js` guarda no aparelho o código e os arquivos de nome único (cubos, fatias, pré-cálculo);
  a página e os índices vêm da rede (com o cache HTTP) e, sem rede ou após 3 s, da cópia guardada. As respostas
  calculadas ficam no IndexedDB por 45 dias. Para desligar o service worker, publique um `sw.js` que só chame
  `self.registration.unregister()`.
- Peças pesadas (versões × versões, conexões) só carregam quando a seção chega perto da tela.
- Pacote do site: ~790 KB de JavaScript (~250 KB comprimido) e ~90 KB de CSS.

## Período

**Último mês**, **Ano atual**, **12 meses** e **Ano passado** seguem o manifesto: quando um mês novo entra, eles avançam
sozinhos; se o mês mais recente vier parcial sem data final, usam o último mês completo. Teste: `tests/period-shortcuts.test.cjs`.

## Nomes de municípios e população

Um só módulo compara nomes de municípios entre registros, malhas do IBGE, pontos e população: `src/market/modules/geo-names.js`
(ignora acentos, apóstrofos e "de/do/da", com uma lista curta de apelidos por UF). Os cálculos por mil habitantes usam
`data/geography/catalog-population.json` (5.571 municípios). Testes: `tests/geo-names.test.cjs` e `tests/test_geo_names.py`.

## Economia

`scripts/fetch_econ_extra.py` (17 séries com recibo: BCB, IBGE/SIDRA, Ipeadata e o cronograma do imposto de importação)
e `scripts/econ_model.py` (elasticidades com erros de Newey–West, decomposição, validação fora da amostra, simulador e parcela).
Ambos rodam em `scripts/update-derived.sh`. Teste: `tests/test_econ_model.py`.

## Testes

```sh
pip install -r scripts/requirements-scenarios.txt   # uma vez, para os testes de Economia
bash scripts/test.sh                                 # Node + Python
npm run build && npm run preview &                   # e então:
npm run test:visual                                  # todas as páginas no desktop e no celular, filtros, mapa, versões, conexões, laboratório
```

`tests/fixtures/data-baseline.json` guarda o SHA-256 de cada arquivo de dados: mudança visual não pode alterar dados.

## Atualizar com um mês novo

1. Baixe o XLSX original e o BD de classificação para uma pasta **fora do repositório**. Instale
   `pip install -r scripts/requirements-import.txt` e gere uma carga em uma pasta temporária:

   ```sh
   python3 scripts/import-month.py --source /caminho/original.xlsx --bd /caminho/classificacao.xlsb \
     --month 2026-10 --source-name 'nome original no Drive.xlsx' \
     --source-modified-time '2026-11-03T12:54:32.976Z' --output-dir /tmp/atlas-month
   ```

   Confira `receipt.json` e reconcilie contagens com o original. A carga preserva duplicidades,
   diagnostica datas e gera apenas agregados públicos. O BD usa somente a aba do ano exato.
   Não envie os arquivos originais para GitHub ou para o diretório público.
2. `python3 scripts/append-month.py --staging /tmp/atlas-month`: valida o cubo, a projeção completa de origem
   e a revisão BD; acrescenta apenas o próximo mês, atualiza manifesto, filtros e snapshot e guarda um recibo
   em `data/imports/`. Não reescreve cubos históricos. A verificação de identificadores entre meses fica
   explicitamente pendente quando as fontes históricas restritas não estão disponíveis.
3. `bash scripts/update-derived.sh`: regenera o histórico (nacional, por estado e por versão), os cenários,
   as séries e o modelo econômico, registra a nova impressão digital dos dados, gera `dist/`
   (com o pré-cálculo) e roda os testes. Fontes oficiais preservam suas próprias datas de referência;
   resultados congelados de Fase 2 no snapshot mantêm sua data original.
4. Revise as alterações, confirme os totais e a preservação dos cubos anteriores, faça commit e push em `main`.

## Cores

Vermelho é exclusivo da marca em foco. Queda usa âmbar; crescimento, verde.
