# Contrato HTTP de autenticação

A API usa route → controller → service → adaptador Supabase. A gestão de cookies pertence à fronteira HTTP. Não existem sessões nem carteiras em memória partilhada do servidor.

## Sessão

Respostas de sucesso: `{configured:true,session:{user:{id,email},sessionKey,recovery}}`, com `session:null` quando não há sessão. Configuração indisponível pode devolver `{configured:false,session:null}` no endpoint de sessão. Nunca devolver access/refresh tokens. Erros públicos sanitizados: `{error,code?}`.

O cookie de sessão contém um envelope cifrado/autenticado com AES-256-GCM e chave `AUTH_SESSION_SECRET` (32 bytes em base64). Guarda os tokens, validade, identidade, geração aleatória e vínculo de recuperação. A geração pública `sessionKey` mantém-se durante a renovação e muda num novo login/callback. Não substitui a verificação Auth nem autoriza acesso por si só.

Cookies host-only, HttpOnly, Path=/, SameSite=Lax e Secure em HTTPS, com prefixo `__Host-`. HTTP sem Secure só em loopback. PKCE usa cookie cifrado separado, com prazo curto e intenção do fluxo vinculada ao verifier. Configurar a mesma chave em todas as instâncias do ambiente. Não usar secret/service-role do Supabase como chave.

## Endpoints

| Endpoint                        | Pedido                         | Resultado                                                        |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| POST `/api/auth/login`          | email, password, captchaToken? | Nova sessão                                                      |
| POST `/api/auth/register`       | email, password, captchaToken? | Confirmação por email ou sessão, conforme política Auth          |
| POST `/api/auth/recover`        | email, captchaToken?           | Resposta genérica e verifier PKCE protegido                      |
| POST `/api/auth/callback`       | code                           | Troca PKCE com o cookie; recuperação só para a intenção validada |
| GET `/api/auth/session`         | Cookies                        | Leitura sem renovação nem Set-Cookie                             |
| POST `/api/auth/session`        | Cookies                        | Restauro e renovação quando necessário                           |
| POST `/api/auth/refresh`        | sessionKey?                    | Renovação explícita                                              |
| POST `/api/auth/password`       | password, nonce?, sessionKey   | Alteração vinculada à sessão de recuperação                      |
| POST `/api/auth/reauthenticate` | sessionKey                     | Código adicional por email                                       |
| POST `/api/auth/logout`         | sessionKey?                    | Revogação local no fornecedor e limpeza dos cookies              |

Mutações exigem `Origin` igual à origem do pedido, `Content-Type: application/json` e `X-Requested-With: rendimentos`; rejeitam origem cruzada em Fetch Metadata. Os pedidos Auth têm limite de corpo de 16 KB. A geração esperada pode ser enviada em `X-Account-Session`; password, reautenticação, logout e refresh não podem afetar uma sessão diferente da apresentada. Redirects são derivados da origem do pedido; não são aceites do corpo.

## Carteiras e concorrência

`GET/POST /api/account` recebem exclusivamente a sessão do cookie e exigem `X-Account-Session` correspondente. O servidor valida o JWT no Supabase e encaminha o mesmo token à RPC/RLS. O POST exige a mesma proteção de origem/JSON/header. Os limites, revisões, contratos CSV e cálculos permanecem inalterados.

Login, logout, callback e restauro/renovação usam Web Lock exclusivo no navegador, incluindo o tempo necessário para aplicar Set-Cookie. A API de carteira não renova cookies, evitando que um pedido antigo restaure uma sessão depois de logout. Perante 401, o cliente tenta restauro sob lock e só repete o pedido se a geração continuar igual. Não repete conflitos nem falhas de gravação.

`BroadcastChannel` transporta apenas sinais de mudança; cada separador invalida o estado anterior e consulta a sessão. Dados privados continuam limitados ao workspace montado. O servidor compara a geração antes de executar uma operação, protegendo uma aba com dados da conta A após login da conta B noutra aba.

## Migração e validação externa

É necessário voltar a iniciar sessão ao instalar esta versão. Não são adotados tokens antigos do localStorage; apenas as chaves Auth conhecidas são removidas. Carteiras locais e esquema SQL não mudam. Links PKCE antigos exigem novo pedido. Rodar o segredo invalida cookies existentes.

Manter confirmação/recuperação a voltar a `/` e `/?recovery=1`, no mesmo navegador e origem. Os parâmetros Auth são limpos antes de trabalho assíncrono; tokens em URL continuam rejeitados. Um callback inválido não substitui a sessão anterior. A flag recovery na URL não concede recuperação.

Testes determinísticos usam mocks e não comprovam email, CAPTCHA, revogação, RLS ou implantação reais. Antes de disponibilizar, configurar o segredo no ambiente e validar os fluxos com contas fictícias no Supabase e Vercel. A migração de camadas não promete redução de latência.
