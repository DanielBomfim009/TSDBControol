# TSDB

Aplicacao pessoal para controle de emprestimos, recebimentos, atrasos e vencimentos.

## Stack atual

- `HTML`
- `CSS`
- `JavaScript` modular
- `PWA` com `manifest.webmanifest`
- `Service Worker` para cache basico
- `localStorage` para persistencia inicial

## Estrutura

- `index.html`: casca principal da aplicacao
- `src/app.js`: logica da interface, calculos e persistencia local
- `src/styles.css`: identidade visual escura com dourado
- `src/data/mockData.js`: base inicial de demonstracao
- `src/utils/format.js`: formatadores de moeda, data e percentual
- `manifest.webmanifest`: configuracao do PWA
- `sw.js`: cache offline inicial

## Publicacao no GitHub Pages

Como o projeto e estatico, ele pode ser publicado direto no GitHub Pages sem etapa de build.

### Opcao 1: Publicar pela branch principal

1. Suba os arquivos para o repositorio no GitHub.
2. Entre em `Settings > Pages`.
3. Em `Build and deployment`, selecione:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
4. Salve e aguarde o link do Pages ser gerado.

### Opcao 2: Publicar com GitHub Actions

Se preferir, voce pode adicionar um workflow depois, mas para esta versao nao e necessario.

## Dados

Atualmente os dados ficam no navegador via `localStorage`.

Isso significa:

- o app funciona sem servidor
- cada navegador/dispositivo tera sua propria base local
- o backup manual em JSON e importante

## Proximos passos recomendados

- trocar `mockData` por fluxo completo de uso real
- adicionar edicao e exclusao de clientes/emprestimos/pagamentos
- criar detalhes por cliente e por emprestimo
- migrar a persistencia para `IndexedDB`
- adicionar protecao local por PIN
