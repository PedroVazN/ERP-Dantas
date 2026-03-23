type ReleaseEntry = {
  version: string;
  commit: string;
  title: string;
  summary: string;
  checks: string[];
};

const releaseNotes: ReleaseEntry[] = [
  {
    version: "v1.7",
    commit: "7a79c6a",
    title: "Automações Fase 1 no dashboard",
    summary:
      "Entraram alertas operacionais com dados reais e envio de resumo diário no WhatsApp para acelerar ação da operação.",
    checks: [
      "Reposição sugerida para estoque crítico",
      "Contagem real de vendas e compras no painel",
      "Resumo operacional no WhatsApp (estoque, recebíveis e despesas vencidas)",
    ],
  },
  {
    version: "v1.6",
    commit: "38491bb",
    title: "Interface premium e mais corporativa",
    summary: "Refino visual global com melhor hierarquia, tipografia, botões e tabelas para um visual mais profissional.",
    checks: [
      "Padronização de cards e sombras",
      "Tabela com leitura mais executiva",
      "Melhorias de foco, rolagem e consistência visual",
    ],
  },
  {
    version: "v1.5",
    commit: "1fcad3e",
    title: "Novo fluxo de ordens para compras e vendas",
    summary: "Tela em lista + tela de criação no mesmo padrão, com filtros, status e ações por linha.",
    checks: [
      "Lista de ordens com paginação",
      "Criação de ordem por item na grade de produtos",
      "Workflow separado para compra (despesa) e venda (receita)",
    ],
  },
  {
    version: "v1.4",
    commit: "c11f585",
    title: "Comando de voz na IA",
    summary: "A IA passou a aceitar ditado por voz direto no campo de comando para agilizar uso no dia a dia.",
    checks: [
      "Botão de falar/parar no campo de IA",
      "Transcrição em pt-BR no input",
      "Feedback de suporte/permissão de microfone",
    ],
  },
];

export default function AtualizacoesModule() {
  return (
    <section className="module-grid animated">
      <section className="table-card updates-shell">
        <div className="updates-header">
          <h3>Atualizações do sistema</h3>
          <p className="theme-helper">
            Acompanhe o que entrou nas versões com um resumo objetivo e checklist do que já está disponível.
          </p>
        </div>

        <div className="updates-list">
          {releaseNotes.map((release) => (
            <article className="update-card" key={release.commit}>
              <div className="update-card-head">
                <div>
                  <span className="status-chip neutral">{release.version}</span>
                  <h4>{release.title}</h4>
                </div>
                <small>commit {release.commit}</small>
              </div>
              <p>{release.summary}</p>
              <ul>
                {release.checks.map((item) => (
                  <li key={item}>{"\u2713"} {item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
