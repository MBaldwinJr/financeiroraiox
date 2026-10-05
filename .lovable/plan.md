# Plano: convite profissional por e-mail

Manter o fluxo atual de convite e trocar apenas a apresentação e os dados enviados ao e-mail de autenticação.

## Implementação

- Preservar `company_invitations`, suas políticas, o status `failed` e a chamada atual de convite.
- Enriquecer os metadados do convite com empresa, remetente e papel, usando apenas dados validados no servidor.
- Criar o template de convite em português-BR com visual Financeiro Raio-X, CTA ligado à URL real da autenticação, link alternativo e aviso de segurança.
- Usar somente variáveis oficiais do template de autenticação; nenhum endereço de ação será fabricado.
- Manter credenciais administrativas exclusivamente no servidor e substituir o limite de tipagem inseguro já existente.
- Verificar compilação e o fluxo de erro sem alterar a semântica de aceite.

## Dependência externa

O projeto ainda não possui domínio de e-mail configurado. O código e o template podem ser preparados agora, mas o envio com a identidade visual própria só será ativado após configurar e verificar um domínio da empresa. Até lá, convites continuam usando o remetente padrão da plataforma.

## Validação

- Conferir assunto, conteúdo dinâmico e URL real de confirmação.
- Verificar o template em telas estreitas e clientes de e-mail com CSS inline.
- Confirmar que falhas de envio continuam marcando o convite como `failed`.
- Confirmar compilação sem erros.