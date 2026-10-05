# Template de convite do Financeiro Raio-X

O fluxo atual usa o convite nativo da autenticação. O arquivo `auth-invite-email-template.html` é o conteúdo exato do template **Invite user** e usa apenas variáveis oficiais:

- `{{ .ConfirmationURL }}`: URL real, assinada e gerada pelo serviço de autenticação.
- `{{ .Data.company_name }}`: empresa enviada pelo servidor.
- `{{ .Data.role_label }}`: `Administrador` ou `Colaborador`.
- `{{ .Data.inviter_name }}` e `{{ .Data.inviter_email }}`: identificação do remetente quando disponível.
- `{{ .Data.recipient_name }}`: saudação nominal quando esse dado estiver disponível; caso contrário, o template mostra `Olá!`.

## Configuração obrigatória

1. Configure e verifique um domínio de e-mail pertencente à empresa em **Cloud → Emails**.
2. No template de autenticação **Invite user**, defina o assunto como:

   `Você foi convidado para uma empresa no Financeiro Raio-X`

3. Use o conteúdo de `auth-invite-email-template.html` como corpo HTML do convite.

Enquanto não houver domínio configurado, os convites continuam sendo enviados pelo remetente e template padrão da plataforma. Não é necessário SMTP, Resend ou qualquer segredo adicional.

O template nativo de convite aceita corpo HTML, mas não oferece neste projeto uma configuração separada de multipart/plain-text. O link completo permanece visível no HTML como alternativa acessível ao botão.