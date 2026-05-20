const STORAGE_KEY = "tsdb-premium-v1";
const SETTINGS_KEY = "tsdb-premium-settings-v1";
const LEGACY_KEYS = ["tsdb-state-v2", "tsdb-state-v1"];
const DAY_MS = 86400000;

const defaultSettings = {
  defaultInterestRate: 30,
  defaultDailyLateRate: 2,
  pinEnabled: false
};

const state = {
  data: loadData(),
  settings: loadSettings(),
  screen: "dashboard",
  filter: "all",
  search: "",
  selectedLoanId: null,
  editingLoanId: null,
  draft: null,
  charts: {
    donut: null,
    monthly: null
  }
};

const dom = {
  loading: document.querySelector("#loading-screen"),
  screens: {
    dashboard: document.querySelector("#screen-dashboard"),
    loans: document.querySelector("#screen-loans"),
    newLoan: document.querySelector("#screen-new-loan"),
    reports: document.querySelector("#screen-reports"),
    settings: document.querySelector("#screen-settings")
  },
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  paymentModal: document.querySelector("#payment-modal"),
  paymentForm: document.querySelector("#payment-form"),
  loanMenuModal: document.querySelector("#loan-menu-modal"),
  loanMenuActions: document.querySelector("#loan-menu-actions")
};

function loadData() {
  const current = readJson(STORAGE_KEY);
  if (current && Array.isArray(current.loans)) {
    return normalizeData(current);
  }

  for (const key of LEGACY_KEYS) {
    const legacy = readJson(key);
    if (legacy) {
      const migrated = migrateLegacyData(legacy);
      if (migrated.loans.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  }

  return { loans: [] };
}

function loadSettings() {
  return { ...defaultSettings, ...(readJson(SETTINGS_KEY) || {}) };
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function normalizeData(data) {
  return {
    loans: (data.loans || []).map((loan) => ({
      id: loan.id || createId(),
      name: String(loan.name || loan.clientName || "Cliente sem nome"),
      phone: String(loan.phone || ""),
      principal: parseNumber(loan.principal),
      interestRate: parseNumber(loan.interestRate ?? loan.rate),
      dailyLateRate: parseNumber(loan.dailyLateRate ?? loan.lateFeeRate),
      issueDate: loan.issueDate || loan.issuedAt || todayIso(),
      dueDate: loan.dueDate || todayIso(),
      notes: String(loan.notes || ""),
      payments: (loan.payments || []).map(normalizePayment),
      createdAt: loan.createdAt || new Date().toISOString(),
      updatedAt: loan.updatedAt || loan.editedAt || null
    }))
  };
}

function migrateLegacyData(legacy) {
  const clients = legacy.clients || [];
  const payments = legacy.payments || [];

  const loans = (legacy.loans || []).map((loan) => {
    const client = clients.find((item) => item.id === loan.clientId);
    return {
      id: loan.id || createId(),
      name: client ? client.name : loan.name || "Cliente sem nome",
      phone: client ? client.phone || "" : loan.phone || "",
      principal: parseNumber(loan.principal),
      interestRate: parseNumber(loan.interestRate ?? loan.rate),
      dailyLateRate: parseNumber(loan.dailyLateRate ?? loan.lateFeeRate),
      issueDate: loan.issueDate || loan.issuedAt || todayIso(),
      dueDate: loan.dueDate || todayIso(),
      notes: loan.notes || "",
      payments: payments.filter((payment) => payment.loanId === loan.id).map(normalizePayment),
      createdAt: loan.createdAt || new Date().toISOString(),
      updatedAt: loan.updatedAt || null
    };
  });

  return { loans };
}

function normalizePayment(payment) {
  return {
    id: payment.id || createId(),
    paidAt: payment.paidAt || payment.date || todayIso(),
    amount: parseNumber(payment.amount),
    method: payment.method || "Pix",
    notes: payment.notes || ""
  };
}

function createId() {
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function futureIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }

  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyInputValue(value) {
  const amount = parseNumber(value);
  if (!amount) {
    return "";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function parseDate(value) {
  return new Date(String(value) + "T12:00:00");
}

function diffDays(from, to) {
  return Math.floor((parseDate(to) - parseDate(from)) / DAY_MS);
}

function daysUntil(date) {
  return Math.ceil((parseDate(date) - today()) / DAY_MS);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parseDate(value));
}

function formatPercent(value) {
  return Number(value || 0).toFixed(2).replace(".", ",") + "%";
}

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "TS";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getComputedLoan(loan) {
  const principal = parseNumber(loan.principal);
  const interestAmount = principal * (parseNumber(loan.interestRate) / 100);
  const totalOriginal = principal + interestAmount;
  const payments = (loan.payments || []).slice().sort((a, b) => parseDate(a.paidAt) - parseDate(b.paidAt));
  const paidAmount = payments.reduce((sum, payment) => sum + parseNumber(payment.amount), 0);

  let settledAt = null;
  let lateDays = 0;
  let totalUpdated = totalOriginal;
  let runningPaid = 0;

  for (const payment of payments) {
    runningPaid += parseNumber(payment.amount);
    const lateAtPayment = Math.max(diffDays(loan.dueDate, payment.paidAt), 0);
    const totalAtPayment = totalOriginal + totalOriginal * (parseNumber(loan.dailyLateRate) / 100) * lateAtPayment;

    if (runningPaid >= totalAtPayment - 0.01) {
      settledAt = payment.paidAt;
      lateDays = lateAtPayment;
      totalUpdated = totalAtPayment;
      break;
    }
  }

  if (!settledAt) {
    lateDays = Math.max(Math.floor((today() - parseDate(loan.dueDate)) / DAY_MS), 0);
    totalUpdated = totalOriginal + totalOriginal * (parseNumber(loan.dailyLateRate) / 100) * lateDays;
  }

  const lateInterest = Math.max(totalUpdated - totalOriginal, 0);
  const balance = Math.max(totalUpdated - paidAmount, 0);
  const remainingDays = daysUntil(loan.dueDate);

  let status = "on-time";
  if (settledAt || (paidAmount > 0 && balance <= 0.01)) {
    status = "paid";
  } else if (lateDays > 0) {
    status = "overdue";
  } else if (remainingDays === 0) {
    status = "due-today";
  } else if (remainingDays > 0 && remainingDays <= 5) {
    status = "soon";
  }

  return {
    ...loan,
    principal,
    interestAmount,
    totalOriginal,
    lateInterest,
    totalUpdated,
    paidAmount,
    balance,
    lateDays,
    remainingDays,
    status,
    settledAt,
    profitProjected: totalOriginal - principal,
    profitReceived: Math.max(Math.min(paidAmount, totalUpdated) - principal, 0)
  };
}

function getLoans() {
  return state.data.loans.map(getComputedLoan).sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate));
}

function getLoan(id) {
  return getLoans().find((loan) => loan.id === id) || null;
}

function getSelectedLoan() {
  const loans = getLoans();
  const selected = loans.find((loan) => loan.id === state.selectedLoanId);

  if (selected) {
    return selected;
  }

  state.selectedLoanId = loans[0] ? loans[0].id : null;
  return loans[0] || null;
}

function getMetrics() {
  const loans = getLoans();
  const overdue = loans.filter((loan) => loan.status === "overdue");
  const paid = loans.filter((loan) => loan.status === "paid");
  const active = loans.filter((loan) => loan.status !== "paid");
  const onTime = loans.filter((loan) => ["on-time", "soon", "due-today"].includes(loan.status));
  const clientNames = new Set(loans.map((loan) => loan.name.toLowerCase()));

  return {
    loans,
    overdue,
    paid,
    active,
    onTime,
    dueToday: loans.filter((loan) => loan.status === "due-today"),
    dueSoon: loans.filter((loan) => ["soon", "due-today", "on-time"].includes(loan.status) && loan.balance > 0).slice(0, 5),
    totalPrincipal: loans.reduce((sum, loan) => sum + loan.principal, 0),
    totalReceivable: active.reduce((sum, loan) => sum + loan.balance, 0),
    totalProjected: loans.reduce((sum, loan) => sum + loan.totalUpdated, 0),
    totalPaid: loans.reduce((sum, loan) => sum + loan.paidAmount, 0),
    totalOverdue: overdue.reduce((sum, loan) => sum + loan.balance, 0),
    totalOnTime: onTime.reduce((sum, loan) => sum + loan.balance, 0),
    profitProjected: loans.reduce((sum, loan) => sum + loan.profitProjected, 0),
    profitReceived: loans.reduce((sum, loan) => sum + loan.profitReceived, 0),
    clients: clientNames.size,
    lateRate: loans.length ? Math.round((overdue.length / loans.length) * 100) : 0
  };
}

function statusMeta(loan) {
  const map = {
    paid: {
      label: "Pago",
      detail: loan.settledAt ? "Pago em " + formatDate(loan.settledAt) : "Quitado",
      tone: "green",
      icon: "fa-circle-check"
    },
    overdue: {
      label: "Atrasado",
      detail: "Vencido ha " + loan.lateDays + " dia(s)",
      tone: "red",
      icon: "fa-triangle-exclamation"
    },
    "due-today": {
      label: "Vence hoje",
      detail: "Vencimento hoje",
      tone: "yellow",
      icon: "fa-clock"
    },
    soon: {
      label: "Proximo",
      detail: "Vence em " + loan.remainingDays + " dia(s)",
      tone: "yellow",
      icon: "fa-hourglass-half"
    },
    "on-time": {
      label: "Em dia",
      detail: "Em dia",
      tone: "green",
      icon: "fa-shield-check"
    }
  };

  return map[loan.status] || map["on-time"];
}

function render() {
  renderDashboard();
  renderLoans();
  renderNewLoan();
  renderReports();
  renderSettings();
  setScreen(state.screen);
}

function setScreen(screen) {
  state.screen = screen;
  Object.entries(dom.screens).forEach(([key, element]) => {
    element.classList.toggle("is-active", key === screen);
  });
  dom.navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.nav === screen);
  });

  if (screen === "dashboard" || screen === "reports") {
    setTimeout(renderCharts, 40);
  }
}

function renderHeader(title, subtitle, backAction, actions = "") {
  return `
    <header class="screen-header centered">
      <button class="icon-button" type="button" data-action="${backAction || "settings"}" aria-label="Voltar">
        <i class="fa-solid ${backAction ? "fa-arrow-left" : "fa-bars"}"></i>
      </button>
      <div class="screen-title">
        <h1>${title}</h1>
        ${subtitle ? `<p>${subtitle}</p>` : ""}
      </div>
      <div class="header-actions">${actions}</div>
    </header>
  `;
}

function renderDashboard() {
  const metrics = getMetrics();

  dom.screens.dashboard.innerHTML = `
    ${renderHeader(
      "Ola, Daniel",
      "Sua carteira atualizada com juros, atrasos e recebimentos automaticos.",
      null,
      `<button class="icon-button" type="button" data-action="loans" aria-label="Alertas"><i class="fa-regular fa-bell"></i></button>`
    )}

    <section class="section-block">
      <div class="section-head">
        <div>
          <h2>Resumo geral</h2>
          <p>${new Date().toLocaleDateString("pt-BR")} - ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </div>
      <div class="metric-grid">
        ${metricCard("Total emprestado", metrics.totalPrincipal, "Capital aplicado", "green", "fa-scale-balanced", "reports")}
        ${metricCard("Total a receber", metrics.totalReceivable, "Saldo aberto", "blue", "fa-sack-dollar", "loans")}
        ${metricCard("Em dia", metrics.totalOnTime, `${metrics.dueToday.length} vencendo hoje`, "yellow", "fa-clock", "filter-on-time")}
        ${metricCard("Atrasado", metrics.totalOverdue, `${metrics.overdue.length} operacao(oes)`, "red", "fa-triangle-exclamation", "filter-overdue")}
        ${metricCard("Total pago", metrics.totalPaid, "Recebido", "green", "fa-circle-dollar-to-slot", "reports")}
        ${metricCard("Lucro total", metrics.profitProjected, `${metrics.clients} cliente(s)`, "blue", "fa-chart-pie", "reports")}
      </div>
    </section>

    <section class="section-block">
      <div class="action-grid">
        ${actionCard("Novo emprestimo", "Cadastro com calculo em tempo real", "fa-plus", "new-loan")}
        ${actionCard("Cobrar atrasados", "Abra a carteira filtrada por atraso", "fa-bolt", "filter-overdue")}
      </div>
    </section>

    <section class="section-block panel-card">
      <div class="section-head">
        <div>
          <h3>Visao geral</h3>
          <p>Distribuicao atual da carteira</p>
        </div>
      </div>
      <div class="chart-layout">
        <div class="donut-frame">
          <canvas id="donut-chart"></canvas>
          <div class="donut-label">
            <span>Aberto</span>
            <strong>${formatCurrency(metrics.totalReceivable)}</strong>
          </div>
        </div>
        <div class="legend-list">
          ${legendRow("Em dia", metrics.totalOnTime, "green")}
          ${legendRow("Atrasados", metrics.totalOverdue, "red")}
          ${legendRow("Pagos", metrics.totalPaid, "blue")}
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h3>Proximos vencimentos</h3>
        <button class="link-button" type="button" data-action="loans">Ver todos</button>
      </div>
      <div class="loan-list">
        ${metrics.dueSoon.length ? metrics.dueSoon.map(renderLoanCard).join("") : emptyState("Nenhum vencimento em aberto.")}
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <h3>Atrasados</h3>
          <p>Prioridade de cobranca</p>
        </div>
      </div>
      <div class="loan-list">
        ${metrics.overdue.length ? metrics.overdue.slice(0, 4).map(renderLoanCard).join("") : emptyState("Sem atrasos no momento.")}
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h3>Pagamentos recentes</h3>
      </div>
      <div class="recent-list">
        ${renderRecentPayments()}
      </div>
    </section>
  `;
}

function metricCard(title, value, caption, tone, icon, action) {
  return `
    <button class="metric-card" type="button" data-action="${action}">
      <span class="metric-icon ${tone}"><i class="fa-solid ${icon}"></i></span>
      <span>${title}</span>
      <strong>${typeof value === "number" ? formatCurrency(value) : value}</strong>
      <small>${caption}</small>
    </button>
  `;
}

function actionCard(title, text, icon, action) {
  return `
    <button class="action-card" type="button" data-action="${action}">
      <i class="fa-solid ${icon}"></i>
      <span>
        <strong>${title}</strong>
        <span>${text}</span>
      </span>
    </button>
  `;
}

function legendRow(label, value, tone) {
  return `
    <div class="legend-row">
      <span class="dot ${tone}"></span>
      <span>${label}</span>
      <strong>${formatCurrency(value)}</strong>
    </div>
  `;
}

function renderLoans() {
  const loans = getFilteredLoans();
  const selected = getSelectedLoan();

  dom.screens.loans.innerHTML = `
    ${renderHeader(
      "Meus emprestimos",
      "Filtros, busca, detalhes e cobranca.",
      "dashboard",
      `<button class="icon-button" type="button" data-action="reset-filter" aria-label="Limpar filtros"><i class="fa-solid fa-filter-circle-xmark"></i></button>`
    )}

    <div class="tabs" role="tablist">
      ${tabButton("all", "Todos")}
      ${tabButton("on-time", "Em dia")}
      ${tabButton("overdue", "Atrasados")}
      ${tabButton("paid", "Pagos")}
    </div>

    <label class="search-box">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input id="loan-search" type="search" placeholder="Buscar por nome..." value="${escapeHtml(state.search)}" />
    </label>

    <section class="loan-list">
      ${loans.length ? loans.map(renderLoanCard).join("") : emptyState("Nenhum emprestimo encontrado.")}
    </section>

    ${selected ? renderLoanDetail(selected) : ""}
  `;

  const search = document.querySelector("#loan-search");
  if (search) {
    search.addEventListener("input", (event) => {
      state.search = event.target.value;
      renderLoans();
    });
  }
}

function tabButton(filter, label) {
  return `
    <button class="tab-button ${state.filter === filter ? "is-active" : ""}" type="button" data-action="set-filter" data-filter="${filter}">
      ${label}
    </button>
  `;
}

function getFilteredLoans() {
  return getLoans().filter((loan) => {
    const matchSearch = !state.search || loan.name.toLowerCase().includes(state.search.toLowerCase());

    if (!matchSearch) {
      return false;
    }

    if (state.filter === "on-time") {
      return ["on-time", "soon", "due-today"].includes(loan.status);
    }

    if (state.filter === "overdue") {
      return loan.status === "overdue";
    }

    if (state.filter === "paid") {
      return loan.status === "paid";
    }

    return true;
  });
}

function renderLoanCard(loan) {
  const meta = statusMeta(loan);
  const selected = state.selectedLoanId === loan.id ? " is-selected" : "";

  return `
    <button class="loan-card${selected}" type="button" data-action="select-loan" data-loan-id="${loan.id}">
      <span class="avatar">${initials(loan.name)}</span>
      <span class="loan-main">
        <strong>${escapeHtml(loan.name)}</strong>
        <span class="status-${meta.tone}">${meta.detail}</span>
      </span>
      <span class="loan-side">
        <strong>${formatCurrency(loan.balance || loan.totalUpdated)}</strong>
        <span>${formatDate(loan.dueDate)}</span>
      </span>
    </button>
  `;
}

function renderLoanDetail(loan) {
  const meta = statusMeta(loan);
  const lateProjection = loan.balance + loan.totalOriginal * (parseNumber(loan.dailyLateRate) / 100) * 3;

  return `
    <section class="section-block panel-card loan-detail">
      <header class="detail-header">
        <span class="avatar">${initials(loan.name)}</span>
        <div>
          <h3>${escapeHtml(loan.name)}</h3>
          <p class="status-${meta.tone}">${meta.label}</p>
        </div>
        <button class="icon-button" type="button" data-action="open-loan-menu" data-loan-id="${loan.id}" aria-label="Acoes">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </header>

      <div class="detail-grid">
        ${detailLine("Valor emprestado", formatCurrency(loan.principal))}
        ${detailLine("Juros contratado", formatPercent(loan.interestRate))}
        ${detailLine("Valor dos juros", formatCurrency(loan.interestAmount))}
        ${detailLine("Total original", formatCurrency(loan.totalOriginal))}
        ${detailLine("Multa acumulada", formatCurrency(loan.lateInterest))}
        ${detailLine("Total atualizado", formatCurrency(loan.totalUpdated), "status-green")}
        ${detailLine("Saldo em aberto", formatCurrency(loan.balance))}
        ${detailLine("Data do emprestimo", formatDate(loan.issueDate))}
        ${detailLine("Vencimento", formatDate(loan.dueDate))}
        ${detailLine("Juros por atraso", formatPercent(loan.dailyLateRate) + " ao dia")}
      </div>

      <div class="late-box">
        <h4>Projecao de atraso</h4>
        <p>Se permanecer aberto por mais 3 dias, o total estimado sera ${formatCurrency(lateProjection)}.</p>
      </div>

      <div class="button-row">
        <button class="button button-primary" type="button" data-action="open-payment" data-loan-id="${loan.id}">
          <i class="fa-solid fa-circle-dollar-to-slot"></i>
          Receber
        </button>
        <button class="button button-secondary" type="button" data-action="whatsapp" data-loan-id="${loan.id}">
          <i class="fa-brands fa-whatsapp"></i>
          Cobrar
        </button>
        <button class="button button-ghost" type="button" data-action="edit-loan" data-loan-id="${loan.id}">
          <i class="fa-solid fa-pen"></i>
          Editar
        </button>
        <button class="button button-ghost" type="button" data-action="delete-loan" data-loan-id="${loan.id}">
          <i class="fa-solid fa-trash"></i>
          Excluir
        </button>
      </div>
    </section>
  `;
}

function detailLine(label, value, className = "") {
  return `
    <div class="detail-line">
      <span>${label}</span>
      <strong class="${className}">${value}</strong>
    </div>
  `;
}

function renderNewLoan() {
  const draft = getDraft();
  const preview = getPreview(draft);
  const isEditing = Boolean(state.editingLoanId);

  dom.screens.newLoan.innerHTML = `
    ${renderHeader(
      isEditing ? "Editar emprestimo" : "Novo emprestimo",
      "Calculo em tempo real com juros e multa automatica.",
      "loans",
      `<button class="icon-button" type="button" data-action="apply-defaults" aria-label="Usar padroes"><i class="fa-solid fa-wand-magic-sparkles"></i></button>`
    )}

    <form class="form-panel" id="loan-form">
      <label class="field">
        <span>Nome</span>
        <input name="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Nome do devedor" required />
      </label>
      <label class="field">
        <span>Telefone</span>
        <input name="phone" type="tel" value="${escapeHtml(draft.phone)}" placeholder="(71) 99999-9999" />
      </label>

      <div class="form-grid">
        <label class="field">
          <span>Valor emprestado</span>
          <input name="principal" type="text" inputmode="decimal" data-money value="${escapeHtml(draft.principal)}" placeholder="0,00" required />
        </label>
        <label class="field">
          <span>Juros contratado (%)</span>
          <input name="interestRate" type="text" inputmode="decimal" value="${escapeHtml(draft.interestRate)}" required />
        </label>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>Data do emprestimo</span>
          <input name="issueDate" type="date" value="${draft.issueDate}" required />
        </label>
        <label class="field">
          <span>Vencimento</span>
          <input name="dueDate" type="date" value="${draft.dueDate}" required />
        </label>
      </div>

      <label class="field">
        <span>Juros por atraso (% ao dia)</span>
        <input name="dailyLateRate" type="text" inputmode="decimal" value="${escapeHtml(draft.dailyLateRate)}" required />
      </label>

      <label class="field">
        <span>Observacoes</span>
        <textarea name="notes" rows="4" placeholder="Combinados, garantias, local de pagamento...">${escapeHtml(draft.notes)}</textarea>
      </label>

      <section class="preview-card">
        <h3>Calculo automatico</h3>
        <div class="preview-grid">
          ${previewItem("Juros", formatCurrency(preview.interestAmount), "interest")}
          ${previewItem("Total original", formatCurrency(preview.totalOriginal), "total")}
          ${previewItem("Atraso 3 dias", formatCurrency(preview.lateProjection), "late")}
          ${previewItem("Status previsto", preview.status, "status")}
        </div>
      </section>

      <div class="button-row">
        <button class="button button-ghost" type="button" data-action="clear-draft">Limpar</button>
        <button class="button button-primary" type="submit">${isEditing ? "Salvar" : "Cadastrar"}</button>
      </div>
    </form>
  `;

  const form = document.querySelector("#loan-form");
  form.addEventListener("input", updateDraftFromForm);
  form.addEventListener("submit", saveLoanFromForm);
}

function getDraft() {
  if (state.draft) {
    return state.draft;
  }

  if (state.editingLoanId) {
    const loan = state.data.loans.find((item) => item.id === state.editingLoanId);
    if (loan) {
      state.draft = { ...loan };
      return state.draft;
    }
  }

  state.draft = {
    name: "",
    phone: "",
    principal: "",
    interestRate: state.settings.defaultInterestRate,
    dailyLateRate: state.settings.defaultDailyLateRate,
    issueDate: todayIso(),
    dueDate: futureIso(30),
    notes: ""
  };

  return state.draft;
}

function updateDraftFromForm(event) {
  const data = new FormData(event.currentTarget);
  state.draft = {
    name: data.get("name") || "",
    phone: data.get("phone") || "",
    principal: data.get("principal") || "",
    interestRate: data.get("interestRate") || "",
    dailyLateRate: data.get("dailyLateRate") || "",
    issueDate: data.get("issueDate") || "",
    dueDate: data.get("dueDate") || "",
    notes: data.get("notes") || ""
  };
  updatePreviewPanel();
}

function getPreview(draft) {
  const principal = parseNumber(draft.principal);
  const interest = principal * (parseNumber(draft.interestRate) / 100);
  const total = principal + interest;
  const lateProjection = total + total * (parseNumber(draft.dailyLateRate) / 100) * 3;
  const dueDiff = draft.dueDate ? daysUntil(draft.dueDate) : 0;
  let status = "Em dia";

  if (dueDiff < 0) {
    status = "Atrasado";
  } else if (dueDiff === 0) {
    status = "Vence hoje";
  } else if (dueDiff <= 5) {
    status = "Proximo";
  }

  return {
    interestAmount: interest,
    totalOriginal: total,
    lateProjection,
    status
  };
}

function updatePreviewPanel() {
  const preview = getPreview(getDraft());
  const values = {
    interest: formatCurrency(preview.interestAmount),
    total: formatCurrency(preview.totalOriginal),
    late: formatCurrency(preview.lateProjection),
    status: preview.status
  };

  Object.entries(values).forEach(([key, value]) => {
    const target = document.querySelector(`[data-preview="${key}"]`);
    if (target) {
      target.textContent = value;
    }
  });
}

function previewItem(label, value, key) {
  return `
    <div class="preview-item">
      <span>${label}</span>
      <strong data-preview="${key}">${value}</strong>
    </div>
  `;
}

function saveLoanFromForm(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const existing = state.editingLoanId ? state.data.loans.find((loan) => loan.id === state.editingLoanId) : null;
  const payload = {
    id: state.editingLoanId || createId(),
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    principal: parseNumber(data.get("principal")),
    interestRate: parseNumber(data.get("interestRate")),
    dailyLateRate: parseNumber(data.get("dailyLateRate")),
    issueDate: data.get("issueDate"),
    dueDate: data.get("dueDate"),
    notes: String(data.get("notes") || "").trim(),
    payments: existing ? existing.payments || [] : [],
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!payload.name || payload.principal <= 0 || !payload.issueDate || !payload.dueDate) {
    alert("Preencha nome, valor e datas para salvar.");
    return;
  }

  if (parseDate(payload.dueDate) < parseDate(payload.issueDate)) {
    alert("O vencimento precisa ser posterior a data do emprestimo.");
    return;
  }

  if (existing) {
    state.data.loans = state.data.loans.map((loan) => (loan.id === existing.id ? payload : loan));
  } else {
    state.data.loans.unshift(payload);
  }

  state.selectedLoanId = payload.id;
  state.editingLoanId = null;
  state.draft = null;
  saveData();
  render();
  setScreen("loans");
}

function renderReports() {
  const metrics = getMetrics();

  dom.screens.reports.innerHTML = `
    ${renderHeader("Relatorios", "Lucro, recebimentos, atrasos e evolucao mensal.", "dashboard")}

    <section class="section-block">
      <div class="metric-grid">
        ${metricCard("Total emprestado", metrics.totalPrincipal, "Capital aplicado", "blue", "fa-money-bill-trend-up", "reports")}
        ${metricCard("A receber", metrics.totalReceivable, "Saldo aberto", "blue", "fa-sack-dollar", "reports")}
        ${metricCard("Recebido", metrics.totalPaid, "Pagamentos", "green", "fa-circle-dollar-to-slot", "reports")}
        ${metricCard("Atrasado", metrics.totalOverdue, `${metrics.lateRate}% da carteira`, "red", "fa-triangle-exclamation", "reports")}
        ${metricCard("Lucro projetado", metrics.profitProjected, "Juros contratados", "green", "fa-chart-pie", "reports")}
        ${metricCard("Lucro recebido", metrics.profitReceived, "Realizado", "green", "fa-chart-line", "reports")}
      </div>
    </section>

    <section class="section-block panel-card">
      <div class="section-head">
        <h3>Evolucao mensal</h3>
      </div>
      <div class="line-chart-box">
        <canvas id="monthly-chart"></canvas>
      </div>
    </section>

    <section class="section-block panel-card">
      <div class="section-head">
        <h3>Resumo por status</h3>
      </div>
      <div class="status-list">
        ${legendRow("Em dia", metrics.totalOnTime, "green")}
        ${legendRow("Atrasados", metrics.totalOverdue, "red")}
        ${legendRow("Pagos", metrics.totalPaid, "blue")}
      </div>
    </section>
  `;
}

function renderSettings() {
  dom.screens.settings.innerHTML = `
    ${renderHeader("Configuracoes", "Padroes, backup e seguranca.", "dashboard")}

    <form class="form-panel" id="settings-form">
      <div class="form-grid">
        <label class="field">
          <span>Juros padrao (%)</span>
          <input type="number" name="defaultInterestRate" min="0" step="0.01" value="${state.settings.defaultInterestRate}" />
        </label>
        <label class="field">
          <span>Multa padrao (% ao dia)</span>
          <input type="number" name="defaultDailyLateRate" min="0" step="0.01" value="${state.settings.defaultDailyLateRate}" />
        </label>
      </div>
      <button class="button button-primary" type="submit">
        <i class="fa-solid fa-floppy-disk"></i>
        Salvar padroes
      </button>
    </form>

    <section class="section-block">
      <div class="action-grid">
        ${actionCard("Exportar backup", "Baixar JSON com a carteira atual", "fa-download", "export")}
        ${actionCard("Importar backup", "Restaurar arquivo JSON", "fa-upload", "import")}
        ${actionCard("Limpar dados", "Apagar todos os emprestimos salvos", "fa-trash", "clear-data")}
        ${actionCard("Protecao por PIN", "Base preparada para ativacao futura", "fa-lock", "pin-info")}
      </div>
      <input class="hidden" type="file" id="import-file" accept="application/json" />
    </section>
  `;

  const settingsForm = document.querySelector("#settings-form");
  settingsForm.addEventListener("submit", saveSettingsFromForm);
  document.querySelector("#import-file").addEventListener("change", importBackup);
}

function renderRecentPayments() {
  const payments = getLoans()
    .flatMap((loan) => (loan.payments || []).map((payment) => ({ ...payment, loanName: loan.name })))
    .sort((a, b) => parseDate(b.paidAt) - parseDate(a.paidAt))
    .slice(0, 4);

  if (!payments.length) {
    return emptyState("Nenhum pagamento registrado ainda.");
  }

  return payments
    .map(
      (payment) => `
        <div class="panel-card">
          <div class="detail-line">
            <span>${escapeHtml(payment.loanName)} - ${formatDate(payment.paidAt)}</span>
            <strong class="status-green">${formatCurrency(payment.amount)}</strong>
          </div>
        </div>
      `
    )
    .join("");
}

function emptyState(text) {
  return `<div class="empty-state">${text}</div>`;
}

function openPaymentModal(loanId) {
  const loan = getLoan(loanId);

  if (!loan) {
    return;
  }

  dom.paymentForm.loanId.value = loan.id;
  dom.paymentForm.paidAt.value = todayIso();
  dom.paymentForm.amount.value = formatMoneyInputValue(loan.balance);
  dom.paymentForm.method.value = "Pix";
  dom.paymentForm.notes.value = "";
  openModal("payment-modal");
}

function openLoanMenu(loanId) {
  const loan = getLoan(loanId);

  if (!loan) {
    return;
  }

  dom.loanMenuActions.innerHTML = `
    <button class="button button-primary" type="button" data-action="open-payment" data-loan-id="${loan.id}">
      <i class="fa-solid fa-circle-dollar-to-slot"></i>
      Receber pagamento
    </button>
    <button class="button button-secondary" type="button" data-action="whatsapp" data-loan-id="${loan.id}">
      <i class="fa-brands fa-whatsapp"></i>
      Cobrar no WhatsApp
    </button>
    <button class="button button-ghost" type="button" data-action="edit-loan" data-loan-id="${loan.id}">
      <i class="fa-solid fa-pen"></i>
      Editar
    </button>
    <button class="button button-danger" type="button" data-action="delete-loan" data-loan-id="${loan.id}">
      <i class="fa-solid fa-trash"></i>
      Excluir
    </button>
  `;
  openModal("loan-menu-modal");
}

function openModal(id) {
  const modal = document.querySelector("#" + id);
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const modal = document.querySelector("#" + id);
  if (!modal) {
    return;
  }
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function submitPayment(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const loanId = data.get("loanId");
  const payment = {
    id: createId(),
    paidAt: data.get("paidAt"),
    amount: parseNumber(data.get("amount")),
    method: data.get("method") || "Pix",
    notes: data.get("notes") || ""
  };

  if (!loanId || payment.amount <= 0 || !payment.paidAt) {
    alert("Informe data e valor do pagamento.");
    return;
  }

  state.data.loans = state.data.loans.map((loan) => {
    if (loan.id !== loanId) {
      return loan;
    }
    return {
      ...loan,
      payments: [...(loan.payments || []), payment],
      updatedAt: new Date().toISOString()
    };
  });

  saveData();
  closeModal("payment-modal");
  closeModal("loan-menu-modal");
  render();
}

function editLoan(loanId) {
  const rawLoan = state.data.loans.find((loan) => loan.id === loanId);

  if (!rawLoan) {
    return;
  }

  state.editingLoanId = rawLoan.id;
  state.draft = { ...rawLoan };
  closeModal("loan-menu-modal");
  renderNewLoan();
  setScreen("newLoan");
}

function deleteLoan(loanId) {
  const loan = getLoan(loanId);

  if (!loan) {
    return;
  }

  if (!confirm("Excluir o emprestimo de " + loan.name + "?")) {
    return;
  }

  state.data.loans = state.data.loans.filter((item) => item.id !== loanId);
  if (state.selectedLoanId === loanId) {
    state.selectedLoanId = null;
  }
  saveData();
  closeModal("loan-menu-modal");
  render();
}

function whatsappLink(loan) {
  const digits = String(loan.phone || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const phone = digits.startsWith("55") ? digits : "55" + digits;
  const message =
    "Ol\u00e1 " +
    loan.name +
    ", tudo bem? Estou passando para lembrar sobre o empr\u00e9stimo com vencimento em " +
    formatDate(loan.dueDate) +
    ". O valor atualizado at\u00e9 hoje \u00e9 " +
    formatCurrency(loan.balance || loan.totalUpdated) +
    ".";

  return "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
}

function openWhatsapp(loanId) {
  const loan = getLoan(loanId);

  if (!loan) {
    return;
  }

  const link = whatsappLink(loan);

  if (!link) {
    alert("Cadastre um telefone para este cliente antes de cobrar pelo WhatsApp.");
    return;
  }

  window.open(link, "_blank", "noopener,noreferrer");
}

function saveSettingsFromForm(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.settings.defaultInterestRate = parseNumber(data.get("defaultInterestRate"));
  state.settings.defaultDailyLateRate = parseNumber(data.get("defaultDailyLateRate"));
  saveSettings();
  render();
  alert("Padroes salvos.");
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ data: state.data, settings: state.settings }, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tsdb-backup-" + todayIso() + ".json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function importBackup(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  file
    .text()
    .then((text) => {
      const payload = JSON.parse(text);
      const nextData = payload.data && Array.isArray(payload.data.loans) ? payload.data : payload;

      if (!nextData || !Array.isArray(nextData.loans)) {
        throw new Error("invalid backup");
      }

      state.data = normalizeData(nextData);
      state.settings = { ...defaultSettings, ...(payload.settings || state.settings) };
      state.selectedLoanId = null;
      state.draft = null;
      state.editingLoanId = null;
      saveData();
      saveSettings();
      render();
      alert("Backup importado.");
    })
    .catch(() => alert("Nao foi possivel importar este arquivo."));
}

function clearData() {
  if (!confirm("Limpar todos os dados do TSDBControol?")) {
    return;
  }

  state.data = { loans: [] };
  state.selectedLoanId = null;
  state.draft = null;
  state.editingLoanId = null;
  saveData();
  render();
}

function applyDefaults() {
  const draft = getDraft();
  state.draft = {
    ...draft,
    interestRate: state.settings.defaultInterestRate,
    dailyLateRate: state.settings.defaultDailyLateRate
  };
  renderNewLoan();
}

function clearDraft() {
  state.draft = null;
  state.editingLoanId = null;
  renderNewLoan();
}

function renderCharts() {
  if (typeof Chart === "undefined") {
    return;
  }

  const metrics = getMetrics();
  const donut = document.querySelector("#donut-chart");
  const monthly = document.querySelector("#monthly-chart");

  if (donut) {
    if (state.charts.donut) {
      state.charts.donut.destroy();
    }

    state.charts.donut = new Chart(donut, {
      type: "doughnut",
      data: {
        labels: ["Em dia", "Atrasados", "Pagos"],
        datasets: [
          {
            data: [metrics.totalOnTime, metrics.totalOverdue, metrics.totalPaid],
            backgroundColor: ["#42d66f", "#ff5e62", "#56b7ff"],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  if (monthly) {
    if (state.charts.monthly) {
      state.charts.monthly.destroy();
    }

    const series = monthlySeries();
    state.charts.monthly = new Chart(monthly, {
      type: "line",
      data: {
        labels: series.labels,
        datasets: [
          {
            label: "Recebido",
            data: series.values,
            borderColor: "#42d66f",
            backgroundColor: "rgba(66, 214, 111, 0.14)",
            borderWidth: 3,
            fill: true,
            tension: 0.36,
            pointRadius: 3,
            pointBackgroundColor: "#42d66f"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#9aaabc" }
          },
          y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: {
              color: "#9aaabc",
              callback: (value) => formatCurrency(value).replace(",00", "")
            }
          }
        }
      }
    });
  }
}

function monthlySeries() {
  const buckets = new Map();

  getLoans().forEach((loan) => {
    (loan.payments || []).forEach((payment) => {
      const date = parseDate(payment.paidAt);
      const key = String(date.getMonth() + 1).padStart(2, "0") + "/" + String(date.getFullYear()).slice(2);
      buckets.set(key, (buckets.get(key) || 0) + parseNumber(payment.amount));
    });
  });

  if (!buckets.size) {
    const labels = [];
    const values = [];
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date();
      date.setMonth(date.getMonth() - index);
      labels.push(String(date.getMonth() + 1).padStart(2, "0") + "/" + String(date.getFullYear()).slice(2));
      values.push(0);
    }
    return { labels, values };
  }

  const entries = Array.from(buckets.entries()).sort((a, b) => {
    const [monthA, yearA] = a[0].split("/");
    const [monthB, yearB] = b[0].split("/");
    return Number("20" + yearA + monthA) - Number("20" + yearB + monthB);
  });

  return {
    labels: entries.map(([label]) => label),
    values: entries.map(([, value]) => value)
  };
}

function bindEvents() {
  dom.navItems.forEach((item) => {
    item.addEventListener("click", () => setScreen(item.dataset.nav));
  });

  document.body.addEventListener("input", (event) => {
    const moneyInput = event.target.closest("[data-money]");
    if (moneyInput) {
      moneyInput.value = moneyInput.value.replace(/[^\d,.-]/g, "");
    }
  });

  document.body.addEventListener(
    "focusout",
    (event) => {
      const moneyInput = event.target.closest("[data-money]");
      if (moneyInput) {
        moneyInput.value = formatMoneyInputValue(moneyInput.value);
      }
    },
    true
  );

  document.body.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) {
      return;
    }

    const action = trigger.dataset.action;
    const loanId = trigger.dataset.loanId;

    if (["dashboard", "loans", "reports", "settings"].includes(action)) {
      setScreen(action);
    }

    if (action === "new-loan") {
      state.editingLoanId = null;
      state.draft = null;
      renderNewLoan();
      setScreen("newLoan");
    }

    if (action === "filter-overdue") {
      state.filter = "overdue";
      setScreen("loans");
      renderLoans();
    }

    if (action === "filter-on-time") {
      state.filter = "on-time";
      setScreen("loans");
      renderLoans();
    }

    if (action === "set-filter") {
      state.filter = trigger.dataset.filter;
      renderLoans();
    }

    if (action === "reset-filter") {
      state.filter = "all";
      state.search = "";
      renderLoans();
    }

    if (action === "select-loan") {
      state.selectedLoanId = loanId;
      renderLoans();
    }

    if (action === "open-payment") {
      openPaymentModal(loanId);
    }

    if (action === "open-loan-menu") {
      openLoanMenu(loanId);
    }

    if (action === "edit-loan") {
      editLoan(loanId);
    }

    if (action === "delete-loan") {
      deleteLoan(loanId);
    }

    if (action === "whatsapp") {
      openWhatsapp(loanId);
    }

    if (action === "close-modal") {
      closeModal(trigger.dataset.modal);
    }

    if (action === "clear-draft") {
      clearDraft();
    }

    if (action === "apply-defaults") {
      applyDefaults();
    }

    if (action === "export") {
      exportBackup();
    }

    if (action === "import") {
      document.querySelector("#import-file").click();
    }

    if (action === "clear-data") {
      clearData();
    }

    if (action === "pin-info") {
      alert("Protecao por PIN preparada para uma proxima versao.");
    }
  });

  dom.paymentForm.addEventListener("submit", submitPayment);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal("payment-modal");
      closeModal("loan-menu-modal");
    }
  });
}

function boot() {
  bindEvents();
  render();
  setScreen("dashboard");
  setTimeout(() => dom.loading.classList.add("is-hidden"), 600);
  setInterval(() => render(), 60000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => null);
  }
}

boot();
