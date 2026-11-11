# CMV × custos dos relatórios comerciais × estoque — conferência assistida

> Documento técnico genérico. O repositório é público: não adicionar valores financeiros, nomes de arquivos internos, funcionários, extratos ou descrições de transações.

## Fontes existentes

1. **DRE por competência:** transações não patrimoniais classificadas em `dre_line = cmv`. O total mensal é obtido pelo motor existente `aggregateByDreLine`, não recalculado por uma regra paralela.
2. **Relatórios comerciais:** `sales.cost_cents` das linhas importadas do PDF de vendas por colaborador, agregadas por `period_start`. Não existe nesta implementação uma integração direta comprovada com a API do ERP.
3. **Inventário:** `inventory_snapshots` com data e custo agregado. Somente snapshots datados do último dia do mês são tratados como *presença de inventário de fechamento*. Um registro feito no meio do mês não substitui o encerramento.

## Interpretação correta

- `CMV - custos importados` mede **divergência entre duas fontes**; diferença não significa erro comprovado.
- Valores exatamente iguais também **não homologam** o CMV; as fontes podem ter sido derivadas uma da outra.
- Não se calcula CMV usando os pagamentos a fornecedores. A conciliação completa depende de estoque inicial, compras líquidas reconhecidas, devoluções, fretes/incidências apropriáveis, ajustes e estoque final.
- `sales.cost_cents` representa custo informado pelo relatório comercial. É necessário validar se inclui devoluções, bonificações, impostos recuperáveis e todas as vendas, antes de considerá-lo fonte definitiva.
- A presença de `period_start` no primeiro dia e `period_end` no último dia apenas verifica a **janela declarada** do relatório; não garante importação completa de todos os vendedores.
- Meses sem PDF exibem custo `null`, e não zero. Meses sem CMV na DRE também aparecem como pendência.
- Divergências de até dois centavos recebem destaque distinto de outras divergências. Esse limiar é apenas visual, não é tolerância contábil aprovada.
- Nunca fazer reclassificação automática ou lançar CMV com base nesta comparação.

## Funcionamento

- O usuário abre **Estoque** ou **DRE Contábil** e clica em **Conferir CMV**.
- A consulta POST é autenticada e usa o Supabase com as políticas RLS do usuário, restrita a empresa e ano.
- O backend obtém três fontes em paralelo e retorna somente 12 resumos mensais, sem nomes de colaboradores, arquivos ou documentos.
- A conciliação é calculada **para a empresa inteira**, independentemente dos filtros de categoria ou conta da DRE; o período corresponde ao ano selecionado.
- A consulta roda somente ao expandir o painel e utiliza cache por empresa e ano por 90 segundos.
- Nada é gravado no banco; nenhuma migração nem alteração de RLS.

## Consistência do módulo de Estoque

- Os indicadores de giro e cobertura usam o CMV pela **competência** e `dre_line=cmv`, alinhado com a DRE. As consultas não usam a data de postagem como substituto.
- O CMV considerado vai até o dia de referência, com limite exclusivo no dia seguinte, sem incluir competências futuras. Para exercícios encerrados, usa o fim do ano; para anos futuros, não inventa períodos transcorridos.
- Os snapshots exibidos pertencem ao **ano selecionado** e não ultrapassam a data de referência. A tela mostra explicitamente a data do último snapshot.
- Giro e cobertura continuam **estimativas**, pois não há garantia de fechamentos físicos mensais nem de qualidade dos custos de estoque.
- Importações novas de PDFs e mudanças nos snapshots invalidam o cache da reconciliação por empresa.

## Critérios para revisão documental

1. Priorizar meses cujo custo do PDF e CMV da DRE diferem de forma material, especialmente quando o PDF cobre o mês civil completo.
2. Conferir o relatório total de custos da operação (e não só vendas por vendedor), devoluções, ajustes e lançamentos contábeis de fechamento.
3. Verificar inventário físico/contábil no encerramento e o período reconhecido nas compras.
4. Homologar com a contabilidade somente após identificar a origem das diferenças e documentar os ajustes aprovados.

## QA

- Testes com meses iguais, diferenças em centavos, divergência maior, período parcial, ausência de PDF, ausência de CMV e ano bissexto.
- CI: testes de domínio, TypeScript e build.
- Ainda é necessária a validação funcional na sessão autenticada do Lovable e a conferência documental com ERP e contabilidade.
