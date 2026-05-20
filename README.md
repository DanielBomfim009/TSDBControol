# TSDBControol

Aplicativo financeiro premium para controle pessoal de emprestimos, juros, atrasos, pagamentos e cobrancas via WhatsApp.

## Estrutura final

- `index.html`: estrutura principal do PWA e modais.
- `styles.css`: visual dark premium, mobile-first, cards, menus, formularios e responsividade.
- `app.js`: persistencia local, calculos automaticos, dashboards, relatorios, filtros, backup e WhatsApp.
- `manifest.webmanifest`: configuracao de instalacao do PWA.
- `sw.js`: service worker para cache offline dos arquivos principais.
- `icons/`: icones do aplicativo.

## Funcionalidades

- Dashboard inicial com totais, lucro, clientes, vencimentos e atrasados.
- Cadastro e edicao de emprestimos com calculo em tempo real.
- Juros contratado automatico.
- Juros diario por atraso automatico.
- Status automaticos: em dia, vence hoje, proximo do vencimento, atrasado e pago.
- Lista com busca e filtros.
- Agenda de vencimentos, atrasos e cobrancas.
- Menu hamburguer com atalhos operacionais.
- Registro de pagamentos.
- Historico e auditoria por emprestimo.
- Relatorios com graficos Chart.js.
- Periodos de relatorio: hoje, 7 dias, mes, ano e tudo.
- Backup JSON, exportacao CSV, importacao, limpeza de dados e configuracoes padrao.
- Cobranca via WhatsApp com mensagens rapidas por contexto.
- Geracao de contrato e recibo para impressao/PDF.
- Protecao local por PIN.

## Publicacao no GitHub Pages

O projeto e estatico e nao precisa de build.

1. Abra `Settings > Pages` no repositorio.
2. Em `Build and deployment`, selecione `Deploy from a branch`.
3. Use a branch `main` e a pasta `/ (root)`.
4. Salve e aguarde a URL do GitHub Pages atualizar.

## Dados

Os dados ficam no `localStorage` do navegador. Para trocar de aparelho ou navegador, use a exportacao e importacao de backup JSON dentro do app.
