# IndeCX MCP

Servidor MCP independente para consultar a [API pública da IndeCX](https://github.com/indecx/doc-indecx/blob/main/api.md) no Claude Desktop, Claude Code e clientes MCP. Não é um produto oficial da IndeCX.

Node.js 22 ou superior. TypeScript, SDK oficial MCP, sem banco de dados. A versão inicial é somente leitura; não envia pesquisas nem altera respostas.

## Instalação

Após clonar este repositório:

```sh
npm ci
npm run build
cp .env.example .env
```

Edite `.env` e preencha `INDECX_COMPANY_KEY` com a chave obtida nos dados da conta IndeCX. O arquivo é ignorado pelo Git. Não use tokens internos de sessão do navegador.

```sh
node --env-file=.env dist/index.js
```

O processo aguarda mensagens MCP em stdin. Não é uma interface de terminal interativa. `npm start` lê as variáveis do processo; `npm run dev` também carrega `.env`.

## Claude Desktop

Adicione à configuração MCP do Claude Desktop, substituindo os caminhos por caminhos absolutos da sua máquina:

```json
{
  "mcpServers": {
    "indecx": {
      "command": "node",
      "args": [
        "--env-file=/caminho/indecx-mcp/.env",
        "/caminho/indecx-mcp/dist/index.js"
      ]
    }
  }
}
```

Se o aplicativo não encontrar `node`, use o caminho absoluto do executável. Reinicie o cliente para carregar as ferramentas.

## Claude Code

```sh
claude mcp add --transport stdio indecx -- node --env-file=/caminho/indecx-mcp/.env /caminho/indecx-mcp/dist/index.js
```

## ChatGPT

O ChatGPT usa uma conexão remota, não inicia diretamente o processo stdio do computador. Uma opção para uso privado é o [Secure MCP Tunnel da OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), sujeito às permissões da conta e do workspace.

1. Crie um túnel nas configurações da Platform e instale o `tunnel-client` pelo link da documentação oficial.
2. Configure o túnel para iniciar `node --env-file=/caminho/indecx-mcp/.env /caminho/indecx-mcp/dist/index.js`, ou para encaminhar ao endpoint HTTP abaixo.
3. Mantenha o cliente do túnel ativo e selecione esse túnel ao criar o app em modo desenvolvedor no ChatGPT.
4. Confira as oito ferramentas e faça uma consulta com `limit: 1`.

O túnel atende uso privado. Publicar o código no GitHub não publica um endpoint nem um app no catálogo do ChatGPT. Esta versão não inclui servidor OAuth; para distribuição remota com login, use uma camada de autenticação compatível com o cliente. Consulte os [requisitos atuais de MCP no ChatGPT](https://help.openai.com/en/articles/12584461).

## Streamable HTTP

```sh
MCP_TRANSPORT=http node --env-file=.env dist/index.js
```

Endpoint: `http://127.0.0.1:3000/mcp`. Transporte stateless com respostas JSON; POST é suficiente para as ferramentas. GET/SSE e DELETE retornam 405.

| Variável | Padrão / finalidade |
| --- | --- |
| `INDECX_COMPANY_KEY` | Obrigatória; enviada somente à API IndeCX |
| `MCP_TRANSPORT` | `stdio` ou `http` |
| `HOST` | `127.0.0.1` |
| `PORT` | `3000` |
| `MCP_BEARER_TOKEN` | Segredo próprio do MCP; obrigatório fora de loopback, mínimo de 32 caracteres |

Para clientes que aceitam Bearer estático, configure `Authorization: Bearer <MCP_BEARER_TOKEN>`. Esse token é diferente da chave IndeCX. Para escutar fora de loopback, configure `HOST` e proteja o tráfego com HTTPS em um proxy reverso. O token estático não implementa OAuth.

Uma instância acessa uma única conta IndeCX. Todos os clientes autorizados nessa instância acessam os mesmos dados; execute instâncias separadas para contas distintas. Acesso sem token é permitido apenas no listener de loopback para uso local ou túnel privado. Não exponha esse listener por um proxy público sem autenticação. Requisições com Origin de navegador são rejeitadas.

## Ferramentas

| Ferramenta | Consulta |
| --- | --- |
| `indecx_list_actions` | Pesquisas ativas |
| `indecx_get_action` | Questionário de uma pesquisa |
| `indecx_get_answers` | Respostas e avaliações |
| `indecx_get_invites` | Convites e status |
| `indecx_get_no_response` | Clientes não respondentes |
| `indecx_get_categories` | Respostas categorizadas |
| `indecx_get_blocklist` | Clientes que recusaram contato |
| `indecx_list_branches` | Filiais cadastradas |

Exemplo de argumentos de `indecx_get_answers`:

```json
{
  "actionId": "all",
  "page": 1,
  "limit": 10,
  "startDate": "01-09-2026",
  "endDate": "08-09-2026",
  "dateType": "createdAt"
}
```

Datas seguem DD-MM-YYYY. Respostas e convites aceitam `all`; questionário e não respondentes exigem o identificador da ação. Paginação padrão: página 1, limite 50, máximo 1000 por chamada. As ferramentas retornam o JSON da API sem calcular NPS nem agregar páginas automaticamente. Escolha a pesquisa e o período antes de calcular indicadores.

A documentação de categorias apresenta duas formas de URL; esta implementação usa `/v2/category-info/all`, conforme o exemplo documentado. Disponibilidade e permissões podem variar por conta.
