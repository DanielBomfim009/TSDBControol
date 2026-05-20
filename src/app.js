import { mockData } from "./data/mockData.js";
import { formatCurrency, formatDate, formatPercent } from "./utils/format.js";

const STORAGE_KEY = "tsdb-state-v2";
const LEGACY_STORAGE_KEY = "tsdb-state-v1";
const DAY = 86400000;

const elements = {
  views: Array.from(document.querySelectorAll(".view")),
  navLinks: Array.from(document.querySelectorAll(".mobile-nav__item")),
  dashboard: document.querySelector("#dashboard"),
  loans: document.querySelector("#emprestimos"),
  reports: document.querySelector("#relatorios"),
  settings: document.querySelector("#configuracoes"),
  loanClientSelect: document.querySelector("#loan-client-select"),
  paymentLoanSelect: document.querySelector("#payment-loan-select"),
  clientForm: document.querySelector("#client-form"),
  loanForm: document.querySelector("#loan-form"),
  paymentForm: document.querySelector("#payment-form")
};

let state = loadState();
let currentView = "dashboard";
let selectedLoanId = state.loans[0] ? state.loans[0].id : null;
let loanFilter = "todos";
let loanSearch = "";

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
  const calculated = Number(loan.principal) * (1 + Number(loan.rate) / 100);
  return loan.manualTarget === null || loan.manualTarget === undefined ? calculated : Number(loan.manualTarget);
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
  const lateCharge = outstanding * (Number(loan.lateFeeRate) / 100) * lateDays;

  return target + lateCharge;
}

function getLoanComputed(loan) {
  const client = getClientById(loan.clientId);
  const paidAmount = getPaidAmount(loan.id);
  const baseTarget = getBaseTarget(loan);
  const currentTarget = getCurrentTarget(loan);
  const lateDays = getLateDays(loan);
  const remaining = Math.max(currentTarget - paidAmount, 0);
  let status = "em-dia";

  if (loan.status === "cancelado") {
    status = "cancelado";
  } else if (remaining === 0) {
    status = "pago";
  } else if (lateDays > 0) {
    status = "atrasado";
  } else if (differenceInDays(loan.dueDate) <= 7) {
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
    paidAmount: paidAmount,
    baseTarget: baseTarget,
    currentTarget: currentTarget,
    lateDays: lateDays,
    remaining: remaining,
    status: status,
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

function getSelectedLoan() {
  const loans = getComputedLoans();
  const current = loans.find(function (loan) {
    return loan.id === selectedLoanId;
  });

  if (current) {
    return current;
  }

  selectedLoanId = loans[0] ? loans[0].id : null;
  return loans[0] || null;
}

function getMetrics() {
  const loans = getComputedLoans();
  const totalPrincipal = loans.reduce(function (sum, loan) {
    return sum + loan.principal;
  }, 0);
  const totalExpected = loans.reduce(function (sum, loan) {
    return sum + loan.baseTarget;
  }, 0);
  const totalCurrent = loans.reduce(function (sum, loan) {
    return sum + loan.currentTarget;
  }, 0);
  const totalReceived = loans.reduce(function (sum, loan) {
    return sum + loan.paidAmount;
  }, 0);
  const overdueLoans = loans.filter(function (loan) {
    return loan.status === "atrasado";
  });
  const openLoans = loans.filter(function (loan) {
    return loan.remaining > 0 && loan.status !== "atrasado";
  });
  const paidLoans = loans.filter(function (loan) {
    return loan.status === "pago";
  });

  return {
    totalPrincipal: totalPrincipal,
    totalExpected: totalExpected,
    totalCurrent: totalCurrent,
    totalReceived: totalReceived,
    profitExpected: loans.reduce(function (sum, loan) {
      return sum + loan.profitExpected;
    }, 0),
    profitReceived: loans.reduce(function (sum, loan) {
      return sum + loan.profitReceived;
    }, 0),
    overdueAmount: overdueLoans.reduce(function (sum, loan) {
      return sum + loan.remaining;
    }, 0),
    openAmount: openLoans.reduce(function (sum, loan) {
      return sum + loan.remaining;
    }, 0),
    paidAmount: totalReceived,
    overdueCount: overdueLoans.length,
    dueSoonCount: loans.filter(function (loan) {
      const diff = differenceInDays(loan.dueDate);
      return diff >= 0 && diff <= 7 && loan.remaining > 0;
    }).length,
    activeClients: state.clients.filter(function (client) {
      return client.status === "ativo";
    }).length,
    openLoansCount: openLoans.length,
    paidLoansCount: paidLoans.length
  };
}

function getGreetingName() {
  return "Daniel";
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(function (part) {
      return part.charAt(0).toUpperCase();
    })
    .join("");
}

function getLoanStatusMeta(loan) {
  if (loan.status === "pago") {
    return {
      label: `Pago em ${formatDate(getLastPaymentDate(loan.id) || loan.dueDate)}`,
      textClass: "status-text--green",
      indicatorClass: "status-indicator status-indicator--blue"
    };
  }

  if (loan.status === "atrasado") {
    return {
      label: `Vencido ha ${loan.lateDays} dia(s)`,
      textClass: "status-text--red",
      indicatorClass: "status-indicator status-indicator--red"
    };
  }

  const days = differenceInDays(loan.dueDate);
  if (days === 0) {
    return {
      label: "Vence hoje",
      textClass: "status-text--yellow",
      indicatorClass: "status-indicator status-indicator--yellow"
    };
  }

  return {
    label: `Vence em ${Math.max(days, 0)} dia(s)`,
    textClass: loan.status === "vencendo" ? "status-text--yellow" : "status-text--green",
    indicatorClass: loan.status === "vencendo" ? "status-indicator status-indicator--yellow" : "status-indicator"
  };
}

function getLastPaymentDate(loanId) {
  const payments = getPaymentsByLoanId(loanId).sort(function (a, b) {
    return parseDate(b.paidAt) - parseDate(a.paidAt);
  });

  return payments[0] ? payments[0].paidAt : null;
}

function getDonutBackground() {
  const metrics = getMetrics();
  const total = metrics.openAmount + metrics.overdueAmount + metrics.paidAmount;
  const safeTotal = total || 1;
  const greenShare = (metrics.openAmount / safeTotal) * 100;
  const redShare = (metrics.overdueAmount / safeTotal) * 100;
  const blueShare = 100 - greenShare - redShare;

  return `conic-gradient(
    var(--green) 0% ${greenShare}%,
    var(--red) ${greenShare}% ${greenShare + redShare}%,
    var(--blue) ${greenShare + redShare}% ${greenShare + redShare + blueShare}%,
    rgba(255, 255, 255, 0.08) 100% 100%
  )`;
}

function getLoanHistory(loan) {
  const items = [
    {
      type: "created",
      title: "Emprestimo criado",
      subtitle: formatDate(loan.issuedAt),
      amount: formatCurrency(loan.principal)
    }
  ];

  getPaymentsByLoanId(loan.id)
    .sort(function (a, b) {
      return parseDate(a.paidAt) - parseDate(b.paidAt);
    })
    .forEach(function (payment) {
      items.push({
        type: "payment",
        title: payment.method ? `Pagamento via ${payment.method}` : "Pagamento registrado",
        subtitle: formatDate(payment.paidAt),
        amount: formatCurrency(payment.amount)
      });
    });

  if (loan.lateDays > 0) {
    items.push({
      type: "late",
      title: "Atualizacao automatica",
      subtitle: `Juros acumulados por ${loan.lateDays} dia(s)`,
      amount: formatCurrency(loan.currentTarget - loan.baseTarget)
    });
  }

  return items;
}

function getFilteredLoans() {
  return getComputedLoans().filter(function (loan) {
    const name = loan.client ? loan.client.name.toLowerCase() : "";
    const searchOk = !loanSearch || name.includes(loanSearch.toLowerCase());

    if (!searchOk) {
      return false;
    }

    if (loanFilter === "todos") {
      return true;
    }

    if (loanFilter === "em-dia") {
      return loan.status === "em-dia" || loan.status === "vencendo";
    }

    if (loanFilter === "atrasados") {
      return loan.status === "atrasado";
    }

    if (loanFilter === "pagos") {
      return loan.status === "pago";
    }

    return true;
  });
}

function getUpcomingLoans(limit) {
  return getComputedLoans()
    .filter(function (loan) {
      return loan.remaining > 0;
    })
    .slice(0, limit);
}

function getMonthlyPaymentSeries() {
  const payments = cloneData(state.payments).sort(function (a, b) {
    return parseDate(a.paidAt) - parseDate(b.paidAt);
  });

  if (!payments.length) {
    return [0, 0, 0, 0, 0, 0];
  }

  const buckets = {};
  payments.forEach(function (payment) {
    const day = String(parseDate(payment.paidAt).getDate()).padStart(2, "0");
    buckets[day] = (buckets[day] || 0) + Number(payment.amount || 0);
  });

  const days = Object.keys(buckets).sort();
  let running = 0;

  return days.map(function (day) {
    running += buckets[day];
    return {
      label: day,
      value: running
    };
  });
}

function getChartMarkup() {
  const series = getMonthlyPaymentSeries();
  const normalizedSeries = series.length
    ? series
    : [
        { label: "01", value: 0 },
        { label: "08", value: 0 },
        { label: "15", value: 0 },
        { label: "22", value: 0 },
        { label: "29", value: 0 }
      ];

  const width = 300;
  const height = 160;
  const maxValue = Math.max.apply(
    null,
    normalizedSeries.map(function (item) {
      return item.value;
    }).concat([1])
  );

  const points = normalizedSeries.map(function (item, index) {
    const x = normalizedSeries.length === 1 ? width / 2 : (index / (normalizedSeries.length - 1)) * width;
    const y = height - (item.value / maxValue) * (height - 20) - 10;
    return { x: x, y: y };
  });

  const polyline = points
    .map(function (point) {
      return `${point.x},${point.y}`;
    })
    .join(" ");

  const area = [
    `M ${points[0].x} ${height}`,
    `L ${points[0].x} ${points[0].y}`,
    points
      .slice(1)
      .map(function (point) {
        return `L ${point.x} ${point.y}`;
      })
      .join(" "),
    `L ${points[points.length - 1].x} ${height}`,
    "Z"
  ].join(" ");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path class="area" d="${area}"></path>
      <polyline class="line" points="${polyline}"></polyline>
    </svg>
    <div class="chart-axis">
      ${normalizedSeries.map(function (item) {
        return `<span>${item.label}</span>`;
      }).join("")}
    </div>
  `;
}

function renderHeader(config) {
  return `
    <header class="screen-header">
      <div class="status-bar">
        <strong>9:41</strong>
        <div class="status-bar__icons">
          <span class="status-dot"></span>
          <span class="status-dot"></span>
          <span class="status-dot"></span>
        </div>
      </div>
      <div class="screen-header__row">
        <button type="button" class="icon-shell">${config.leftIcon || "="}</button>
        <div class="screen-header__title">
          <h1>${config.title}</h1>
          <p>${config.subtitle}</p>
        </div>
        <button type="button" class="icon-shell ${config.rightClass || ""}">${config.rightIcon || "+"}</button>
      </div>
    </header>
  `;
}

function renderDashboard() {
  const metrics = getMetrics();
  const upcomingLoans = getUpcomingLoans(4);

  elements.dashboard.innerHTML = `
    ${renderHeader({
      leftIcon: "=",
      title: `Ola, ${getGreetingName()}!`,
      subtitle: "Aqui esta o resumo dos seus emprestimos",
      rightIcon: "!",
      rightClass: "notification"
    })}

    <div class="screen-stack">
      <section class="summary-card">
        <div class="card-heading">
          <div>
            <h3>Resumo geral</h3>
          </div>
          <p>Atualizado hoje, 08:30</p>
        </div>

        <div class="stat-grid">
          <article class="stat-tile">
            <span class="stat-tile__icon stat-tile__icon--green">R$</span>
            <span>Total emprestado</span>
            <strong>${formatCurrency(metrics.totalPrincipal)}</strong>
          </article>
          <article class="stat-tile">
            <span class="stat-tile__icon stat-tile__icon--blue">IN</span>
            <span>A receber</span>
            <strong>${formatCurrency(metrics.totalCurrent)}</strong>
          </article>
          <article class="stat-tile">
            <span class="stat-tile__icon stat-tile__icon--yellow">OK</span>
            <span>Em dia</span>
            <strong>${formatCurrency(metrics.openAmount)}</strong>
          </article>
          <article class="stat-tile">
            <span class="stat-tile__icon stat-tile__icon--red">AL</span>
            <span>Atrasados</span>
            <strong>${formatCurrency(metrics.overdueAmount)}</strong>
          </article>
        </div>
      </section>

      <section class="summary-card">
        <div class="card-heading">
          <div>
            <h3>Visao geral</h3>
          </div>
        </div>

        <div class="overview-grid">
          <div class="donut" style="background:${getDonutBackground()}">
            <div class="donut__center">
              <span>Total a receber</span>
              <strong>${formatCurrency(metrics.totalCurrent)}</strong>
            </div>
          </div>

          <div class="legend">
            <div class="legend-row">
              <span class="legend-swatch legend-swatch--green"></span>
              <span>Em dia</span>
              <strong>${formatCurrency(metrics.openAmount)}</strong>
            </div>
            <div class="legend-row">
              <span class="legend-swatch legend-swatch--red"></span>
              <span>Atrasados</span>
              <strong>${formatCurrency(metrics.overdueAmount)}</strong>
            </div>
            <div class="legend-row">
              <span class="legend-swatch legend-swatch--blue"></span>
              <span>Pagos</span>
              <strong>${formatCurrency(metrics.paidAmount)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="loan-list-card">
        <div class="card-heading">
          <div>
            <h3>Emprestimos proximos do vencimento</h3>
          </div>
          <button type="button" class="mini-link" data-view-target="emprestimos">Ver todos</button>
        </div>
        <div class="loan-list">
          ${upcomingLoans.length ? upcomingLoans.map(renderCompactLoanRow).join("") : `<div class="empty-state"><p>Nenhum emprestimo cadastrado ainda.</p></div>`}
        </div>
      </section>
    </div>
  `;
}

function renderCompactLoanRow(loan) {
  const status = getLoanStatusMeta(loan);
  return `
    <button type="button" class="loan-row loan-row--button" data-action="select-loan" data-loan-id="${loan.id}">
      <span class="avatar">${getInitials(loan.client ? loan.client.name : "TS")}</span>
      <span class="loan-row__content">
        <h4>${loan.client ? loan.client.name : "Cliente nao encontrado"}</h4>
        <p class="${status.textClass}">${status.label}</p>
      </span>
      <span class="loan-row__amount">
        <strong>${formatCurrency(loan.remaining > 0 ? loan.remaining : loan.baseTarget)}</strong>
        <span>${formatDate(loan.dueDate)}</span>
      </span>
      <span class="${status.indicatorClass}"></span>
    </button>
  `;
}

function renderLoans() {
  const filteredLoans = getFilteredLoans();
  const selectedLoan = getSelectedLoan();

  elements.loans.innerHTML = `
    ${renderHeader({
      leftIcon: "<",
      title: "Meus Emprestimos",
      subtitle: "Controle sua carteira com filtros rapidos",
      rightIcon: ":"
    })}

    <div class="toolbar">
      <div class="tab-strip">
        ${renderFilterTab("todos", "Todos")}
        ${renderFilterTab("em-dia", "Em dia")}
        ${renderFilterTab("atrasados", "Atrasados")}
        ${renderFilterTab("pagos", "Pagos")}
      </div>

      <label class="search-bar">
        <span>Q</span>
        <input type="search" value="${escapeAttribute(loanSearch)}" data-role="loan-search" placeholder="Buscar por nome..." />
      </label>
    </div>

    <div class="screen-stack">
      <section class="loan-list-card">
        <div class="loan-list">
          ${filteredLoans.length ? filteredLoans.map(renderExpandedLoanRow).join("") : `<div class="empty-state"><p>Nenhum emprestimo encontrado para este filtro.</p></div>`}
        </div>
      </section>

      ${selectedLoan ? renderLoanDetail(selectedLoan) : `<section class="detail-card"><div class="empty-state"><p>Selecione um emprestimo para ver os detalhes.</p></div></section>`}
    </div>
  `;
}

function renderFilterTab(value, label) {
  return `
    <button type="button" class="tab-button ${loanFilter === value ? "is-active" : ""}" data-action="set-loan-filter" data-filter="${value}">
      ${label}
    </button>
  `;
}

function renderExpandedLoanRow(loan) {
  const status = getLoanStatusMeta(loan);
  return `
    <button type="button" class="loan-row loan-row--button" data-action="select-loan" data-loan-id="${loan.id}">
      <span class="avatar">${getInitials(loan.client ? loan.client.name : "TS")}</span>
      <span class="loan-row__content">
        <h4>${loan.client ? loan.client.name : "Cliente nao encontrado"}</h4>
        <p class="${status.textClass}">${status.label}</p>
      </span>
      <span class="loan-row__amount">
        <strong>${formatCurrency(loan.remaining > 0 ? loan.remaining : loan.baseTarget)}</strong>
        <span>${formatDate(loan.dueDate)}</span>
      </span>
      <span class="${status.indicatorClass}"></span>
    </button>
  `;
}

function renderLoanDetail(loan) {
  const history = getLoanHistory(loan);
  const latePreviewDays = loan.lateDays > 0 ? 3 : 3;
  const latePreviewTotal = loan.remaining + loan.remaining * (loan.lateFeeRate / 100) * latePreviewDays;
  const status = getLoanStatusMeta(loan);

  return `
    <section class="detail-card">
      <div class="detail-hero">
        <span class="avatar">${getInitials(loan.client ? loan.client.name : "TS")}</span>
        <div>
          <h3>${loan.client ? loan.client.name : "Cliente nao encontrado"}</h3>
          <p class="${status.textClass}">${status.label}</p>
        </div>
      </div>

      <div class="metric-lines">
        <div class="metric-line"><span>Valor emprestado</span><strong>${formatCurrency(loan.principal)}</strong></div>
        <div class="metric-line"><span>Juros contratado</span><strong>${formatPercent(loan.rate)}</strong></div>
        <div class="metric-line"><span>Valor dos juros</span><strong>${formatCurrency(loan.baseTarget - loan.principal)}</strong></div>
        <div class="metric-line"><span>Total a receber</span><strong class="status-text--green">${formatCurrency(loan.currentTarget)}</strong></div>
        <div class="metric-line"><span>Data do emprestimo</span><strong>${formatDate(loan.issuedAt)}</strong></div>
        <div class="metric-line"><span>Data de vencimento</span><strong>${formatDate(loan.dueDate)}</strong></div>
        <div class="metric-line"><span>Juros por atraso</span><strong>${formatPercent(loan.lateFeeRate)} ao dia</strong></div>
      </div>

      <div class="late-preview">
        <h4>Se atrasar ${latePreviewDays} dias</h4>
        <p>Acrescimo estimado de ${formatCurrency(loan.remaining * (loan.lateFeeRate / 100) * latePreviewDays)}</p>
        <strong>Total: ${formatCurrency(latePreviewTotal)}</strong>
      </div>

      <div class="history-list">
        <h3>Historico</h3>
        ${history.map(renderHistoryItem).join("")}
      </div>

      <div class="detail-action">
        <button type="button" class="button button--primary" data-action="open-payment" data-loan-id="${loan.id}">
          Registrar pagamento
        </button>
      </div>
    </section>
  `;
}

function renderHistoryItem(item) {
  const bulletClass = item.type === "payment" ? "history-bullet" : "history-bullet history-bullet--blue";
  return `
    <article class="history-item">
      <span class="${bulletClass}"></span>
      <div>
        <h4>${item.subtitle}</h4>
        <p>${item.title}</p>
      </div>
      <strong>${item.amount}</strong>
    </article>
  `;
}

function renderReports() {
  const metrics = getMetrics();
  const total = metrics.totalReceived || 1;
  const healthyPct = Math.round((metrics.openAmount / (metrics.openAmount + metrics.overdueAmount || 1)) * 100);
  const overduePct = 100 - healthyPct;

  elements.reports.innerHTML = `
    ${renderHeader({
      leftIcon: "<",
      title: "Relatorios",
      subtitle: "Leitura financeira da carteira",
      rightIcon: "."
    })}

    <div class="screen-stack">
      <section class="report-card">
        <div class="select-row">
          <h3>Este mes</h3>
          <div class="period-pill">Mensal</div>
        </div>

        <div class="report-total">
          <p>Total a receber</p>
          <strong>${formatCurrency(metrics.totalCurrent)}</strong>
          <span>Lucro recebido ${formatCurrency(metrics.profitReceived)}</span>
          <p>Comparativo visual do que entrou e do que segue em aberto.</p>
        </div>

        <div class="chart-card">
          <h4>Evolucao dos recebimentos</h4>
          <div class="chart-wrap">
            ${getChartMarkup()}
          </div>
        </div>

        <div class="summary-list">
          <div class="summary-line">
            <span class="legend-swatch legend-swatch--green"></span>
            <span>Em dia</span>
            <strong>${formatCurrency(metrics.openAmount)}</strong>
            <small>${healthyPct}%</small>
          </div>
          <div class="summary-line">
            <span class="legend-swatch legend-swatch--red"></span>
            <span>Atrasados</span>
            <strong>${formatCurrency(metrics.overdueAmount)}</strong>
            <small>${overduePct}%</small>
          </div>
          <div class="summary-line">
            <span class="legend-swatch legend-swatch--blue"></span>
            <span>Pagos</span>
            <strong>${formatCurrency(metrics.totalReceived)}</strong>
            <small>${Math.round((metrics.totalReceived / total) * 100)}%</small>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderSettings() {
  const recentClients = cloneData(state.clients).slice(0, 4);
  const recentPayments = cloneData(state.payments)
    .sort(function (a, b) {
      return parseDate(b.paidAt) - parseDate(a.paidAt);
    })
    .slice(0, 4);

  elements.settings.innerHTML = `
    ${renderHeader({
      leftIcon: "<",
      title: "Configuracoes",
      subtitle: "Backup, clientes e manutencao",
      rightIcon: "."
    })}

    <div class="settings-grid">
      <section class="settings-card">
        <h3>Base do aplicativo</h3>
        <p>Seus dados ficam salvos localmente e podem ser exportados em JSON a qualquer momento.</p>
        <div class="settings-actions">
          <button type="button" class="button button--primary" data-action="export-data">Exportar backup</button>
          <button type="button" class="button button--secondary" data-action="open-client">Novo cliente</button>
        </div>
      </section>

      <section class="settings-card">
        <h3>Importar base</h3>
        <p>Restaure um backup salvo anteriormente para recuperar clientes, emprestimos e pagamentos.</p>
        <input class="file-input" id="import-input" type="file" accept="application/json" />
      </section>

      <section class="settings-card">
        <div class="card-heading">
          <div>
            <h3>Clientes recentes</h3>
          </div>
          <span>${state.clients.length} total</span>
        </div>
        <div class="client-list">
          ${recentClients.length ? recentClients.map(renderClientCard).join("") : `<div class="empty-state"><p>Nenhum cliente cadastrado ainda.</p></div>`}
        </div>
      </section>

      <section class="settings-card">
        <div class="card-heading">
          <div>
            <h3>Ultimos pagamentos</h3>
          </div>
          <span>${state.payments.length} total</span>
        </div>
        <div class="payment-list">
          ${recentPayments.length ? recentPayments.map(renderPaymentCard).join("") : `<div class="empty-state"><p>Nenhum pagamento registrado ainda.</p></div>`}
        </div>
      </section>
    </div>
  `;

  const importInput = document.querySelector("#import-input");
  if (importInput) {
    importInput.addEventListener("change", handleImport);
  }
}

function renderClientCard(client) {
  const clientLoans = getComputedLoans().filter(function (loan) {
    return loan.clientId === client.id;
  });
  const openAmount = clientLoans.reduce(function (sum, loan) {
    return sum + loan.remaining;
  }, 0);

  return `
    <article class="client-card">
      <div class="client-card__top">
        <div>
          <h4>${client.name}</h4>
          <p>${client.phone || "Telefone nao informado"}</p>
        </div>
        <span class="status-pill status-pill--${client.status}">${client.status}</span>
      </div>
      <div class="client-meta">
        <div class="meta-pair"><span>Saldo em aberto</span><strong>${formatCurrency(openAmount)}</strong></div>
        <div class="meta-pair"><span>Operacoes</span><strong>${clientLoans.length}</strong></div>
      </div>
    </article>
  `;
}

function renderPaymentCard(payment) {
  const loan = state.loans.find(function (item) {
    return item.id === payment.loanId;
  });
  const client = loan ? getClientById(loan.clientId) : null;

  return `
    <article class="payment-card">
      <div class="payment-card__top">
        <div>
          <h4>${client ? client.name : "Cliente nao encontrado"}</h4>
          <p>${formatDate(payment.paidAt)}${payment.method ? ` | ${payment.method}` : ""}</p>
        </div>
        <strong>${formatCurrency(payment.amount)}</strong>
      </div>
      <p>${payment.notes || "Sem observacoes para este pagamento."}</p>
    </article>
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
  renderDashboard();
  renderLoans();
  renderReports();
  renderSettings();
  renderSelectOptions();
  updateNavState();
}

function updateNavState() {
  elements.views.forEach(function (view) {
    view.classList.toggle("is-active", view.id === currentView);
  });

  elements.navLinks.forEach(function (link) {
    link.classList.toggle("is-active", link.dataset.viewTarget === currentView);
  });
}

function switchView(viewId) {
  currentView = viewId;
  updateNavState();
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

  selectedLoanId = state.loans[0].id;
  persistState();
  renderAll();
  switchView("emprestimos");
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

  selectedLoanId = String(formData.get("loanId"));
  persistState();
  renderAll();
  switchView("emprestimos");
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
      selectedLoanId = state.loans[0] ? state.loans[0].id : null;
      persistState();
      renderAll();
    })
    .catch(function () {
      window.alert("Nao foi possivel importar este arquivo JSON.");
    });
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function bindEvents() {
  elements.navLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      switchView(link.dataset.viewTarget);
    });
  });

  document.body.addEventListener("click", function (event) {
    const trigger = event.target.closest("[data-action], [data-view-target]");
    if (!trigger) {
      return;
    }

    if (trigger.dataset.viewTarget && !trigger.dataset.action) {
      switchView(trigger.dataset.viewTarget);
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

    if (action === "select-loan") {
      selectedLoanId = trigger.dataset.loanId;
      switchView("emprestimos");
      renderAll();
    }

    if (action === "set-loan-filter") {
      loanFilter = trigger.dataset.filter;
      renderLoans();
      updateNavState();
    }
  });

  document.body.addEventListener("input", function (event) {
    if (event.target.matches("[data-role='loan-search']")) {
      loanSearch = event.target.value;
      renderLoans();
      updateNavState();
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
