import { mockData } from "./data/mockData.js";
import { formatCurrency, formatDate, formatPercent } from "./utils/format.js";

const STORAGE_KEY = "tsdb-state-v2";
const LEGACY_STORAGE_KEY = "tsdb-state-v1";
const DAY = 86400000;

const elements = {
  views: Array.from(document.querySelectorAll(".view")),
  navLinks: Array.from(document.querySelectorAll(".nav-link")),
  title: document.querySelector("#view-title"),
  snapshot: document.querySelector("#snapshot"),
  dashboard: document.querySelector("#dashboard"),
  clients: document.querySelector("#clientes"),
  loans: document.querySelector("#emprestimos"),
  agenda: document.querySelector("#agenda"),
  settings: document.querySelector("#configuracoes"),
  loanClientSelect: document.querySelector("#loan-client-select"),
  paymentLoanSelect: document.querySelector("#payment-loan-select"),
  clientModal: document.querySelector("#client-modal"),
  loanModal: document.querySelector("#loan-modal"),
  paymentModal: document.querySelector("#payment-modal"),
  clientForm: document.querySelector("#client-form"),
  loanForm: document.querySelector("#loan-form"),
  paymentForm: document.querySelector("#payment-form")
};

let state = loadState();

function loadState() {
  const current = readStorage(STORAGE_KEY);
  if (current) {
    return current;
  }

  const legacy = readStorage(LEGACY_STORAGE_KEY);
  if (legacy) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    return legacy;
  }

  const seeded = cloneData(mockData);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function readStorage(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function persistState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function differenceInDays(dateValue) {
  return Math.ceil((parseDate(dateValue) - getToday()) / DAY);
}

function formatRelativeDays(dateValue) {
  const diff = differenceInDays(dateValue);

  if (diff === 0) {
    return "vence hoje";
  }

  if (diff > 0) {
    return `vence em ${diff} dia(s)`;
  }

  return `${Math.abs(diff)} dia(s) em atraso`;
}

function getClientById(clientId) {
  return state.clients.find(function (client) {
    return client.id === clientId;
  });
}

function getPaymentsByLoanId(loanId) {
  return state.payments.filter(function (payment) {
    return payment.loanId === loanId;
  });
}

function getBaseTarget(loan) {
  const calculated = loan.principal * (1 + loan.rate / 100);
  return loan.manualTarget === null || loan.manualTarget === undefined ? calculated : loan.manualTarget;
}

function getPaidAmount(loanId) {
  return getPaymentsByLoanId(loanId).reduce(function (sum, payment) {
    return sum + Number(payment.amount || 0);
  }, 0);
}

function getLateDays(loan) {
  const diff = Math.floor((getToday() - parseDate(loan.dueDate)) / DAY);
  return Math.max(diff, 0);
}

function getCurrentTarget(loan) {
  const target = getBaseTarget(loan);
  const paid = getPaidAmount(loan.id);
  const lateDays = getLateDays(loan);
  const outstanding = Math.max(target - paid, 0);
  const lateCharge = outstanding * (loan.lateFeeRate / 100) * lateDays;

  return target + lateCharge;
}

function getLoanComputed(loan) {
  const client = getClientById(loan.clientId);
  const paidAmount = getPaidAmount(loan.id);
  const baseTarget = getBaseTarget(loan);
  const lateDays = getLateDays(loan);
  const currentTarget = getCurrentTarget(loan);
  const remaining = Math.max(currentTarget - paidAmount, 0);
  let status = "ativo";

  if (loan.status === "cancelado") {
    status = "cancelado";
  } else if (remaining === 0) {
    status = "quitado";
  } else if (lateDays > 0) {
    status = "atrasado";
  } else if (differenceInDays(loan.dueDate) <= 3) {
    status = "vencendo";
  }

  return {
    id: loan.id,
    clientId: loan.clientId,
    client: client,
    principal: Number(loan.principal),
    rate: Number(loan.rate),
    issuedAt: loan.issuedAt,
    dueDate: loan.dueDate,
    lateFeeRate: Number(loan.lateFeeRate),
    manualTarget: loan.manualTarget,
    notes: loan.notes || "",
    status: status,
    paidAmount: paidAmount,
    baseTarget: baseTarget,
    currentTarget: currentTarget,
    lateDays: lateDays,
    remaining: remaining,
    profitExpected: baseTarget - Number(loan.principal),
    profitReceived: Math.max(Math.min(paidAmount, baseTarget) - Number(loan.principal), 0)
  };
}

function getComputedLoans() {
  return state.loans
    .map(getLoanComputed)
    .sort(function (a, b) {
      return parseDate(a.dueDate) - parseDate(b.dueDate);
    });
}

function getMetrics() {
  const loans = getComputedLoans();
  const totalPrincipal = loans.reduce(function (sum, loan) {
    return sum + loan.principal;
  }, 0);
  const totalExpected = loans.reduce(function (sum, loan) {
    return sum + loan.baseTarget;
  }, 0);
  const totalReceived = loans.reduce(function (sum, loan) {
    return sum + loan.paidAmount;
  }, 0);
  const profitExpected = loans.reduce(function (sum, loan) {
    return sum + loan.profitExpected;
  }, 0);
  const profitReceived = loans.reduce(function (sum, loan) {
    return sum + loan.profitReceived;
  }, 0);
  const overdueLoans = loans.filter(function (loan) {
    return loan.status === "atrasado";
  });
  const dueToday = loans.filter(function (loan) {
    return differenceInDays(loan.dueDate) === 0;
  });
  const dueThisWeek = loans.filter(function (loan) {
    const diff = differenceInDays(loan.dueDate);
    return diff >= 0 && diff <= 7;
  });

  return {
    totalPrincipal: totalPrincipal,
    totalExpected: totalExpected,
    totalReceived: totalReceived,
    profitExpected: profitExpected,
    profitReceived: profitReceived,
    overdueAmount: overdueLoans.reduce(function (sum, loan) {
      return sum + loan.remaining;
    }, 0),
    overdueCount: overdueLoans.length,
    dueTodayCount: dueToday.length,
    dueThisWeekCount: dueThisWeek.length,
    activeClients: state.clients.filter(function (client) {
      return client.status === "ativo";
    }).length,
    activeLoans: loans.filter(function (loan) {
      return loan.status === "ativo";
    }).length
  };
}

function statusPill(status) {
  return `<span class="pill pill--${status}">${status}</span>`;
}

function metricCard(title, value, caption, accent) {
  const classes = accent ? "metric-card metric-card--accent" : "metric-card";
  return `
    <article class="${classes}">
      <span>${title}</span>
      <strong>${value}</strong>
      <small>${caption}</small>
    </article>
  `;
}

function renderSnapshot() {
  const metrics = getMetrics();

  elements.snapshot.innerHTML = `
    <div class="snapshot__item">
      <span class="detail">Lucro previsto</span>
      <strong>${formatCurrency(metrics.profitExpected)}</strong>
    </div>
    <div class="snapshot__item">
      <span class="detail">Recebido</span>
      <strong>${formatCurrency(metrics.totalReceived)}</strong>
    </div>
    <div class="snapshot__item">
      <span class="detail">Em atraso</span>
      <strong>${metrics.overdueCount} cobranca(s)</strong>
    </div>
  `;
}

function renderDashboard() {
  const metrics = getMetrics();
  const loans = getComputedLoans();
  const overdueItems = loans.filter(function (loan) {
    return loan.status === "atrasado";
  }).slice(0, 3);
  const dueSoonItems = loans.filter(function (loan) {
    return loan.status === "ativo" || loan.status === "vencendo";
  }).slice(0, 3);
  const recentPayments = cloneData(state.payments)
    .sort(function (a, b) {
      return parseDate(b.paidAt) - parseDate(a.paidAt);
    })
    .slice(0, 5);

  elements.dashboard.innerHTML = `
    <section class="hero">
      <div class="hero__copy">
        <div>
          <p class="eyebrow">Visao geral</p>
          <h3>Painel de cobranca com foco em rapidez, clareza e lucro real.</h3>
        </div>
        <p>
          A base agora esta organizada para operar no dia a dia: cadastrar cliente, registrar emprestimo,
          acompanhar atraso e enxergar o que entrou e o que ainda falta receber.
        </p>
        <div class="hero__stats">
          <article class="mini-stat">
            <span class="detail">Clientes ativos</span>
            <strong>${metrics.activeClients}</strong>
          </article>
          <article class="mini-stat">
            <span class="detail">Operacoes ativas</span>
            <strong>${metrics.activeLoans}</strong>
          </article>
          <article class="mini-stat">
            <span class="detail">Vencendo hoje</span>
            <strong>${metrics.dueTodayCount}</strong>
          </article>
          <article class="mini-stat">
            <span class="detail">Atrasos em aberto</span>
            <strong>${metrics.overdueCount}</strong>
          </article>
        </div>
      </div>

      <div class="panel">
        <p class="eyebrow">Radar semanal</p>
        <h3>O que merece prioridade agora</h3>
        <div class="timeline-list">
          <div class="timeline-item">
            <strong>${formatCurrency(metrics.overdueAmount)}</strong>
            <p>em cobrancas atrasadas exigindo acompanhamento.</p>
          </div>
          <div class="timeline-item">
            <strong>${metrics.dueThisWeekCount} vencimento(s)</strong>
            <p>programados para os proximos 7 dias.</p>
          </div>
          <div class="timeline-item">
            <strong>${formatCurrency(metrics.profitReceived)}</strong>
            <p>de lucro recebido ate aqui.</p>
          </div>
        </div>
      </div>
    </section>

    <div class="section-stack">
      <section>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Numeros-chave</p>
            <h3>Resumo financeiro</h3>
          </div>
          <p>Leitura imediata da carteira para tomada de decisao.</p>
        </div>
        <div class="cards-grid">
          ${metricCard("Total emprestado", formatCurrency(metrics.totalPrincipal), "Capital em operacao")}
          ${metricCard("Total previsto", formatCurrency(metrics.totalExpected), "Valor combinado da carteira")}
          ${metricCard("Total recebido", formatCurrency(metrics.totalReceived), "Entradas registradas")}
          ${metricCard("Lucro previsto", formatCurrency(metrics.profitExpected), "Margem esperada", true)}
          ${metricCard("Lucro recebido", formatCurrency(metrics.profitReceived), "Lucro consolidado", true)}
          ${metricCard("Em atraso", formatCurrency(metrics.overdueAmount), `${metrics.overdueCount} cobranca(s)`)}
        </div>
      </section>

      <section class="info-grid">
        <div class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Atencao</p>
              <h3>Cobrancas criticas</h3>
            </div>
          </div>
          ${renderLoanCards(overdueItems, "Sem cobrancas atrasadas no momento.")}
        </div>

        <div class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Agenda</p>
              <h3>Proximos vencimentos</h3>
            </div>
          </div>
          ${renderLoanCards(dueSoonItems, "Nenhum vencimento proximo cadastrado.")}
        </div>
      </section>

      <section class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Movimento</p>
            <h3>Ultimos recebimentos</h3>
          </div>
          <p>Historico recente para conferencia rapida.</p>
        </div>
        ${renderPaymentCards(recentPayments)}
      </section>
    </div>
  `;
}

function renderClients() {
  const loans = getComputedLoans();
  const clientsMarkup = state.clients.map(function (client) {
    const clientLoans = loans.filter(function (loan) {
      return loan.clientId === client.id;
    });
    const openAmount = clientLoans.reduce(function (sum, loan) {
      return sum + loan.remaining;
    }, 0);
    const nextLoan = clientLoans
      .filter(function (loan) {
        return loan.remaining > 0;
      })
      .sort(function (a, b) {
        return parseDate(a.dueDate) - parseDate(b.dueDate);
      })[0];

    return `
      <article class="record-card">
        <div class="record-card__top">
          <div>
            <p class="eyebrow">Cliente</p>
            <h4>${client.name}</h4>
            <p>${client.phone || "Telefone nao informado"}</p>
          </div>
          ${statusPill(client.status)}
        </div>
        <div class="meta-grid">
          <div class="meta-row">
            <div>
              <span>Saldo em aberto</span>
              <strong>${formatCurrency(openAmount)}</strong>
            </div>
          </div>
          <div class="meta-row">
            <div>
              <span>Proximo vencimento</span>
              <strong>${nextLoan ? formatDate(nextLoan.dueDate) : "-"}</strong>
            </div>
          </div>
          <div class="meta-row">
            <div>
              <span>Operacoes</span>
              <strong>${clientLoans.length}</strong>
            </div>
          </div>
        </div>
        <div class="record-card__footer">
          <span class="detail">${client.notes || "Sem observacoes adicionais."}</span>
          <button type="button" class="inline-button" data-action="open-loan" data-client-id="${client.id}">
            Novo emprestimo
          </button>
        </div>
      </article>
    `;
  }).join("");

  elements.clients.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Clientes</p>
        <h3>Carteira cadastrada</h3>
      </div>
      <p>Cards mais objetivos para consultar saldo, vencimento e observacoes sem depender de tabela.</p>
    </div>
    <div class="record-list">
      ${clientsMarkup || `<div class="empty-state">Nenhum cliente cadastrado ainda.</div>`}
    </div>
  `;
}

function renderLoans() {
  const loansMarkup = getComputedLoans().map(function (loan) {
    return `
      <article class="record-card">
        <div class="record-card__top">
          <div>
            <p class="eyebrow">Operacao</p>
            <h4>${loan.client ? loan.client.name : "Cliente nao encontrado"}</h4>
            <p>Emitido em ${formatDate(loan.issuedAt)} e com vencimento em ${formatDate(loan.dueDate)}</p>
          </div>
          ${statusPill(loan.status)}
        </div>
        <div class="meta-grid">
          <div class="meta-row">
            <div>
              <span>Principal</span>
              <strong>${formatCurrency(loan.principal)}</strong>
            </div>
          </div>
          <div class="meta-row">
            <div>
              <span>Total combinado</span>
              <strong>${formatCurrency(loan.baseTarget)}</strong>
            </div>
          </div>
          <div class="meta-row">
            <div>
              <span>Total atualizado</span>
              <strong>${formatCurrency(loan.currentTarget)}</strong>
            </div>
          </div>
          <div class="meta-row">
            <div>
              <span>Recebido</span>
              <strong>${formatCurrency(loan.paidAmount)}</strong>
            </div>
          </div>
        </div>
        <div class="record-card__footer">
          <span class="detail">
            ${formatPercent(loan.rate)} combinado | juros diario ${formatPercent(loan.lateFeeRate)} | ${formatRelativeDays(loan.dueDate)}
          </span>
          <button type="button" class="inline-button" data-action="open-payment" data-loan-id="${loan.id}">
            Registrar pagamento
          </button>
        </div>
      </article>
    `;
  }).join("");

  elements.loans.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Emprestimos</p>
        <h3>Operacoes da carteira</h3>
      </div>
      <p>Saindo da tabela simples para um formato mais legivel no celular e mais util no dia a dia.</p>
    </div>
    <div class="record-list">
      ${loansMarkup || `<div class="empty-state">Nenhum emprestimo cadastrado ainda.</div>`}
    </div>
  `;
}

function renderAgenda() {
  const loans = getComputedLoans();
  const overdue = loans.filter(function (loan) {
    return loan.status === "atrasado";
  });
  const dueToday = loans.filter(function (loan) {
    return differenceInDays(loan.dueDate) === 0;
  });
  const dueWeek = loans.filter(function (loan) {
    const diff = differenceInDays(loan.dueDate);
    return diff > 0 && diff <= 7;
  });

  elements.agenda.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Agenda</p>
        <h3>Mapa de cobranca</h3>
      </div>
      <p>Separacao por urgencia para facilitar acompanhamento diario.</p>
    </div>
    <div class="lane-grid">
      <section class="timeline-card">
        <p class="eyebrow">Atrasados</p>
        <h3>Cobrancas vencidas</h3>
        ${renderTimeline(overdue, "Sem atrasos registrados.")}
      </section>
      <section class="timeline-card">
        <p class="eyebrow">Hoje</p>
        <h3>Vencimentos do dia</h3>
        ${renderTimeline(dueToday, "Nenhum vencimento hoje.")}
      </section>
      <section class="timeline-card">
        <p class="eyebrow">Semana</p>
        <h3>Proximos 7 dias</h3>
        ${renderTimeline(dueWeek, "Nenhum vencimento nesta semana.")}
      </section>
    </div>
  `;
}

function renderSettings() {
  elements.settings.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Configuracoes</p>
        <h3>Seguranca e manutencao</h3>
      </div>
      <p>Base pronta para backup manual e publicacao continua no GitHub Pages.</p>
    </div>

    <div class="settings-grid">
      <article class="settings-card">
        <p class="eyebrow">Dados</p>
        <h3>Exportar backup</h3>
        <p>Baixe uma copia em JSON da sua base atual para guardar localmente.</p>
        <div class="settings-row">
          <button type="button" class="action-button" data-action="export-data">Exportar agora</button>
          <span class="muted">Recomendado antes de grandes alteracoes.</span>
        </div>
      </article>

      <article class="settings-card">
        <p class="eyebrow">Restauracao</p>
        <h3>Importar base</h3>
        <p>Envie um arquivo JSON de backup para restaurar clientes, emprestimos e pagamentos.</p>
        <input class="file-input" id="import-input" type="file" accept="application/json" />
      </article>

      <article class="settings-card">
        <p class="eyebrow">Publicacao</p>
        <h3>GitHub Pages</h3>
        <p>A aplicacao segue estatica e pode continuar hospedada direto no repositório sem etapa de build.</p>
        <div class="settings-row">
          <span class="muted">Manifest e cache offline ja incluidos.</span>
        </div>
      </article>
    </div>
  `;

  const importInput = document.querySelector("#import-input");
  if (importInput) {
    importInput.addEventListener("change", handleImport);
  }
}

function renderLoanCards(loans, emptyMessage) {
  if (!loans.length) {
    return `<div class="empty-state">${emptyMessage}</div>`;
  }

  return `
    <div class="record-list">
      ${loans.map(function (loan) {
        return `
          <article class="record-card">
            <div class="record-card__top">
              <div>
                <h4>${loan.client ? loan.client.name : "Cliente nao encontrado"}</h4>
                <p>${formatRelativeDays(loan.dueDate)}</p>
              </div>
              ${statusPill(loan.status)}
            </div>
            <div class="meta-grid">
              <div class="meta-row">
                <div>
                  <span>Saldo atual</span>
                  <strong>${formatCurrency(loan.remaining)}</strong>
                </div>
              </div>
              <div class="meta-row">
                <div>
                  <span>Vencimento</span>
                  <strong>${formatDate(loan.dueDate)}</strong>
                </div>
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderPaymentCards(payments) {
  if (!payments.length) {
    return `<div class="empty-state">Nenhum pagamento registrado ainda.</div>`;
  }

  return `
    <div class="record-list">
      ${payments.map(function (payment) {
        const loan = state.loans.find(function (item) {
          return item.id === payment.loanId;
        });
        const client = loan ? getClientById(loan.clientId) : null;

        return `
          <article class="record-card">
            <div class="record-card__top">
              <div>
                <p class="eyebrow">Recebimento</p>
                <h4>${client ? client.name : "Cliente nao encontrado"}</h4>
                <p>${formatDate(payment.paidAt)}${payment.method ? ` | ${payment.method}` : ""}</p>
              </div>
              <strong>${formatCurrency(payment.amount)}</strong>
            </div>
            <span class="detail">${payment.notes || "Sem observacoes para este pagamento."}</span>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderTimeline(loans, emptyMessage) {
  if (!loans.length) {
    return `<div class="empty-state">${emptyMessage}</div>`;
  }

  return `
    <div class="timeline-list">
      ${loans.map(function (loan) {
        return `
          <div class="timeline-item">
            <strong>${loan.client ? loan.client.name : "Cliente nao encontrado"}</strong>
            <p>${formatCurrency(loan.remaining)} | ${formatRelativeDays(loan.dueDate)}</p>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderSelectOptions() {
  const clientOptions = state.clients.length
    ? state.clients.map(function (client) {
        return `<option value="${client.id}">${client.name}</option>`;
      }).join("")
    : `<option value="">Cadastre um cliente primeiro</option>`;

  elements.loanClientSelect.innerHTML = clientOptions;

  const openLoans = getComputedLoans().filter(function (loan) {
    return loan.remaining > 0;
  });

  elements.paymentLoanSelect.innerHTML = openLoans.length
    ? openLoans.map(function (loan) {
        return `<option value="${loan.id}">${loan.client ? loan.client.name : "Cliente"} | ${formatCurrency(loan.remaining)}</option>`;
      }).join("")
    : `<option value="">Nenhum emprestimo em aberto</option>`;
}

function renderAll() {
  renderSnapshot();
  renderDashboard();
  renderClients();
  renderLoans();
  renderAgenda();
  renderSettings();
  renderSelectOptions();
}

function switchView(viewId) {
  elements.views.forEach(function (view) {
    view.classList.toggle("is-active", view.id === viewId);
  });

  elements.navLinks.forEach(function (link) {
    link.classList.toggle("is-active", link.dataset.viewTarget === viewId);
  });

  const activeLink = elements.navLinks.find(function (link) {
    return link.dataset.viewTarget === viewId;
  });

  elements.title.textContent = activeLink ? activeLink.querySelector("span").textContent : "Dashboard";
}

function createId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    return;
  }

  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    return;
  }

  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function resetForm(form) {
  form.reset();
}

function setDateDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);

  elements.loanForm.elements.issuedAt.value = today;
  elements.loanForm.elements.dueDate.value = due;
  elements.paymentForm.elements.paidAt.value = today;
}

function handleClientSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  state.clients.unshift({
    id: createId("cl"),
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    document: String(formData.get("document") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    status: "ativo",
    createdAt: new Date().toISOString().slice(0, 10)
  });

  persistState();
  renderAll();
  resetForm(elements.clientForm);
  closeModal("client-modal");
}

function handleLoanSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  state.loans.unshift({
    id: createId("ln"),
    clientId: formData.get("clientId"),
    principal: Number(formData.get("principal") || 0),
    rate: Number(formData.get("rate") || 0),
    issuedAt: formData.get("issuedAt"),
    dueDate: formData.get("dueDate"),
    lateFeeRate: Number(formData.get("lateFeeRate") || 0),
    manualTarget: formData.get("manualTarget") ? Number(formData.get("manualTarget")) : null,
    notes: String(formData.get("notes") || "").trim(),
    status: "ativo"
  });

  persistState();
  renderAll();
  resetForm(elements.loanForm);
  setDateDefaults();
  closeModal("loan-modal");
}

function handlePaymentSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  state.payments.unshift({
    id: createId("pm"),
    loanId: formData.get("loanId"),
    paidAt: formData.get("paidAt"),
    amount: Number(formData.get("amount") || 0),
    method: String(formData.get("method") || "").trim(),
    notes: String(formData.get("notes") || "").trim()
  });

  persistState();
  renderAll();
  resetForm(elements.paymentForm);
  setDateDefaults();
  closeModal("payment-modal");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tsdb-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  file.text()
    .then(function (content) {
      const imported = JSON.parse(content);
      state = imported;
      persistState();
      renderAll();
    })
    .catch(function () {
      window.alert("Nao foi possivel importar este arquivo JSON.");
    });
}

function bindEvents() {
  elements.navLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      switchView(link.dataset.viewTarget);
    });
  });

  document.body.addEventListener("click", function (event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) {
      return;
    }

    const action = trigger.dataset.action;

    if (action === "open-client") {
      openModal("client-modal");
    }

    if (action === "open-loan") {
      if (!state.clients.length) {
        window.alert("Cadastre ao menos um cliente antes de criar um emprestimo.");
        return;
      }

      if (trigger.dataset.clientId) {
        elements.loanClientSelect.value = trigger.dataset.clientId;
      }

      openModal("loan-modal");
    }

    if (action === "open-payment") {
      const openLoans = getComputedLoans().filter(function (loan) {
        return loan.remaining > 0;
      });

      if (!openLoans.length) {
        window.alert("Nao ha emprestimos em aberto para receber.");
        return;
      }

      if (trigger.dataset.loanId) {
        elements.paymentLoanSelect.value = trigger.dataset.loanId;
      }

      openModal("payment-modal");
    }

    if (action === "close-modal") {
      closeModal(trigger.dataset.modalId);
    }

    if (action === "export-data") {
      exportData();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") {
      return;
    }

    ["client-modal", "loan-modal", "payment-modal"].forEach(function (modalId) {
      const modal = document.getElementById(modalId);
      if (modal && !modal.classList.contains("is-hidden")) {
        closeModal(modalId);
      }
    });
  });

  elements.clientForm.addEventListener("submit", handleClientSubmit);
  elements.loanForm.addEventListener("submit", handleLoanSubmit);
  elements.paymentForm.addEventListener("submit", handlePaymentSubmit);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {
      return null;
    });
  }
}

bindEvents();
setDateDefaults();
renderAll();
registerServiceWorker();
