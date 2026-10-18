# Atlas · Mercado Automotivo

Painel dos emplacamentos de automóveis e comerciais leves no Brasil, com a estética
**Marfim Botânico** do Atlas: fundo marfim, títulos em DM Serif Display, interface em
Inter (as mesmas fontes do Mercado Atlas 2), tinta verde-escura, latão para ação e seleção, filetes no lugar de caixas.

É a reconstrução do `mercado-automotivo-2` com o mesmo conteúdo e a mesma base de dados:
as 8 áreas (Panorama, Evolução, Concorrência, Segmentos, Territórios, Explorar, Economia,
Animações), mais Dados e metodologia, com todos os gráficos, mapas e ferramentas.
Os repositórios `mercado-automotivo`, `mercado-automotivo-2` e `atlas-automotivo` seguem intocados.

## Publicação (Cloudflare Pages)

| Configuração | Valor |
|---|---|
| Framework preset | Nenhum (ou Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variável de ambiente | `NODE_VERSION=22` |

Cada push em `main` publica sozinho. `dist/` leva o app, as fontes e `data/` (sem as fontes brutas de Economia).
Cabeçalhos de segurança e cache ficam em `public/_headers`.

## Rodar localmente

```sh
npm install
npm run dev                 # http://localhost:5173
npm run build && npm run preview   # versão de produção em http://localhost:8765
```

## Como está organizado

| Pasta | O quê |
|---|---|
| `src/kit/` | Os componentes no estilo Atlas: seções, figuras (com CSV e PNG), gráficos SVG, tabelas, campos, seletor de período, diálogos e o estado do painel na URL. |
| `src/market/` | As análises. `core.js` é a montagem; `modules/` tem cada área (mapas, Sankey, histórico, cenários, animações…); `workers/` são os cálculos que rodam fora da tela. |
| `src/styles/atlas.css` | A camada visual Atlas (tokens claro/escuro, cabeçalho, filtros, figuras). É carregada por último. `legacy/` guarda os estilos de layout de cada análise. |
| `data/` | A mesma base do mercado-automotivo-2: cubos mensais, cubos de origem, geografia, histórico de 10 anos, população IBGE, cenários e `snapshot.json` (listas de filtros e séries oficiais). |
| `scripts/` | Histórico, população, cenários e `update-derived.sh`. |
| `tests/` | Testes automáticos (dados reais) e a varredura visual. |

`src/market/core.js` usa `/*@include arquivo*/` para juntar os módulos num só escopo
(eles foram escritos assim) e `/*@string a + b*/` para embutir o código dos workers.
Quem faz isso é o plugin `atlas-market` em `vite.config.js`.

## Período

- **Ano atual** (janeiro até o último mês) e **Último mês** ficam sempre na barra de filtros,
  em todas as áreas. Os dois seguem o manifesto: quando um mês novo entra, eles avançam sozinhos.
  Se o mês mais recente vier parcial e sem data final declarada, os botões usam o último mês completo
  (nunca somem). Teste: `tests/period-shortcuts.test.cjs`.
- **Período personalizado** no seletor: atalhos (último mês, ano atual, últimos 12 meses, ano anterior,
  todo o período), meses de/até e dia inicial/final.
- Ao abrir sem período na URL, o painel mostra o último mês disponível.

## Ferramentas

Copiar link (área + filtros + vistas na URL), favoritos, relatório executivo, exportar recorte (CSV),
CSV e PNG de cada figura (menu ⋯), imprimir/PDF da área ou resumo de uma página, faixa de pulso,
perguntas rápidas, guia "Como confiar nestes números" e tema claro/escuro (☾/☼).

## Testes

```sh
pip install -r scripts/requirements-scenarios.txt   # uma vez, para os testes de Economia
bash scripts/test.sh                                 # Node + Python
node tests/visual/run.cjs                            # com o preview rodando: 13 áreas × claro/escuro × desktop/celular
```

`tests/fixtures/data-baseline.json` guarda o SHA-256 de cada arquivo de dados (o mesmo do
mercado-automotivo-2): mudança visual não pode alterar dados.

## Atualizar com um mês novo

1. Coloque o cubo do mês em `data/cubes/` e `data/origin-cubes/` e atualize `data/manifest.json`
   (mesmo processo de ingestão do mercado-automotivo-2).
2. `bash scripts/update-derived.sh` — regenera o histórico, registra a nova impressão digital dos dados,
   gera `dist/` e roda os testes.
3. Commit e push em `main`.

## Regras de cor

Vermelho carmim é exclusivo da Mitsubishi. Queda usa cobre; crescimento, verde.
Cada marca tem a mesma cor em todas as áreas (FIAT azul, VW âmbar, GM lavanda, BYD verde…).
