# TSDB Empréstimos

Aplicativo financeiro premium para controle pessoal de empréstimos, juros, atrasos, pagamentos e cobranças via WhatsApp.

## Estrutura final

- `index.html`: estrutura principal do PWA e modais.
- `styles.css`: visual dark premium, mobile-first, cards, menus, formulários e responsividade.
- `app.js`: persistência local, cálculos automáticos, dashboards, relatórios, filtros, backup e WhatsApp.
- `manifest.webmanifest`: configuração de instalação do PWA.
- `sw.js`: service worker para cache offline dos arquivos principais.
- `icons/`: ícones do aplicativo.
- `assets/`: logomarca própria da TSDB Empréstimos.

## Funcionalidades

- Dashboard inicial com totais, lucro, clientes, vencimentos e atrasados.
- Tela inicial de configuração do primeiro saldo disponível da carteira.
- Saldo disponível da carteira com atualização automática por empréstimos e pagamentos.
- Tela Carteira com histórico automático de movimentações do saldo.
- Tela Clientes com lista limpa e detalhes completos somente após selecionar um cliente.
- Cadastro e edição de empréstimos com formulário direto e cálculo em tempo real.
- Juros contratado automático.
- Juros diário por atraso automático.
- Status automáticos: em dia, vence hoje, próximo do vencimento, atrasado e pago.
- Lista com busca e filtros.
- Lista de empréstimos sem detalhe aberto por padrão para reduzir poluição visual.
- Agenda de vencimentos, atrasos e cobranças.
- Menu hambúrguer com atalhos operacionais.
- Registro de pagamentos.
- Histórico e auditoria por empréstimo.
- Relatórios com gráficos premium em SVG/CSS, sem depender de build.
- Períodos de relatório: hoje, 7 dias, mês, ano e tudo.
- Backup JSON, exportação CSV, importação, limpeza de dados e configurações padrão.
- Cobrança via WhatsApp com mensagens rápidas por contexto.
- Geração de contrato e recibo para impressão/PDF.
- Proteção local por PIN.

## Publicação no GitHub Pages

O projeto é estático e não precisa de build.

1. Abra `Settings > Pages` no repositorio.
2. Em `Build and deployment`, selecione `Deploy from a branch`.
3. Use a branch `main` e a pasta `/ (root)`.
4. Salve e aguarde a URL do GitHub Pages atualizar.

## Dados

Os dados ficam no `localStorage` do navegador. Para trocar de aparelho ou navegador, use a exportação e importação de backup JSON dentro do app.
