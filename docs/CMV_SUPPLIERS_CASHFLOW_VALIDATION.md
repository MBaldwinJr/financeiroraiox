# Tratamento do CMV, fornecedores e caixa — critérios de auditoria

> Documento técnico genérico. Não registrar valores financeiros reais, clientes ou fornecedores neste repositório público.

## A diferença fundamental

- **CMV (custo da mercadoria vendida)** é reconhecido **na DRE por competência**, quando a mercadoria é vendida (observados os critérios de mensuração aplicáveis).
- **Compra de mercadorias** em geral registra estoque e uma obrigação ou pagamento; a compra por si só não é uma segunda despesa da DRE.
- **Pagamento ao fornecedor** reduz caixa/bancos e fornecedores a pagar; não se soma novamente ao CMV como despesa no resultado.
- **Devoluções, descontos de aquisição, frete de compra, impostos recuperáveis e estoque** exigem tratamento contábil próprio. O código não consegue homologar o CMV somente a partir de pagamentos.
- Para avaliar CMV: conciliar **estoque inicial + entradas/compra líquida atribuível ao estoque - estoque final**, respeitando ajustes e mercadorias não vendidas. Pagamentos a fornecedores não são substitutos do valor das compras na fórmula.

## Comportamento implementado

| Operação | DRE | Visão de movimentações liquidadas |
|---|---|---|
| Apropriação do CMV | Reduz resultado uma vez | **Não somada** automaticamente como pagamento |
| Quitação de compra com fornecedor | Não reduz resultado de novo | Saída no mês do `paid_at`, quando registrada como paga |
| Despesa operacional liquidada | Reduz resultado conforme classificação | Saída no mês do pagamento |
| Principal de empréstimo / aquisição de ativo liquidado | Movimento patrimonial, não despesa | Saída patrimonial, separada |
| Receita/entrada patrimonial liquidada | Movimento patrimonial, não receita da DRE | Entrada registrada, sujeita à conciliação |

A tela **Fluxo de Caixa** usa apenas o ano selecionado, `status = paid` e a data `paid_at`; executa duas consultas (entradas e saídas), sem buscar o histórico de DRE ou ano anterior. A resposta do servidor apresenta somente totais mensais agrupados.

## Restrições e riscos a validar

- Um lançamento de CMV com `status = paid` pode ser apenas uma apropriação contábil importada. Não significa automaticamente uma segunda transferência bancária.
- As saídas de caixa apresentadas são **movimentações registradas como liquidadas**, não um extrato de bancos conciliado. Não verificar correspondência de bancos é uma limitação explícita.
- Lançamentos patrimoniais podem conter transferências internas ou registros não bancários: precisam ser conciliados antes de tratar o total como fluxo real.
- Empréstimos podem misturar principal, juros e tarifas em uma categoria; a separação depende do contrato.
- A existência de poucos snapshots de estoque não permite homologar o CMV de todo o ano. Solicitar estoques inicial/final, entradas, devoluções, compras líquidas e baixas, além das referências do ERP.
- Uma diferença entre CMV e pagamentos aos fornecedores **não é erro por si só** (prazos, estoque, adiantamentos, compras não vendidas e outras partidas).
- Os filtros globais podem restringir a visualização. Comparações entre DRE e caixa precisam usar **a mesma empresa e janela temporal**, mas são bases de reconhecimento diferentes.

## Testes de aceite

1. CMV reconhecido na DRE exatamente uma vez e ausente das saídas liquidadas para evitar duplicação de fornecedores.
2. Fornecedores patrimoniais excluídos da DRE e incluídos nas saídas registradas como pagas.
3. Outras saídas patrimoniais isoladas, sem serem tratadas como despesas de competência.
4. Entradas e saídas seguem data de pagamento; competência permanece na DRE.
5. Soma das três categorias de saída = saída registrada total, sem CMV.
6. Cache por empresa/ano/filtro invalida após mutações financeiras.
7. Confirmar valores em sessão autenticada e confrontar extratos em homologação; não executar mutações em produção.

**Nenhuma regra deste documento autoriza reclassificação automática ou lançamento contábil.**
