const STORAGE_KEY = "tsdb-premium-v1";
const SETTINGS_KEY = "tsdb-premium-settings-v1";
const LEGACY_KEYS = ["tsdb-state-v2", "tsdb-state-v1"];
const DAY_MS = 86400000;

const defaultSettings = {
  defaultInterestRate: 30,
  defaultDailyLateRate: 2,
  pinEnabled: false,
  pinHash: ""
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
  reportPeriod: "month",
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
    calendar: document.querySelector("#screen-calendar"),
    reports: document.querySelector("#screen-reports"),
    settings: document.querySelector("#screen-settings")
  },
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  drawer: document.querySelector("#app-drawer"),
  drawerPanel: document.querySelector("#drawer-panel"),
  paymentModal: document.querySelector("#payment-modal"),
  paymentForm: document.querySelector("#payment-form"),
  loanMenuModal: document.querySelector("#loan-menu-modal"),
  loanMenuActions: document.querySelector("#loan-menu-actions"),
  pinModal: document.querySelector("#pin-modal"),
  pinForm: document.querySelector("#pin-form"),
  pinInput: document.querySelector("#pin-input"),
  pinError: document.querySelector("#pin-error")
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

  return { audit: [], loans: [] };
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
    audit: Array.isArray(data.audit) ? data.audit.map(normalizeAudit).filter(Boolean) : [],
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

  return { audit: [], loans };
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

function normalizeAudit(entry) {
  if (!entry || !entry.message) {
    return null;
  }

  return {
    id: entry.id || createId(),
    type: entry.type || "info",
    loanId: entry.loanId || "",
    message: String(entry.message || ""),
    createdAt: entry.createdAt || new Date().toISOString()
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

function addAudit(type, message, loanId = "") {
  state.data.audit = Array.isArray(state.data.audit) ? state.data.audit : [];
  state.data.audit.unshift({
    id: createId(),
    type,
    loanId,
    message,
    createdAt: new Date().toISOString()
  });
  state.data.audit = state.data.audit.slice(0, 300);
}

function getAudit(loanId = "") {
  return (state.data.audit || [])
    .filter((entry) => !loanId || entry.loanId === loanId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getPortfolioInsights(metrics = getMetrics()) {
  const loans = metrics.loans;
  const openLoans = loans.filter((loan) => loan.status !== "paid");
  const overdue = metrics.overdue.slice().sort((a, b) => b.lateDays - a.lateDays);
  const largest = openLoans.slice().sort((a, b) => b.balance - a.balance)[0];
  const bestPayer = loans
    .filter((loan) => loan.paidAmount > 0)
    .sort((a, b) => b.paidAmount - a.paidAmount)[0];
  const recurrence = new Map();

  loans.forEach((loan) => {
    const key = loan.name.toLowerCase();
    recurrence.set(key, {
      name: loan.name,
      count: (recurrence.get(key)?.count || 0) + 1
    });
  });

  const recurrent = Array.from(recurrence.values()).sort((a, b) => b.count - a.count)[0];

  return [
    {
      label: "Maior saldo",
      value: largest ? largest.name : "Sem saldo aberto",
      detail: largest ? formatCurrency(largest.balance) : "Carteira quitada",
      tone: "blue",
      icon: "fa-arrow-trend-up"
    },
    {
      label: "Maior atraso",
      value: overdue[0] ? overdue[0].name : "Sem atrasos",
      detail: overdue[0] ? overdue[0].lateDays + " dia(s)" : "Tudo sob controle",
      tone: overdue[0] ? "red" : "green",
      icon: "fa-bell"
    },
    {
      label: "Melhor pagador",
      value: bestPayer ? bestPayer.name : "Aguardando dados",
      detail: bestPayer ? formatCurrency(bestPayer.paidAmount) : "Sem pagamentos",
      tone: "green",
      icon: "fa-medal"
    },
    {
      label: "Cliente recorrente",
      value: recurrent && recurrent.count > 1 ? recurrent.name : "Ainda unico",
      detail: recurrent ? recurrent.count + " operacao(oes)" : "Sem historico",
      tone: "yellow",
      icon: "fa-repeat"
    }
  ];
}

function getPeriodRange(period) {
  const end = today();
  const start = today();

  if (period === "today") {
    return { start, end };
  }

  if (period === "week") {
    start.setDate(start.getDate() - 6);
    return { start, end };
  }

  if (period === "year") {
    start.setMonth(0, 1);
    return { start, end };
  }

  if (period === "all") {
    return { start: null, end: null };
  }

  start.setDate(1);
  return { start, end };
}

function isDateInRange(value, range) {
  if (!range.start || !range.end) {
    return true;
  }

  const date = parseDate(value);
  return date >= range.start && date <= range.end;
}

function getPeriodStats(period = state.reportPeriod) {
  const range = getPeriodRange(period);
  const loans = getLoans();
  const payments = loans.flatMap((loan) =>
    (loan.payments || []).map((payment) => ({
      ...payment,
      loanName: loan.name,
      principal: loan.principal
    }))
  );
  const periodPayments = payments.filter((payment) => isDateInRange(payment.paidAt, range));
  const received = periodPayments.reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
  const count = periodPayments.length;

  return {
    received,
    count,
    averageTicket: count ? received / count : 0,
    profitReceived: Math.max(received - periodPayments.reduce((sum, payment) => sum + Math.min(payment.principal, parseNumber(payment.amount)), 0), 0)
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
  renderCalendar();
  renderReports();
  renderSettings();
  renderDrawer();
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
      <button class="icon-button" type="button" data-action="${backAction || "open-drawer"}" aria-label="${backAction ? "Voltar" : "Abrir menu"}">
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
  const insights = getPortfolioInsights(metrics);

  dom.screens.dashboard.innerHTML = `
    ${renderHeader(
      "TSDB Emprestimos",
      "Sistema inteligente para controlar juros, vencimentos e recebimentos.",
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
        ${actionCard("Agenda", "Calendario de vencimentos e cobrancas", "fa-calendar-days", "calendar")}
        ${actionCard("Cobrar atrasados", "Abra a carteira filtrada por atraso", "fa-bolt", "filter-overdue")}
        ${actionCard("Exportar backup", "Seguranca rapida dos seus dados", "fa-download", "export")}
      </div>
    </section>

    <section class="section-block panel-card hero-panel">
      <div>
        <span class="eyebrow">Inteligencia da carteira</span>
        <h3>${metrics.overdue.length ? "Priorize os atrasos antes de novos aportes" : "Carteira saudavel e sob controle"}</h3>
        <p>${metrics.overdue.length ? `${metrics.overdue.length} operacao(oes) atrasada(s), somando ${formatCurrency(metrics.totalOverdue)}.` : "Nenhuma operacao atrasada no momento. Mantenha a agenda atualizada."}</p>
      </div>
      <button class="button button-secondary" type="button" data-action="calendar">
        <i class="fa-solid fa-calendar-check"></i>
        Ver agenda
      </button>
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
          <h3>Ranking inteligente</h3>
          <p>Prioridades e oportunidades da carteira</p>
        </div>
      </div>
      <div class="insight-grid">
        ${insights.map(renderInsightCard).join("")}
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

function renderInsightCard(item) {
  return `
    <article class="insight-card">
      <span class="metric-icon ${item.tone}"><i class="fa-solid ${item.icon}"></i></span>
      <div>
        <span>${item.label}</span>
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.detail)}</small>
      </div>
    </article>
  `;
}

function legendRow(label, value, tone) {
  return `
    <div class="legend-row">
      <span class="dot ${tone}"></span>
      <span>${label}</span>
      <strong>${typeof value === "number" ? formatCurrency(value) : escapeHtml(value)}</strong>
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

      <div class="finance-strip">
        ${miniStat("Lucro previsto", formatCurrency(loan.profitProjected), "green")}
        ${miniStat("Lucro recebido", formatCurrency(loan.profitReceived), "blue")}
        ${miniStat("Dias atraso", String(loan.lateDays), loan.lateDays ? "red" : "green")}
      </div>

      <section class="timeline-card">
        <div class="section-head">
          <h4>Historico e auditoria</h4>
        </div>
        ${renderLoanHistory(loan)}
      </section>

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
        <button class="button button-ghost" type="button" data-action="print-contract" data-loan-id="${loan.id}">
          <i class="fa-solid fa-file-signature"></i>
          Contrato
        </button>
        <button class="button button-ghost" type="button" data-action="print-receipt" data-loan-id="${loan.id}">
          <i class="fa-solid fa-receipt"></i>
          Recibo
        </button>
        <button class="button button-ghost" type="button" data-action="delete-loan" data-loan-id="${loan.id}">
          <i class="fa-solid fa-trash"></i>
          Excluir
        </button>
      </div>
    </section>
  `;
}

function miniStat(label, value, tone) {
  return `
    <div class="mini-stat ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderLoanHistory(loan) {
  const events = [
    {
      date: loan.createdAt,
      title: "Emprestimo criado",
      text: formatCurrency(loan.principal),
      tone: "green"
    },
    ...((loan.payments || []).map((payment) => ({
      date: payment.paidAt,
      title: "Pagamento recebido",
      text: formatCurrency(payment.amount) + " via " + payment.method,
      tone: "blue"
    }))),
    ...getAudit(loan.id).filter((entry) => entry.type !== "create").map((entry) => ({
      date: entry.createdAt,
      title: auditTitle(entry.type),
      text: entry.message,
      tone: entry.type === "delete" ? "red" : "yellow"
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  if (!events.length) {
    return emptyState("Nenhum historico registrado.");
  }

  return `
    <div class="audit-list">
      ${events
        .map(
          (event) => `
            <article class="audit-item">
              <span class="dot ${event.tone}"></span>
              <div>
                <strong>${escapeHtml(event.title)}</strong>
                <small>${formatDate(String(event.date).slice(0, 10))} - ${escapeHtml(event.text)}</small>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function auditTitle(type) {
  const titles = {
    create: "Cadastro",
    edit: "Edicao",
    payment: "Pagamento",
    delete: "Exclusao",
    import: "Importacao",
    security: "Seguranca"
  };

  return titles[type] || "Registro";
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
    addAudit("edit", "Emprestimo atualizado para " + payload.name + ".", payload.id);
  } else {
    state.data.loans.unshift(payload);
    addAudit("create", "Emprestimo criado para " + payload.name + " no valor de " + formatCurrency(payload.principal) + ".", payload.id);
  }

  state.selectedLoanId = payload.id;
  state.editingLoanId = null;
  state.draft = null;
  saveData();
  render();
  setScreen("loans");
}

function renderCalendar() {
  const loans = getLoans().filter((loan) => loan.status !== "paid");
  const todayLoans = loans.filter((loan) => loan.status === "due-today");
  const overdue = loans.filter((loan) => loan.status === "overdue");
  const nextLoans = loans
    .filter((loan) => loan.remainingDays > 0)
    .sort((a, b) => a.remainingDays - b.remainingDays)
    .slice(0, 12);

  dom.screens.calendar.innerHTML = `
    ${renderHeader("Agenda", "Vencimentos, atrasos e cobrancas do dia.", "dashboard")}

    <section class="section-block calendar-hero">
      <div class="calendar-day">
        <span>${new Date().toLocaleDateString("pt-BR", { weekday: "short" })}</span>
        <strong>${new Date().toLocaleDateString("pt-BR", { day: "2-digit" })}</strong>
        <small>${new Date().toLocaleDateString("pt-BR", { month: "long" })}</small>
      </div>
      <div>
        <span class="eyebrow">Agenda automatica</span>
        <h2>${todayLoans.length ? `${todayLoans.length} vencendo hoje` : "Nenhum vencimento hoje"}</h2>
        <p>${overdue.length ? `${overdue.length} operacao(oes) exigem cobranca.` : "Sem atrasos pendentes agora."}</p>
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h3>Atrasados</h3>
        <button class="link-button" type="button" data-action="filter-overdue">Cobrar</button>
      </div>
      <div class="loan-list">
        ${overdue.length ? overdue.map(renderAgendaItem).join("") : emptyState("Nenhum atraso na agenda.")}
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h3>Vencendo hoje</h3>
      </div>
      <div class="loan-list">
        ${todayLoans.length ? todayLoans.map(renderAgendaItem).join("") : emptyState("Nenhum vencimento para hoje.")}
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h3>Proximos 30 dias</h3>
      </div>
      <div class="timeline-list">
        ${nextLoans.length ? nextLoans.map(renderAgendaItem).join("") : emptyState("Sem proximos vencimentos cadastrados.")}
      </div>
    </section>
  `;
}

function renderAgendaItem(loan) {
  const meta = statusMeta(loan);
  return `
    <article class="agenda-item">
      <span class="agenda-date status-${meta.tone}">
        <strong>${loan.status === "overdue" ? loan.lateDays : Math.max(loan.remainingDays, 0)}</strong>
        <small>${loan.status === "overdue" ? "dias atraso" : "dias"}</small>
      </span>
      <div>
        <strong>${escapeHtml(loan.name)}</strong>
        <span>${meta.detail} - ${formatDate(loan.dueDate)}</span>
      </div>
      <button class="icon-button" type="button" data-action="open-loan-menu" data-loan-id="${loan.id}" aria-label="Acoes">
        <i class="fa-solid fa-ellipsis"></i>
      </button>
    </article>
  `;
}

function renderReports() {
  const metrics = getMetrics();
  const periodStats = getPeriodStats();

  dom.screens.reports.innerHTML = `
    ${renderHeader("Relatorios", "Lucro, recebimentos, atrasos e evolucao mensal.", "dashboard")}

    <div class="period-pills" role="tablist" aria-label="Periodo do relatorio">
      ${periodButton("today", "Hoje")}
      ${periodButton("week", "7 dias")}
      ${periodButton("month", "Mes")}
      ${periodButton("year", "Ano")}
      ${periodButton("all", "Tudo")}
    </div>

    <section class="section-block">
      <div class="metric-grid">
        ${metricCard("Total emprestado", metrics.totalPrincipal, "Capital aplicado", "blue", "fa-money-bill-trend-up", "reports")}
        ${metricCard("A receber", metrics.totalReceivable, "Saldo aberto", "blue", "fa-sack-dollar", "reports")}
        ${metricCard("Recebido", metrics.totalPaid, "Pagamentos", "green", "fa-circle-dollar-to-slot", "reports")}
        ${metricCard("Atrasado", metrics.totalOverdue, `${metrics.lateRate}% da carteira`, "red", "fa-triangle-exclamation", "reports")}
        ${metricCard("Lucro projetado", metrics.profitProjected, "Juros contratados", "green", "fa-chart-pie", "reports")}
        ${metricCard("Lucro recebido", metrics.profitReceived, "Realizado", "green", "fa-chart-line", "reports")}
        ${metricCard("Recebido periodo", periodStats.received, `${periodStats.count} pagamento(s)`, "green", "fa-calendar-check", "reports")}
        ${metricCard("Ticket medio", periodStats.averageTicket, "Media recebida", "yellow", "fa-receipt", "reports")}
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

function periodButton(period, label) {
  return `
    <button class="period-button ${state.reportPeriod === period ? "is-active" : ""}" type="button" data-action="set-report-period" data-period="${period}">
      ${label}
    </button>
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
      <section class="settings-security">
        <label class="switch-row">
          <span>
            <strong>Protecao por PIN</strong>
            <small>${state.settings.pinEnabled ? "Ativa neste navegador" : "Desativada"}</small>
          </span>
          <input type="checkbox" name="pinEnabled" ${state.settings.pinEnabled ? "checked" : ""} />
        </label>
        <label class="field">
          <span>${state.settings.pinEnabled ? "Alterar PIN" : "Criar PIN"}</span>
          <input type="password" name="pin" inputmode="numeric" minlength="4" placeholder="Minimo 4 digitos" />
        </label>
      </section>
      <button class="button button-primary" type="submit">
        <i class="fa-solid fa-floppy-disk"></i>
        Salvar configuracoes
      </button>
    </form>

    <section class="section-block">
      <div class="action-grid">
        ${actionCard("Exportar backup", "Baixar JSON com a carteira atual", "fa-download", "export")}
        ${actionCard("Exportar CSV", "Planilha simples para conferencia externa", "fa-file-csv", "export-csv")}
        ${actionCard("Importar backup", "Restaurar arquivo JSON", "fa-upload", "import")}
        ${actionCard("Limpar dados", "Apagar todos os emprestimos salvos", "fa-trash", "clear-data")}
        ${actionCard("Bloquear agora", "Exigir PIN imediatamente", "fa-lock", "lock-app")}
      </div>
      <input class="hidden" type="file" id="import-file" accept="application/json" />
    </section>

    <section class="section-block panel-card">
      <div class="section-head">
        <div>
          <h3>Seguranca dos dados</h3>
          <p>O app continua local e privado. Use backup JSON para trocar de aparelho.</p>
        </div>
      </div>
      <div class="status-list">
        ${legendRow("Base local", "localStorage ativo", "blue")}
        ${legendRow("PIN", state.settings.pinEnabled ? "Ativo" : "Desativado", state.settings.pinEnabled ? "green" : "yellow")}
        ${legendRow("Auditoria", `${getAudit().length} registro(s)`, "green")}
      </div>
    </section>
  `;

  const settingsForm = document.querySelector("#settings-form");
  settingsForm.addEventListener("submit", saveSettingsFromForm);
  document.querySelector("#import-file").addEventListener("change", importBackup);
}

function renderDrawer() {
  const metrics = getMetrics();
  dom.drawerPanel.innerHTML = `
    <header class="drawer-header">
      <div class="loading-logo">
        <i class="fa-solid fa-shield-halved"></i>
      </div>
      <div>
        <strong>TSDB Emprestimos</strong>
        <span>Carteira premium</span>
      </div>
      <button class="icon-button" type="button" data-action="close-drawer" aria-label="Fechar menu">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </header>

    <section class="drawer-balance">
      <span>Saldo aberto</span>
      <strong>${formatCurrency(metrics.totalReceivable)}</strong>
      <small>${metrics.active.length} operacao(oes) ativa(s)</small>
    </section>

    <nav class="drawer-nav" aria-label="Opcoes do aplicativo">
      ${drawerButton("dashboard", "Inicio", "Painel principal", "fa-house")}
      ${drawerButton("new-loan", "Novo emprestimo", "Cadastro rapido", "fa-plus")}
      ${drawerButton("loans", "Emprestimos", "Busca, filtros e detalhes", "fa-wallet")}
      ${drawerButton("calendar", "Agenda", "Vencimentos e atrasos", "fa-calendar-days")}
      ${drawerButton("reports", "Relatorios", "Graficos e indicadores", "fa-chart-column")}
      ${drawerButton("settings", "Configuracoes", "Padroes, PIN e backup", "fa-gear")}
    </nav>

    <section class="drawer-tools">
      ${drawerButton("export", "Backup JSON", "Exportar dados", "fa-download")}
      ${drawerButton("export-csv", "Exportar CSV", "Baixar planilha", "fa-file-csv")}
      ${drawerButton("import", "Importar JSON", "Restaurar backup", "fa-upload")}
      ${drawerButton("lock-app", "Bloquear", state.settings.pinEnabled ? "Exigir PIN" : "Ative o PIN nos ajustes", "fa-lock")}
    </section>
  `;
}

function drawerButton(action, title, text, icon) {
  return `
    <button class="drawer-item" type="button" data-action="${action}">
      <i class="fa-solid ${icon}"></i>
      <span>
        <strong>${title}</strong>
        <small>${text}</small>
      </span>
    </button>
  `;
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
      Cobrar padrao
    </button>
    <button class="button button-secondary" type="button" data-action="whatsapp-template" data-template="friendly" data-loan-id="${loan.id}">
      <i class="fa-regular fa-comment-dots"></i>
      Lembrete educado
    </button>
    <button class="button button-secondary" type="button" data-action="whatsapp-template" data-template="firm" data-loan-id="${loan.id}">
      <i class="fa-solid fa-bolt"></i>
      Cobranca firme
    </button>
    <button class="button button-secondary" type="button" data-action="whatsapp-template" data-template="late" data-loan-id="${loan.id}">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Aviso de atraso
    </button>
    <button class="button button-ghost" type="button" data-action="edit-loan" data-loan-id="${loan.id}">
      <i class="fa-solid fa-pen"></i>
      Editar
    </button>
    <button class="button button-ghost" type="button" data-action="print-contract" data-loan-id="${loan.id}">
      <i class="fa-solid fa-file-signature"></i>
      Gerar contrato
    </button>
    <button class="button button-ghost" type="button" data-action="print-receipt" data-loan-id="${loan.id}">
      <i class="fa-solid fa-receipt"></i>
      Gerar recibo
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

  addAudit("payment", "Pagamento registrado no valor de " + formatCurrency(payment.amount) + ".", loanId);
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

  addAudit("delete", "Emprestimo excluido: " + loan.name + ".", loanId);
  state.data.loans = state.data.loans.filter((item) => item.id !== loanId);
  if (state.selectedLoanId === loanId) {
    state.selectedLoanId = null;
  }
  saveData();
  closeModal("loan-menu-modal");
  render();
}

function whatsappLink(loan, template = "default") {
  const digits = String(loan.phone || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const phone = digits.startsWith("55") ? digits : "55" + digits;
  const value = formatCurrency(loan.balance || loan.totalUpdated);
  const dueDate = formatDate(loan.dueDate);
  const messages = {
    default:
      "Ol\u00e1 " +
      loan.name +
      ", tudo bem? Estou passando para lembrar sobre o empr\u00e9stimo com vencimento em " +
      dueDate +
      ". O valor atualizado at\u00e9 hoje \u00e9 " +
      value +
      ".",
    friendly:
      "Ol\u00e1 " +
      loan.name +
      ", tudo bem? Passando so para lembrar com antecedencia do nosso combinado. Vencimento: " +
      dueDate +
      ". Valor atualizado: " +
      value +
      ".",
    firm:
      "Ol\u00e1 " +
      loan.name +
      ". Preciso alinhar a regularizacao do emprestimo com vencimento em " +
      dueDate +
      ". Valor atualizado ate hoje: " +
      value +
      ". Fico no aguardo do retorno.",
    late:
      "Ol\u00e1 " +
      loan.name +
      ". O emprestimo esta em atraso ha " +
      loan.lateDays +
      " dia(s). O valor atualizado ate hoje e " +
      value +
      ". Por favor, me envie uma previsao de pagamento."
  };
  const message = messages[template] || messages.default;

  return "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
}

function openWhatsapp(loanId, template = "default") {
  const loan = getLoan(loanId);

  if (!loan) {
    return;
  }

  const link = whatsappLink(loan, template);

  if (!link) {
    alert("Cadastre um telefone para este cliente antes de cobrar pelo WhatsApp.");
    return;
  }

  window.open(link, "_blank", "noopener,noreferrer");
}

function printLoanDocument(loanId, type) {
  const loan = getLoan(loanId);

  if (!loan) {
    return;
  }

  const latestPayment = (loan.payments || []).slice().sort((a, b) => parseDate(b.paidAt) - parseDate(a.paidAt))[0];

  if (type === "receipt" && !latestPayment) {
    alert("Registre um pagamento antes de gerar recibo.");
    return;
  }

  const title = type === "receipt" ? "Recibo de pagamento" : "Termo de emprestimo";
  const body =
    type === "receipt"
      ? `
        <p>Recebi de <strong>${escapeHtml(loan.name)}</strong> o valor de <strong>${formatCurrency(latestPayment.amount)}</strong> referente ao emprestimo com vencimento em <strong>${formatDate(loan.dueDate)}</strong>.</p>
        <p>Data do pagamento: <strong>${formatDate(latestPayment.paidAt)}</strong></p>
        <p>Metodo: <strong>${escapeHtml(latestPayment.method || "Nao informado")}</strong></p>
        <p>Saldo atualizado apos registros: <strong>${formatCurrency(loan.balance)}</strong></p>
      `
      : `
        <p>Cliente: <strong>${escapeHtml(loan.name)}</strong></p>
        <p>Telefone: <strong>${escapeHtml(loan.phone || "Nao informado")}</strong></p>
        <p>Valor emprestado: <strong>${formatCurrency(loan.principal)}</strong></p>
        <p>Juros contratado: <strong>${formatPercent(loan.interestRate)}</strong></p>
        <p>Total original: <strong>${formatCurrency(loan.totalOriginal)}</strong></p>
        <p>Data do emprestimo: <strong>${formatDate(loan.issueDate)}</strong></p>
        <p>Data de vencimento: <strong>${formatDate(loan.dueDate)}</strong></p>
        <p>Juros por atraso: <strong>${formatPercent(loan.dailyLateRate)} ao dia</strong></p>
        <p>Observacoes: ${escapeHtml(loan.notes || "Sem observacoes.")}</p>
      `;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Permita pop-ups para gerar o documento.");
    return;
  }

  win.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 36px; color: #101820; line-height: 1.55; }
          .doc { max-width: 760px; margin: 0 auto; border: 1px solid #d8dee8; border-radius: 18px; padding: 28px; }
          h1 { margin: 0 0 8px; }
          .muted { color: #637083; margin-bottom: 28px; }
          .sign { margin-top: 56px; display: grid; gap: 26px; }
          .line { border-top: 1px solid #101820; padding-top: 8px; text-align: center; }
        </style>
      </head>
      <body>
        <main class="doc">
          <h1>${title}</h1>
          <p class="muted">Documento gerado pelo TSDB Emprestimos em ${formatDate(todayIso())}.</p>
          ${body}
          <section class="sign">
            <div class="line">Credor</div>
            <div class="line">${escapeHtml(loan.name)}</div>
          </section>
        </main>
        <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
      </body>
    </html>
  `);
  win.document.close();
  addAudit(type === "receipt" ? "payment" : "info", title + " gerado para " + loan.name + ".", loan.id);
  saveData();
}

function exportCsv() {
  const headers = [
    "nome",
    "telefone",
    "valor_emprestado",
    "juros_percentual",
    "total_original",
    "multa_atraso",
    "total_atualizado",
    "saldo_aberto",
    "valor_pago",
    "status",
    "data_emprestimo",
    "vencimento"
  ];
  const rows = getLoans().map((loan) => [
    loan.name,
    loan.phone,
    loan.principal,
    loan.interestRate,
    loan.totalOriginal,
    loan.lateInterest,
    loan.totalUpdated,
    loan.balance,
    loan.paidAmount,
    statusMeta(loan).label,
    loan.issueDate,
    loan.dueDate
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tsdb-carteira-" + todayIso() + ".csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function hashPin(pin) {
  const value = String(pin || "");
  if (window.crypto && window.crypto.subtle) {
    const buffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return "fallback-" + hash;
}

function lockApp() {
  if (!state.settings.pinEnabled || !state.settings.pinHash) {
    alert("Ative e salve um PIN nas configuracoes antes de bloquear.");
    return;
  }

  dom.pinModal.classList.add("is-open");
  dom.pinModal.setAttribute("aria-hidden", "false");
  dom.pinInput.value = "";
  dom.pinError.textContent = "";
  setTimeout(() => dom.pinInput.focus(), 80);
}

async function unlockApp(event) {
  event.preventDefault();
  const pin = new FormData(event.currentTarget).get("pin");
  const hash = await hashPin(pin);

  if (hash !== state.settings.pinHash) {
    dom.pinError.textContent = "PIN incorreto. Tente novamente.";
    return;
  }

  dom.pinModal.classList.remove("is-open");
  dom.pinModal.setAttribute("aria-hidden", "true");
  dom.pinInput.value = "";
  dom.pinError.textContent = "";
}

function openDrawer() {
  renderDrawer();
  dom.drawer.classList.add("is-open");
  dom.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  dom.drawer.classList.remove("is-open");
  dom.drawer.setAttribute("aria-hidden", "true");
}

async function saveSettingsFromForm(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.settings.defaultInterestRate = parseNumber(data.get("defaultInterestRate"));
  state.settings.defaultDailyLateRate = parseNumber(data.get("defaultDailyLateRate"));
  const wantsPin = data.get("pinEnabled") === "on";
  const wasPinEnabled = Boolean(state.settings.pinEnabled);
  const pin = String(data.get("pin") || "").trim();

  if (wantsPin && !state.settings.pinHash && pin.length < 4) {
    alert("Informe um PIN com pelo menos 4 digitos para ativar a protecao.");
    return;
  }

  if (pin) {
    if (pin.length < 4) {
      alert("O PIN precisa ter pelo menos 4 digitos.");
      return;
    }
    state.settings.pinHash = await hashPin(pin);
    addAudit("security", "PIN de acesso atualizado.");
  }

  state.settings.pinEnabled = wantsPin;
  if (!wantsPin) {
    state.settings.pinHash = "";
    if (wasPinEnabled) {
      addAudit("security", "PIN de acesso desativado.");
    }
  }
  saveSettings();
  saveData();
  render();
  alert("Configuracoes salvas.");
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
      addAudit("import", "Backup JSON importado com sucesso.");
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
  if (!confirm("Limpar todos os dados do TSDB Emprestimos?")) {
    return;
  }

  addAudit("delete", "Todos os dados foram limpos.");
  state.data = { audit: [], loans: [] };
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
            backgroundColor: ["#f0bd3d", "#ff654e", "#8d7c55"],
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
            borderColor: "#f0bd3d",
            backgroundColor: "rgba(240, 189, 61, 0.16)",
            borderWidth: 3,
            fill: true,
            tension: 0.36,
            pointRadius: 3,
            pointBackgroundColor: "#f0bd3d"
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
            grid: { color: "rgba(244,199,93,0.09)" },
            ticks: { color: "#c8b987" }
          },
          y: {
            grid: { color: "rgba(244,199,93,0.09)" },
            ticks: {
              color: "#c8b987",
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

    if (["dashboard", "loans", "calendar", "reports", "settings"].includes(action)) {
      closeDrawer();
      setScreen(action);
    }

    if (action === "new-loan") {
      closeDrawer();
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

    if (action === "set-report-period") {
      state.reportPeriod = trigger.dataset.period || "month";
      renderReports();
      setTimeout(renderCharts, 40);
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

    if (action === "whatsapp-template") {
      openWhatsapp(loanId, trigger.dataset.template || "default");
    }

    if (action === "print-contract") {
      printLoanDocument(loanId, "contract");
    }

    if (action === "print-receipt") {
      printLoanDocument(loanId, "receipt");
    }

    if (action === "close-modal") {
      closeModal(trigger.dataset.modal);
    }

    if (action === "open-drawer") {
      openDrawer();
    }

    if (action === "close-drawer") {
      closeDrawer();
    }

    if (action === "clear-draft") {
      clearDraft();
    }

    if (action === "apply-defaults") {
      applyDefaults();
    }

    if (action === "export") {
      closeDrawer();
      exportBackup();
    }

    if (action === "export-csv") {
      closeDrawer();
      exportCsv();
    }

    if (action === "import") {
      closeDrawer();
      document.querySelector("#import-file").click();
    }

    if (action === "clear-data") {
      clearData();
    }

    if (action === "lock-app") {
      closeDrawer();
      lockApp();
    }
  });

  dom.paymentForm.addEventListener("submit", submitPayment);
  dom.pinForm.addEventListener("submit", unlockApp);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal("payment-modal");
      closeModal("loan-menu-modal");
      closeDrawer();
    }
  });
}

function boot() {
  bindEvents();
  render();
  setScreen("dashboard");
  setTimeout(() => dom.loading.classList.add("is-hidden"), 600);
  if (state.settings.pinEnabled && state.settings.pinHash) {
    setTimeout(lockApp, 720);
  }
  setInterval(() => render(), 60000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => null);
  }
}

boot();
