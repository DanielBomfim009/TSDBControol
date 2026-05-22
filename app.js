const STORAGE_KEY = "tsdb-premium-v1";
const SETTINGS_KEY = "tsdb-premium-settings-v1";
const LEGACY_KEYS = ["tsdb-state-v2", "tsdb-state-v1"];
const DAY_MS = 86400000;

const defaultSettings = {
  defaultInterestRate: 30,
  defaultDailyLateRate: 2,
  walletAvailable: 0,
  walletSetupDone: false,
  pinEnabled: false,
  pinHash: ""
};

const state = {
  data: loadData(),
  settings: loadSettings(),
  screen: "dashboard",
  filter: "all",
  search: "",
  clientSearch: "",
  selectedLoanId: null,
  selectedClientKey: null,
  editingLoanId: null,
  draft: null,
  reportPeriod: "month"
};

const dom = {
  loading: document.querySelector("#loading-screen"),
  appDevice: document.querySelector(".app-device"),
  screens: {
    walletSetup: document.querySelector("#screen-wallet-setup"),
    dashboard: document.querySelector("#screen-dashboard"),
    wallet: document.querySelector("#screen-wallet"),
    clients: document.querySelector("#screen-clients"),
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
  renewalModal: document.querySelector("#renewal-modal"),
  renewalForm: document.querySelector("#renewal-form"),
  renewalPreview: document.querySelector("#renewal-preview"),
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

  return { audit: [], walletMovements: [], loans: [] };
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
    walletMovements: Array.isArray(data.walletMovements)
      ? data.walletMovements.map(normalizeWalletMovement).filter(Boolean)
      : [],
    loans: (data.loans || []).map((loan) => ({
      id: loan.id || createId(),
      name: String(loan.name || loan.clientName || "Cliente sem nome"),
      phone: String(loan.phone || ""),
      principal: parseNumber(loan.principal),
      originalPrincipal: parseNumber(loan.originalPrincipal || loan.principal),
      interestRate: parseNumber(loan.interestRate ?? loan.rate),
      dailyLateRate: parseNumber(loan.dailyLateRate ?? loan.lateFeeRate),
      issueDate: loan.issueDate || loan.issuedAt || todayIso(),
      dueDate: loan.dueDate || todayIso(),
      notes: String(loan.notes || ""),
      payments: (loan.payments || []).map(normalizePayment),
      renewals: (loan.renewals || []).map(normalizeRenewal).filter(Boolean),
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
      originalPrincipal: parseNumber(loan.originalPrincipal || loan.principal),
      interestRate: parseNumber(loan.interestRate ?? loan.rate),
      dailyLateRate: parseNumber(loan.dailyLateRate ?? loan.lateFeeRate),
      issueDate: loan.issueDate || loan.issuedAt || todayIso(),
      dueDate: loan.dueDate || todayIso(),
      notes: loan.notes || "",
      payments: payments.filter((payment) => payment.loanId === loan.id).map(normalizePayment),
      renewals: (loan.renewals || []).map(normalizeRenewal).filter(Boolean),
      createdAt: loan.createdAt || new Date().toISOString(),
      updatedAt: loan.updatedAt || null
    };
  });

  return { audit: [], walletMovements: [], loans };
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

function normalizeRenewal(renewal) {
  if (!renewal) {
    return null;
  }

  return {
    id: renewal.id || createId(),
    renewedAt: renewal.renewedAt || renewal.date || todayIso(),
    paidAmount: parseNumber(renewal.paidAmount),
    profitReceived: parseNumber(renewal.profitReceived),
    previousPaidAmount: parseNumber(renewal.previousPaidAmount),
    previousProfitReceived: parseNumber(renewal.previousProfitReceived),
    previousPrincipal: parseNumber(renewal.previousPrincipal),
    previousTotalUpdated: parseNumber(renewal.previousTotalUpdated),
    previousBalance: parseNumber(renewal.previousBalance),
    nextPrincipal: parseNumber(renewal.nextPrincipal),
    nextDueDate: renewal.nextDueDate || todayIso(),
    notes: String(renewal.notes || ""),
    previousPayments: (renewal.previousPayments || []).map(normalizePayment)
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

function normalizeWalletMovement(entry) {
  if (!entry || !entry.label) {
    return null;
  }

  return {
    id: entry.id || createId(),
    type: entry.type || "adjust",
    loanId: entry.loanId || "",
    amount: parseNumber(entry.amount),
    label: String(entry.label || ""),
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

function addMonthsIso(value, months = 1) {
  const source = parseDate(value || todayIso());
  const day = source.getDate();
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function nextMonthlyDueDate(value) {
  let next = addMonthsIso(value || todayIso(), 1);

  while (parseDate(next) <= today()) {
    next = addMonthsIso(next, 1);
  }

  return next;
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

function roundMoney(value) {
  return Math.round(parseNumber(value) * 100) / 100;
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

function formatShortCurrency(value) {
  const amount = Number(value || 0);

  if (Math.abs(amount) < 1000) {
    return formatCurrency(amount);
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(amount);
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

function blurActiveControl() {
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) {
    active.blur();
  }
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
  const originalPrincipal = parseNumber(loan.originalPrincipal || loan.principal);
  const renewals = (loan.renewals || []).map(normalizeRenewal).filter(Boolean);
  const renewalPaidAmount = renewals.reduce(
    (sum, renewal) => sum + parseNumber(renewal.previousPaidAmount) + parseNumber(renewal.paidAmount),
    0
  );
  const renewalProfitReceived = renewals.reduce(
    (sum, renewal) => sum + parseNumber(renewal.previousProfitReceived) + parseNumber(renewal.profitReceived),
    0
  );
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

  const principalPaid = Math.min(paidAmount, principal);
  const principalOpen = status === "paid" ? 0 : Math.max(principal - principalPaid, 0);
  const profitOpen = status === "paid" ? 0 : Math.max(balance - principalOpen, 0);
  const profitReceived = Math.max(Math.min(paidAmount, totalUpdated) - principal, 0);

  return {
    ...loan,
    principal,
    originalPrincipal,
    interestAmount,
    totalOriginal,
    lateInterest,
    totalUpdated,
    paidAmount,
    renewalPaidAmount,
    totalPaidReceived: renewalPaidAmount + paidAmount,
    balance,
    principalPaid,
    principalOpen,
    profitOpen,
    lateDays,
    remainingDays,
    status,
    settledAt,
    renewals,
    profitProjected: totalOriginal - principal,
    profitReceived,
    renewalProfitReceived,
    totalProfitReceived: renewalProfitReceived + profitReceived
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
  const clientGroups = buildClientGroups(loans);
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
    totalPrincipal: loans.reduce((sum, loan) => sum + loan.originalPrincipal, 0),
    openPrincipal: active.reduce((sum, loan) => sum + loan.principalOpen, 0),
    totalReceivable: active.reduce((sum, loan) => sum + loan.balance, 0),
    totalProjected: loans.reduce((sum, loan) => sum + loan.totalUpdated, 0),
    totalPaid: loans.reduce((sum, loan) => sum + loan.totalPaidReceived, 0),
    totalOverdue: overdue.reduce((sum, loan) => sum + loan.balance, 0),
    totalOnTime: onTime.reduce((sum, loan) => sum + loan.balance, 0),
    profitProjected: loans.reduce((sum, loan) => sum + loan.profitProjected, 0),
    profitOpen: active.reduce((sum, loan) => sum + loan.profitOpen, 0),
    profitReceived: loans.reduce((sum, loan) => sum + loan.totalProfitReceived, 0),
    walletAvailable: getWalletAvailable(),
    clients: clientNames.size,
    clientGroups,
    activeClients: clientGroups.filter((client) => client.balance > 0).length,
    overdueClients: clientGroups.filter((client) => client.overdueCount > 0).length,
    lateRate: loans.length ? Math.round((overdue.length / loans.length) * 100) : 0
  };
}

function clientKey(name, phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  const normalizedName = String(name || "Cliente sem nome")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return digits || normalizedName || createId();
}

function buildClientGroups(loans = getLoans()) {
  const groups = new Map();

  loans.forEach((loan) => {
    const key = clientKey(loan.name, loan.phone);
    const current =
      groups.get(key) ||
      {
        key,
        name: loan.name,
        phone: loan.phone,
        loans: [],
        totalPrincipal: 0,
        openPrincipal: 0,
        totalPaid: 0,
        balance: 0,
        profitOpen: 0,
        profitReceived: 0,
        overdueCount: 0,
        activeCount: 0,
        paidCount: 0,
        nextDueDate: "",
        lastIssueDate: ""
      };

    current.loans.push(loan);
    current.totalPrincipal += loan.originalPrincipal;
    current.openPrincipal += loan.principalOpen;
    current.totalPaid += loan.totalPaidReceived;
    current.balance += loan.balance;
    current.profitOpen += loan.profitOpen;
    current.profitReceived += loan.totalProfitReceived;
    current.overdueCount += loan.status === "overdue" ? 1 : 0;
    current.activeCount += loan.status !== "paid" ? 1 : 0;
    current.paidCount += loan.status === "paid" ? 1 : 0;
    current.nextDueDate =
      loan.status !== "paid" && (!current.nextDueDate || parseDate(loan.dueDate) < parseDate(current.nextDueDate))
        ? loan.dueDate
        : current.nextDueDate;
    current.lastIssueDate =
      !current.lastIssueDate || parseDate(loan.issueDate) > parseDate(current.lastIssueDate)
        ? loan.issueDate
        : current.lastIssueDate;

    groups.set(key, current);
  });

  return Array.from(groups.values())
    .map((client) => ({
      ...client,
      status: client.overdueCount ? "overdue" : client.activeCount ? "active" : "paid",
      loans: client.loans.sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate))
    }))
    .sort((a, b) => b.overdueCount - a.overdueCount || b.balance - a.balance || a.name.localeCompare(b.name));
}

function getClientGroups() {
  const search = state.clientSearch.trim().toLowerCase();

  return buildClientGroups().filter((client) => {
    if (!search) {
      return true;
    }

    const phoneSearch = search.replace(/\D/g, "");
    return client.name.toLowerCase().includes(search) || (phoneSearch && String(client.phone || "").replace(/\D/g, "").includes(phoneSearch));
  });
}

function getSelectedClient() {
  if (!state.selectedClientKey) {
    return null;
  }

  return buildClientGroups().find((client) => client.key === state.selectedClientKey) || null;
}

function getWalletAvailable() {
  return Math.max(parseNumber(state.settings.walletAvailable), 0);
}

function updateWalletAvailable(delta, movement = {}) {
  const current = getWalletAvailable();
  const next = Math.max(current + Number(delta || 0), 0);
  const applied = next - current;

  state.settings.walletAvailable = next;

  if (applied) {
    addWalletMovement(
      movement.type || (applied > 0 ? "inflow" : "outflow"),
      applied,
      movement.label || (applied > 0 ? "Entrada na carteira" : "Saida da carteira"),
      movement.loanId || ""
    );
  }

  saveSettings();
}

function completeWalletSetup(amount = 0, movementLabel = "") {
  const value = Math.max(parseNumber(amount), 0);
  state.settings.walletAvailable = value;
  state.settings.walletSetupDone = true;

  if (value > 0 && movementLabel) {
    addWalletMovement("setup", value, movementLabel);
    addAudit("wallet", movementLabel + " em " + formatCurrency(value) + ".");
  }

  saveSettings();
  saveData();
  render();
  setScreen("dashboard");
}

function addWalletMovement(type, amount, label, loanId = "") {
  state.data.walletMovements = Array.isArray(state.data.walletMovements) ? state.data.walletMovements : [];
  state.data.walletMovements.unshift({
    id: createId(),
    type,
    loanId,
    amount: Number(amount || 0),
    label,
    createdAt: new Date().toISOString()
  });
  state.data.walletMovements = state.data.walletMovements.slice(0, 500);
}

function getWalletMovements() {
  return (state.data.walletMovements || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
      value: recurrent && recurrent.count > 1 ? recurrent.name : "Ainda único",
      detail: recurrent ? recurrent.count + " operação(ões)" : "Sem histórico",
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

function getReceivedEvents(loans = getLoans()) {
  return loans
    .flatMap((loan) => {
      const renewalEvents = (loan.renewals || []).flatMap((renewal) => {
        const previousPayments = (renewal.previousPayments || []).length
          ? (renewal.previousPayments || []).map((payment) => ({
              ...payment,
              loanId: loan.id,
              loanName: loan.name,
              principal: renewal.previousPrincipal,
              source: "payment"
            }))
          : parseNumber(renewal.previousPaidAmount) > 0
            ? [
                {
                  id: renewal.id + "-previous",
                  paidAt: renewal.renewedAt,
                  amount: renewal.previousPaidAmount,
                  method: "Pagamento anterior",
                  notes: "",
                  loanId: loan.id,
                  loanName: loan.name,
                  principal: renewal.previousPrincipal,
                  profitAmount: renewal.previousProfitReceived,
                  source: "payment"
                }
              ]
            : [];

        const renewalPayment = parseNumber(renewal.paidAmount) > 0
          ? [
              {
                id: renewal.id,
                paidAt: renewal.renewedAt,
                amount: renewal.paidAmount,
                method: "Renovação",
                notes: renewal.notes,
                loanName: loan.name,
                loanId: loan.id,
                principal: renewal.previousPrincipal,
                profitAmount: renewal.profitReceived,
                source: "renewal"
              }
            ]
          : [];

        return [...previousPayments, ...renewalPayment];
      });

      const currentPayments = (loan.payments || []).map((payment) => ({
        ...payment,
        loanId: loan.id,
        loanName: loan.name,
        principal: loan.principal,
        source: "payment"
      }));

      return [...renewalEvents, ...currentPayments];
    })
    .sort((a, b) => parseDate(b.paidAt) - parseDate(a.paidAt));
}

function getPaymentProfitAmount(payment) {
  if (Number.isFinite(payment.profitAmount)) {
    return parseNumber(payment.profitAmount);
  }

  return Math.max(parseNumber(payment.amount) - Math.min(parseNumber(payment.principal), parseNumber(payment.amount)), 0);
}

function getPeriodStats(period = state.reportPeriod) {
  const range = getPeriodRange(period);
  const payments = getReceivedEvents();
  const periodPayments = payments.filter((payment) => isDateInRange(payment.paidAt, range));
  const received = periodPayments.reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
  const count = periodPayments.length;

  return {
    received,
    count,
    averageTicket: count ? received / count : 0,
    profitReceived: periodPayments.reduce((sum, payment) => sum + getPaymentProfitAmount(payment), 0)
  };
}

function monthKey(date) {
  const parsed = date instanceof Date ? date : parseDate(date);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthlySeries(months = 6) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const anchor = today();
  anchor.setDate(1);

  const rows = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - index, 1, 12);
    rows.push({
      key: monthKey(date),
      label: formatter.format(date).replace(".", ""),
      lent: 0,
      received: 0
    });
  }

  const byKey = new Map(rows.map((row) => [row.key, row]));

  getLoans().forEach((loan) => {
    const loanMonth = byKey.get(monthKey(String(loan.createdAt || loan.issueDate).slice(0, 10)));
    if (loanMonth) {
      loanMonth.lent += loan.originalPrincipal;
    }
  });

  getReceivedEvents().forEach((payment) => {
    const paymentMonth = byKey.get(monthKey(payment.paidAt));
    if (paymentMonth) {
      paymentMonth.received += parseNumber(payment.amount);
    }
  });

  return rows;
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
      detail: "Vencido há " + loan.lateDays + " dia(s)",
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
      label: "Próximo",
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
  renderWalletSetup();
  renderDashboard();
  renderWallet();
  renderClients();
  renderLoans();
  renderNewLoan();
  renderCalendar();
  renderReports();
  renderSettings();
  renderDrawer();
  setScreen(state.screen);
}

function setScreen(screen) {
  blurActiveControl();
  state.screen = screen;
  Object.entries(dom.screens).forEach(([key, element]) => {
    element.classList.toggle("is-active", key === screen);
  });
  dom.navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.nav === screen);
  });
  dom.appDevice.classList.toggle("is-setup-mode", screen === "walletSetup");
}

function renderHeader(title, subtitle, backAction, actions = "") {
  const isBrandHeader = !backAction;
  return `
    <header class="screen-header centered">
      <button class="icon-button" type="button" data-action="${backAction || "open-drawer"}" aria-label="${backAction ? "Voltar" : "Abrir menu"}">
        <i class="fa-solid ${backAction ? "fa-arrow-left" : "fa-bars"}"></i>
      </button>
      <div class="screen-title ${isBrandHeader ? "brand-screen-title" : ""}">
        ${
          isBrandHeader
            ? `<div class="brand-heading">
                <img src="./assets/tsdb-logo.svg" alt="TSDB Empréstimos" />
              </div>`
            : `<h1>${title}</h1>`
        }
      </div>
      <div class="header-actions">${actions}</div>
    </header>
  `;
}

function shouldShowWalletSetup() {
  return (
    !state.settings.walletSetupDone &&
    getWalletAvailable() <= 0 &&
    !state.data.loans.length &&
    !(state.data.walletMovements || []).length
  );
}

function renderWalletSetup() {
  dom.screens.walletSetup.innerHTML = `
    <section class="setup-layout">
      <div class="setup-brand">
        <img src="./assets/tsdb-logo.svg" alt="TSDB Empréstimos" />
      </div>

      <form class="setup-card" id="wallet-setup-form">
        <span class="eyebrow">Primeiro acesso</span>
        <h1>Defina seu saldo disponível</h1>
        <p>Esse é o capital livre que você tem para emprestar. Cada novo lançamento desconta desse saldo automaticamente.</p>

        <label class="field setup-balance-field">
          <span>Saldo disponível</span>
          <input name="walletAvailable" type="text" inputmode="decimal" data-money placeholder="0,00" autocomplete="off" required />
        </label>

        <button class="button button-primary" type="submit">
          <i class="fa-solid fa-vault"></i>
          Salvar saldo
        </button>
        <button class="button button-ghost" type="button" data-action="skip-wallet-setup">
          Definir depois
        </button>
      </form>

      <div class="setup-benefits" aria-label="Recursos da carteira">
        <span><i class="fa-solid fa-minus"></i> Desconta empréstimos</span>
        <span><i class="fa-solid fa-plus"></i> Soma pagamentos</span>
        <span><i class="fa-solid fa-chart-line"></i> Atualiza relatórios</span>
      </div>
    </section>
  `;

  document.querySelector("#wallet-setup-form").addEventListener("submit", saveInitialWallet);
}

function renderDashboard() {
  const metrics = getMetrics();
  const attentionLoans = [...metrics.overdue, ...metrics.dueToday].slice(0, 3);
  const upcomingLoans = attentionLoans.length ? attentionLoans : metrics.dueSoon.slice(0, 3);

  dom.screens.dashboard.innerHTML = `
    ${renderHeader(
      "TSDB Empréstimos",
      "Sistema inteligente para controlar juros, vencimentos e recebimentos.",
      null,
      `<button class="icon-button" type="button" data-action="calendar" aria-label="Alertas"><i class="fa-regular fa-bell"></i></button>`
    )}

    <section class="section-block wallet-panel dashboard-hero">
      <div class="hero-main">
        <span class="eyebrow">Carteira</span>
        <h2>Saldo disponível</h2>
        <strong>${formatCurrency(metrics.walletAvailable)}</strong>
        <small>${metrics.activeClients} cliente(s) ativo(s) · ${metrics.overdue.length} atraso(s)</small>
      </div>
      <div class="hero-meter" aria-label="Carteira em aberto">
        <span>${formatShortCurrency(metrics.totalReceivable)}</span>
        <small>A receber</small>
      </div>
    </section>

    <section class="section-block dashboard-summary">
      <div class="metric-grid metric-grid-compact">
        ${metricCard("A receber", metrics.totalReceivable, "Saldo aberto", "green", "fa-sack-dollar", "loans")}
        ${metricCard("Emprestado aberto", metrics.openPrincipal, "Principal pendente", "blue", "fa-scale-balanced", "loans")}
        ${metricCard("Atrasado", metrics.totalOverdue, `${metrics.overdue.length} operação(ões)`, "red", "fa-triangle-exclamation", "filter-overdue")}
        ${metricCard("Lucro a receber", metrics.profitOpen, "Juros pendentes", "green", "fa-chart-line", "reports")}
      </div>
    </section>

    <section class="section-block dashboard-visuals">
      ${renderPortfolioDonut(metrics, "Visão geral")}
      ${renderTrendChart(getMonthlySeries(), "Evolução mensal")}
    </section>

    <section class="section-block quick-actions">
      ${quickAction("Novo", "fa-plus", "new-loan")}
      ${quickAction("Clientes", "fa-users", "clients")}
      ${quickAction("Carteira", "fa-vault", "wallet")}
      ${quickAction("Agenda", "fa-calendar-days", "calendar")}
    </section>

    <section class="section-block panel-card compact-panel">
      <div class="section-head">
        <h3>${attentionLoans.length ? "Atenção agora" : "Próximos vencimentos"}</h3>
        <button class="link-button" type="button" data-action="calendar">Agenda</button>
      </div>
      <div class="loan-list compact-list">
        ${upcomingLoans.length ? upcomingLoans.map(renderLoanCard).join("") : emptyState("Nenhuma cobrança urgente agora.")}
      </div>
    </section>

    <section class="section-block panel-card compact-panel">
      <div class="section-head">
        <h3>Pagamentos recentes</h3>
        <button class="link-button" type="button" data-action="wallet">Carteira</button>
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
      ${caption ? `<small>${escapeHtml(caption)}</small>` : ""}
    </button>
  `;
}

function quickAction(title, icon, action) {
  return `
    <button class="quick-action" type="button" data-action="${action}">
      <i class="fa-solid ${icon}"></i>
      <span>${title}</span>
    </button>
  `;
}

function actionCard(title, text, icon, action) {
  return `
    <button class="action-card" type="button" data-action="${action}">
      <i class="fa-solid ${icon}"></i>
      <span>
        <strong>${title}</strong>
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

function percentOf(value, total) {
  if (!total) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / total) * 100)));
}

function renderPortfolioDonut(metrics, title = "Status da carteira") {
  const total = metrics.totalOnTime + metrics.totalOverdue + metrics.totalPaid;
  const onTimePercent = percentOf(metrics.totalOnTime, total);
  const overduePercent = percentOf(metrics.totalOverdue, total);
  const gradient = total
    ? `conic-gradient(var(--gold-main) 0 ${onTimePercent}%, var(--red) ${onTimePercent}% ${onTimePercent + overduePercent}%, var(--bronze) ${onTimePercent + overduePercent}% 100%)`
    : "conic-gradient(rgba(244, 199, 93, 0.28) 0 100%)";

  return `
    <article class="chart-card chart">
      <div class="section-head">
        <h3>${title}</h3>
        <span class="chart-caption">${metrics.lateRate}% atraso</span>
      </div>
      <div class="donut-layout">
        <div class="donut-chart" style="--donut-gradient: ${gradient}">
          <span>A receber</span>
          <strong>${formatShortCurrency(metrics.totalReceivable)}</strong>
          <small>${total ? onTimePercent : 0}% em dia</small>
        </div>
        <div class="status-list">
          ${legendRow("Em dia", metrics.totalOnTime, "green")}
          ${legendRow("Atrasados", metrics.totalOverdue, "red")}
          ${legendRow("Pagos", metrics.totalPaid, "blue")}
        </div>
      </div>
    </article>
  `;
}

function renderTrendChart(series, title = "Evolução mensal") {
  const width = 320;
  const height = 154;
  const paddingX = 22;
  const top = 18;
  const bottom = 28;
  const maxValue = Math.max(...series.flatMap((item) => [item.lent, item.received]), 1);
  const step = series.length > 1 ? (width - paddingX * 2) / (series.length - 1) : 0;
  const y = (value) => height - bottom - (Number(value || 0) / maxValue) * (height - bottom - top);
  const x = (index) => paddingX + step * index;
  const linePoints = series.map((item, index) => `${x(index).toFixed(1)},${y(item.received).toFixed(1)}`).join(" ");
  const areaPoints = `${paddingX},${height - bottom} ${linePoints} ${width - paddingX},${height - bottom}`;
  const bars = series
    .map((item, index) => {
      const barWidth = 20;
      const barHeight = height - bottom - y(item.lent);
      return `<rect x="${(x(index) - barWidth / 2).toFixed(1)}" y="${y(item.lent).toFixed(1)}" width="${barWidth}" height="${Math.max(barHeight, item.lent ? 3 : 0).toFixed(1)}" rx="6"></rect>`;
    })
    .join("");
  const labels = series
    .map((item, index) => `<text x="${x(index).toFixed(1)}" y="${height - 7}" text-anchor="middle">${escapeHtml(item.label)}</text>`)
    .join("");
  const last = series[series.length - 1] || { received: 0, lent: 0 };

  return `
    <article class="chart-card chart trend-card">
      <div class="section-head">
        <h3>${title}</h3>
        <span class="chart-caption">Recebido ${formatShortCurrency(last.received)}</span>
      </div>
      <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução mensal de valores emprestados e recebidos">
        <line class="grid-line" x1="${paddingX}" y1="${height - bottom}" x2="${width - paddingX}" y2="${height - bottom}"></line>
        <g class="bars">${bars}</g>
        <polygon class="trend-area" points="${areaPoints}"></polygon>
        <polyline class="trend-line" points="${linePoints}"></polyline>
        <g class="month-labels">${labels}</g>
      </svg>
      <div class="chart-legend">
        <span><i class="dot green"></i> Recebido</span>
        <span><i class="bar-key"></i> Emprestado</span>
      </div>
    </article>
  `;
}

function renderWallet() {
  const metrics = getMetrics();
  const movements = getWalletMovements();
  const recentMovements = movements.slice(0, 12);

  dom.screens.wallet.innerHTML = `
    ${renderHeader("Carteira", "Saldo disponível, movimentações e capacidade para novos empréstimos.", "dashboard")}

    <section class="section-block wallet-panel wallet-panel-large">
      <div>
        <span class="eyebrow">Saldo disponível</span>
        <strong>${formatCurrency(metrics.walletAvailable)}</strong>
      </div>
      <button class="button button-primary" type="button" data-action="settings">
        <i class="fa-solid fa-pen-to-square"></i>
        Ajustar saldo
      </button>
    </section>

    <section class="section-block">
      <div class="metric-grid">
        ${metricCard("Capital em aberto", metrics.openPrincipal, "Principal pendente", "blue", "fa-money-bill-trend-up", "reports")}
        ${metricCard("A receber", metrics.totalReceivable, "Saldo aberto", "green", "fa-sack-dollar", "loans")}
        ${metricCard("Recebido", metrics.totalPaid, "Entradas registradas", "green", "fa-circle-dollar-to-slot", "reports")}
        ${metricCard("Atrasado", metrics.totalOverdue, `${metrics.overdueClients} cliente(s)`, "red", "fa-triangle-exclamation", "clients")}
      </div>
    </section>

    <section class="section-block panel-card">
      <div class="section-head">
        <div>
          <h3>Movimentações da carteira</h3>
        </div>
      </div>
      <div class="movement-list">
        ${recentMovements.length ? recentMovements.map(renderWalletMovement).join("") : emptyState("Nenhuma movimentação registrada ainda. Ajuste o saldo ou cadastre um empréstimo.")}
      </div>
    </section>
  `;
}

function renderWalletMovement(movement) {
  const amount = Number(movement.amount || 0);
  const tone = amount >= 0 ? "green" : "red";
  const icon = amount >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down";

  return `
    <article class="movement-item">
      <span class="metric-icon ${tone}"><i class="fa-solid ${icon}"></i></span>
      <div>
        <strong>${escapeHtml(movement.label)}</strong>
        <small>${formatDate(String(movement.createdAt).slice(0, 10))}</small>
      </div>
      <strong class="status-${tone}">${amount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}</strong>
    </article>
  `;
}

function clientStatusMeta(client) {
  if (client.overdueCount) {
    return {
      label: "Atrasado",
      detail: `${client.overdueCount} operação(ões) em atraso`,
      tone: "red"
    };
  }

  if (client.activeCount) {
    return {
      label: "Em aberto",
      detail: `${client.activeCount} operação(ões) ativa(s)`,
      tone: "green"
    };
  }

  return {
    label: "Pago",
    detail: "Sem saldo em aberto",
    tone: "blue"
  };
}

function renderClients() {
  const clients = getClientGroups();
  const selected = getSelectedClient();
  const metrics = getMetrics();

  dom.screens.clients.innerHTML = `
    ${renderHeader(
      "Clientes",
      "",
      "dashboard",
      `<button class="icon-button" type="button" data-action="reset-client-search" aria-label="Limpar busca"><i class="fa-solid fa-filter-circle-xmark"></i></button>`
    )}

    <section class="section-block client-summary">
      <div class="summary-pill">
        <span>Clientes</span>
        <strong>${metrics.clients}</strong>
      </div>
      <div class="summary-pill">
        <span>Ativos</span>
        <strong>${metrics.activeClients}</strong>
      </div>
      <div class="summary-pill">
        <span>Em atraso</span>
        <strong class="status-red">${metrics.overdueClients}</strong>
      </div>
    </section>

    <label class="search-box">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input id="client-search" type="search" placeholder="Buscar cliente ou telefone..." value="${escapeHtml(state.clientSearch)}" />
    </label>

    <section class="client-list">
      ${clients.length ? clients.map(renderClientCard).join("") : emptyState("Nenhum cliente encontrado.")}
    </section>

    ${selected ? renderClientDetail(selected) : `
      <section class="section-block panel-card quiet-panel">
        <div class="section-head">
          <div>
            <h3>Selecione um cliente</h3>
          </div>
        </div>
      </section>
    `}
  `;

  const search = document.querySelector("#client-search");
  if (search) {
    search.addEventListener("input", (event) => {
      state.clientSearch = event.target.value;
      state.selectedClientKey = null;
      renderClients();
    });
  }
}

function renderClientCard(client) {
  const meta = clientStatusMeta(client);
  const selected = state.selectedClientKey === client.key ? " is-selected" : "";

  return `
    <button class="client-card${selected}" type="button" data-action="select-client" data-client-key="${escapeHtml(client.key)}">
      <span class="avatar">${initials(client.name)}</span>
      <span class="client-main">
        <strong>${escapeHtml(client.name)}</strong>
        <span>${client.phone ? escapeHtml(client.phone) : `${client.loans.length} empréstimo(s)`}</span>
      </span>
      <span class="client-side">
        <strong>${formatCurrency(client.balance)}</strong>
        <small class="status-${meta.tone}">${meta.label}</small>
      </span>
    </button>
  `;
}

function renderClientDetail(client) {
  const meta = clientStatusMeta(client);
  const activeLoans = client.loans.filter((loan) => loan.status !== "paid");

  return `
    <section class="section-block panel-card client-detail">
      <header class="detail-header">
        <span class="avatar">${initials(client.name)}</span>
        <div>
          <h3>${escapeHtml(client.name)}</h3>
          <p class="status-${meta.tone}">${meta.detail}</p>
        </div>
        <button class="icon-button" type="button" data-action="new-loan" aria-label="Novo empréstimo">
          <i class="fa-solid fa-plus"></i>
        </button>
      </header>

      <div class="detail-grid">
        ${detailLine("Telefone", client.phone ? escapeHtml(client.phone) : "Não informado")}
        ${detailLine("Emprestado em aberto", formatCurrency(client.openPrincipal))}
        ${detailLine("Saldo em aberto", formatCurrency(client.balance), client.balance ? "status-green" : "")}
        ${detailLine("Lucro a receber", formatCurrency(client.profitOpen), "status-green")}
        ${detailLine("Total recebido", formatCurrency(client.totalPaid))}
        ${detailLine("Lucro recebido", formatCurrency(client.profitReceived), "status-green")}
        ${detailLine("Próximo vencimento", client.nextDueDate ? formatDate(client.nextDueDate) : "Sem vencimento aberto")}
      </div>

      <div class="finance-strip">
        ${miniStat("Operações", String(client.loans.length), "blue")}
        ${miniStat("Ativas", String(client.activeCount), "green")}
        ${miniStat("Atrasadas", String(client.overdueCount), client.overdueCount ? "red" : "green")}
      </div>

      <section class="timeline-card">
        <div class="section-head">
          <h4>Empréstimos do cliente</h4>
          <button class="link-button" type="button" data-action="clear-client-selection">Fechar</button>
        </div>
        <div class="client-loan-list">
          ${client.loans.length ? client.loans.map(renderClientLoanItem).join("") : emptyState("Nenhum empréstimo para este cliente.")}
        </div>
      </section>

      ${
        activeLoans.length
          ? `<div class="button-row">
              <button class="button button-secondary" type="button" data-action="whatsapp" data-loan-id="${activeLoans[0].id}">
                <i class="fa-brands fa-whatsapp"></i>
                Cobrar principal
              </button>
            </div>`
          : ""
      }
    </section>
  `;
}

function renderClientLoanItem(loan) {
  const meta = statusMeta(loan);

  return `
    <button class="client-loan-item" type="button" data-action="select-loan" data-loan-id="${loan.id}">
      <span>
        <strong>${formatCurrency(loan.balance || loan.totalUpdated)}</strong>
        <small>${formatDate(loan.dueDate)} - <span class="status-${meta.tone}">${meta.label}</span></small>
      </span>
      <i class="fa-solid fa-chevron-right"></i>
    </button>
  `;
}

function renderLoans() {
  const loans = getFilteredLoans();
  const selected = state.selectedLoanId ? getLoan(state.selectedLoanId) : null;

  dom.screens.loans.innerHTML = `
    ${renderHeader(
      "Meus empréstimos",
      "",
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
      ${loans.length ? loans.map(renderLoanCard).join("") : emptyState("Nenhum empréstimo encontrado.")}
    </section>

    ${selected ? renderLoanDetail(selected) : `
      <section class="section-block panel-card quiet-panel">
        <div class="section-head">
          <div>
            <h3>Selecione um empréstimo</h3>
          </div>
        </div>
      </section>
    `}
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

  return `
    <section class="section-block panel-card loan-detail">
      <header class="detail-header">
        <span class="avatar">${initials(loan.name)}</span>
        <div>
          <h3>${escapeHtml(loan.name)}</h3>
          <p class="status-${meta.tone}">${meta.label}</p>
        </div>
        <button class="icon-button" type="button" data-action="open-loan-menu" data-loan-id="${loan.id}" aria-label="Ações">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </header>

      <div class="detail-grid">
        ${detailLine("Valor original", formatCurrency(loan.originalPrincipal))}
        ${detailLine("Valor emprestado", formatCurrency(loan.principal))}
        ${detailLine("Principal em aberto", formatCurrency(loan.principalOpen))}
        ${detailLine("Juros contratado", formatPercent(loan.interestRate))}
        ${detailLine("Valor dos juros", formatCurrency(loan.interestAmount))}
        ${detailLine("Total original", formatCurrency(loan.totalOriginal))}
        ${detailLine("Multa acumulada", formatCurrency(loan.lateInterest))}
        ${detailLine("Total atualizado", formatCurrency(loan.totalUpdated), "status-green")}
        ${detailLine("Saldo em aberto", formatCurrency(loan.balance))}
        ${detailLine("Total recebido", formatCurrency(loan.totalPaidReceived))}
        ${detailLine("Data do empréstimo", formatDate(loan.issueDate))}
        ${detailLine("Vencimento", formatDate(loan.dueDate))}
        ${detailLine("Juros por atraso", formatPercent(loan.dailyLateRate) + " ao dia")}
      </div>

      <div class="finance-strip">
        ${miniStat("Lucro a receber", formatCurrency(loan.profitOpen), "green")}
        ${miniStat("Lucro recebido", formatCurrency(loan.totalProfitReceived), "blue")}
        ${miniStat("Dias atraso", String(loan.lateDays), loan.lateDays ? "red" : "green")}
      </div>

      <section class="timeline-card">
        <div class="section-head">
          <h4>Histórico e auditoria</h4>
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
        <button class="button button-secondary" type="button" data-action="open-renewal" data-loan-id="${loan.id}">
          <i class="fa-solid fa-rotate-right"></i>
          Renovar
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
      title: "Empréstimo criado",
      text: formatCurrency(loan.originalPrincipal),
      tone: "green"
    },
    ...((loan.payments || []).map((payment) => ({
      date: payment.paidAt,
      title: "Pagamento recebido",
      text: formatCurrency(payment.amount) + " via " + payment.method,
      tone: "blue"
    }))),
    ...((loan.renewals || []).map((renewal) => ({
      date: renewal.renewedAt,
      title: "Renovação registrada",
      text:
        "Recebido " +
        formatCurrency(renewal.paidAmount) +
        " · novo principal " +
        formatCurrency(renewal.nextPrincipal) +
        " · vence " +
        formatDate(renewal.nextDueDate),
      tone: "yellow"
    }))),
    ...getAudit(loan.id).filter((entry) => entry.type !== "create").map((entry) => ({
      date: entry.createdAt,
      title: auditTitle(entry.type),
      text: entry.message,
      tone: entry.type === "delete" ? "red" : "yellow"
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  if (!events.length) {
    return emptyState("Nenhum histórico registrado.");
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
    edit: "Edição",
    payment: "Pagamento",
    renewal: "Renovação",
    delete: "Exclusão",
    import: "Importação",
    security: "Segurança"
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
      isEditing ? "Editar empréstimo" : "Novo empréstimo",
      "",
      "loans",
      `<button class="icon-button" type="button" data-action="apply-defaults" aria-label="Usar padrões"><i class="fa-solid fa-wand-magic-sparkles"></i></button>`
    )}

    <form class="form-panel loan-form-panel" id="loan-form">
      <section class="loan-preview-mini">
        <div class="preview-hero">
          <span class="eyebrow">Prévia</span>
          <strong data-preview="total">${formatCurrency(preview.totalOriginal)}</strong>
          <small>Total a receber</small>
        </div>
        <div class="preview-mini-grid">
          ${previewItem("Juros", formatCurrency(preview.interestAmount), "interest")}
          ${previewItem("Saldo", formatCurrency(preview.walletAfter), "wallet")}
          ${previewItem("Atraso 3d", formatCurrency(preview.lateProjection), "late")}
        </div>
      </section>

      <section class="form-section form-section-direct">
        <div class="form-section-title compact-form-title">
          <i class="fa-solid fa-file-invoice-dollar"></i>
          <h3>Dados do empréstimo</h3>
        </div>
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
        <label class="field">
          <span>Juros por atraso (% ao dia)</span>
          <input name="dailyLateRate" type="text" inputmode="decimal" value="${escapeHtml(draft.dailyLateRate)}" required />
        </label>
        <div class="form-grid date-grid">
          <label class="field">
            <span>Data do empréstimo</span>
            <input name="issueDate" type="date" value="${draft.issueDate}" required />
          </label>
          <label class="field">
            <span>Vencimento</span>
            <input name="dueDate" type="date" value="${draft.dueDate}" required />
          </label>
        </div>
        <label class="field">
          <span>Observações</span>
          <textarea name="notes" rows="4" placeholder="Combinados, garantias, local de pagamento...">${escapeHtml(draft.notes)}</textarea>
        </label>
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
  const existing = state.editingLoanId ? state.data.loans.find((loan) => loan.id === state.editingLoanId) : null;
  const principalDelta = principal - (existing ? parseNumber(existing.principal) : 0);
  const walletAfter = getWalletAvailable() - Math.max(principalDelta, 0) + Math.max(-principalDelta, 0);
  const dueDiff = draft.dueDate ? daysUntil(draft.dueDate) : 0;
  let status = "Em dia";

  if (dueDiff < 0) {
    status = "Atrasado";
  } else if (dueDiff === 0) {
    status = "Vence hoje";
  } else if (dueDiff <= 5) {
    status = "Próximo";
  }

  return {
    interestAmount: interest,
    totalOriginal: total,
    lateProjection,
    walletAfter,
    status
  };
}

function updatePreviewPanel() {
  const preview = getPreview(getDraft());
  const values = {
    interest: formatCurrency(preview.interestAmount),
    total: formatCurrency(preview.totalOriginal),
    wallet: formatCurrency(preview.walletAfter),
    status: preview.status,
    late: formatCurrency(preview.lateProjection)
  };

  Object.entries(values).forEach(([key, value]) => {
    document.querySelectorAll(`[data-preview="${key}"]`).forEach((target) => {
      target.textContent = value;
    });
  });
}

function saveInitialWallet(event) {
  event.preventDefault();
  blurActiveControl();
  const amount = parseNumber(new FormData(event.currentTarget).get("walletAvailable"));

  if (amount <= 0) {
    alert("Informe um saldo maior que zero ou escolha Definir depois.");
    return;
  }

  completeWalletSetup(amount, "Saldo inicial configurado");
}

function skipWalletSetup() {
  state.settings.walletSetupDone = true;
  saveSettings();
  render();
  setScreen("dashboard");
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
  blurActiveControl();
  const data = new FormData(event.currentTarget);
  const existing = state.editingLoanId ? state.data.loans.find((loan) => loan.id === state.editingLoanId) : null;
  const payload = {
    id: state.editingLoanId || createId(),
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    principal: parseNumber(data.get("principal")),
    originalPrincipal: existing ? parseNumber(existing.originalPrincipal || existing.principal) : parseNumber(data.get("principal")),
    interestRate: parseNumber(data.get("interestRate")),
    dailyLateRate: parseNumber(data.get("dailyLateRate")),
    issueDate: data.get("issueDate"),
    dueDate: data.get("dueDate"),
    notes: String(data.get("notes") || "").trim(),
    payments: existing ? existing.payments || [] : [],
    renewals: existing ? existing.renewals || [] : [],
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!payload.name || payload.principal <= 0 || !payload.issueDate || !payload.dueDate) {
    alert("Preencha nome, valor e datas para salvar.");
    return;
  }

  if (parseDate(payload.dueDate) < parseDate(payload.issueDate)) {
    alert("O vencimento precisa ser posterior à data do empréstimo.");
    return;
  }

  const principalDelta = payload.principal - (existing ? parseNumber(existing.principal) : 0);
  if (principalDelta > getWalletAvailable()) {
    alert("Saldo disponível insuficiente para este empréstimo. Ajuste o saldo ou reduza o valor.");
    return;
  }

  if (existing) {
    state.data.loans = state.data.loans.map((loan) => (loan.id === existing.id ? payload : loan));
    addAudit("edit", "Empréstimo atualizado para " + payload.name + ".", payload.id);
  } else {
    state.data.loans.unshift(payload);
    addAudit("create", "Empréstimo criado para " + payload.name + " no valor de " + formatCurrency(payload.principal) + ".", payload.id);
  }

  if (principalDelta) {
    updateWalletAvailable(-principalDelta, {
      type: principalDelta > 0 ? "loan" : "loan-adjust",
      label:
        principalDelta > 0
          ? "Empréstimo liberado para " + payload.name
          : "Redução de empréstimo para " + payload.name,
      loanId: payload.id
    });
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
    ${renderHeader("Agenda", "", "dashboard")}

    <section class="section-block calendar-hero">
      <div class="calendar-day">
        <span>${new Date().toLocaleDateString("pt-BR", { weekday: "short" })}</span>
        <strong>${new Date().toLocaleDateString("pt-BR", { day: "2-digit" })}</strong>
        <small>${new Date().toLocaleDateString("pt-BR", { month: "long" })}</small>
      </div>
      <div>
        <span class="eyebrow">Agenda</span>
        <h2>${todayLoans.length ? `${todayLoans.length} vencendo hoje` : "Nenhum vencimento hoje"}</h2>
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
        <h3>Próximos 30 dias</h3>
      </div>
      <div class="timeline-list">
        ${nextLoans.length ? nextLoans.map(renderAgendaItem).join("") : emptyState("Sem próximos vencimentos cadastrados.")}
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
      <button class="icon-button" type="button" data-action="open-loan-menu" data-loan-id="${loan.id}" aria-label="Ações">
        <i class="fa-solid fa-ellipsis"></i>
      </button>
    </article>
  `;
}

function renderReports() {
  const metrics = getMetrics();
  const periodStats = getPeriodStats();
  const series = getMonthlySeries();

  dom.screens.reports.innerHTML = `
    ${renderHeader("Relatórios", "", "dashboard")}

    <div class="period-pills" role="tablist" aria-label="Período do relatório">
      ${periodButton("today", "Hoje")}
      ${periodButton("week", "7 dias")}
      ${periodButton("month", "Mês")}
      ${periodButton("year", "Ano")}
      ${periodButton("all", "Tudo")}
    </div>

    <section class="section-block reports-hero">
      <div>
        <span class="eyebrow">Resultado</span>
        <h2>${formatCurrency(metrics.profitReceived)}</h2>
        <p>Lucro recebido até hoje</p>
      </div>
      <div class="reports-period-card">
        <span>Recebido no período</span>
        <strong>${formatCurrency(periodStats.received)}</strong>
        <small>${periodStats.count} pagamento(s)</small>
      </div>
    </section>

    <section class="section-block report-charts">
      ${renderTrendChart(series, "Evolução financeira")}
      ${renderPortfolioDonut(metrics, "Resumo por status")}
    </section>

    <section class="section-block">
      <div class="metric-grid metric-grid-compact">
        ${metricCard("A receber", metrics.totalReceivable, "Saldo aberto", "green", "fa-sack-dollar", "loans")}
        ${metricCard("Emprestado aberto", metrics.openPrincipal, "Principal pendente", "blue", "fa-money-bill-trend-up", "loans")}
        ${metricCard("Emprestado geral", metrics.totalPrincipal, "Histórico lançado", "blue", "fa-landmark", "reports")}
        ${metricCard("Lucro a receber", metrics.profitOpen, "Juros pendentes", "green", "fa-chart-line", "reports")}
        ${metricCard("Lucro recebido", metrics.profitReceived, "Realizado", "green", "fa-circle-check", "reports")}
        ${metricCard("Recebido", metrics.totalPaid, "Pagamentos", "green", "fa-circle-dollar-to-slot", "reports")}
        ${metricCard("Atrasado", metrics.totalOverdue, `${metrics.lateRate}% da carteira`, "red", "fa-triangle-exclamation", "filter-overdue")}
      </div>
    </section>

    <section class="section-block panel-card">
      <div class="section-head">
        <div>
          <h3>Clientes em destaque</h3>
        </div>
        <button class="link-button" type="button" data-action="clients">Ver clientes</button>
      </div>
      <div class="client-loan-list">
        ${renderClientRiskRows(metrics.clientGroups)}
      </div>
    </section>
  `;
}

function renderClientRiskRows(clients) {
  const rows = clients
    .filter((client) => client.balance > 0 || client.overdueCount > 0)
    .slice(0, 6);

  if (!rows.length) {
    return emptyState("Nenhum cliente com saldo em aberto.");
  }

  return rows
    .map((client) => {
      const meta = clientStatusMeta(client);
      return `
        <button class="client-loan-item" type="button" data-action="select-client" data-client-key="${escapeHtml(client.key)}">
          <span>
            <strong>${escapeHtml(client.name)}</strong>
            <small class="status-${meta.tone}">${meta.detail}</small>
          </span>
          <strong>${formatCurrency(client.balance)}</strong>
        </button>
      `;
    })
    .join("");
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
    ${renderHeader("Configurações", "", "dashboard")}

    <form class="form-panel" id="settings-form">
      <section class="settings-group">
        <div>
          <h3>Carteira</h3>
        </div>
        <label class="field">
          <span>Saldo disponível</span>
          <input type="text" name="walletAvailable" inputmode="decimal" data-money value="${formatMoneyInputValue(state.settings.walletAvailable)}" placeholder="0,00" />
        </label>
      </section>

      <section class="settings-group">
        <div>
          <h3>Regras financeiras</h3>
        </div>
      <div class="form-grid">
        <label class="field">
          <span>Juros padrão (%)</span>
          <input type="number" name="defaultInterestRate" min="0" step="0.01" value="${state.settings.defaultInterestRate}" />
        </label>
        <label class="field">
          <span>Multa padrão (% ao dia)</span>
          <input type="number" name="defaultDailyLateRate" min="0" step="0.01" value="${state.settings.defaultDailyLateRate}" />
        </label>
      </div>
      </section>

      <section class="settings-group">
        <div>
          <h3>Segurança</h3>
        </div>
      <section class="settings-security">
        <label class="switch-row">
          <span>
            <strong>Proteção por PIN</strong>
            <small>${state.settings.pinEnabled ? "Ativa neste navegador" : "Desativada"}</small>
          </span>
          <input type="checkbox" name="pinEnabled" ${state.settings.pinEnabled ? "checked" : ""} />
        </label>
        <label class="field">
          <span>${state.settings.pinEnabled ? "Alterar PIN" : "Criar PIN"}</span>
          <input type="password" name="pin" inputmode="numeric" minlength="4" placeholder="Mínimo 4 dígitos" />
        </label>
      </section>
      </section>
      <button class="button button-primary" type="submit">
        <i class="fa-solid fa-floppy-disk"></i>
        Salvar configurações
      </button>
    </form>

    <section class="section-block">
      <div class="action-grid">
        ${actionCard("Exportar backup", "", "fa-download", "export")}
        ${actionCard("Exportar CSV", "", "fa-file-csv", "export-csv")}
        ${actionCard("Importar backup", "", "fa-upload", "import")}
        ${actionCard("Limpar dados", "", "fa-trash", "clear-data")}
        ${actionCard("Bloquear agora", "", "fa-lock", "lock-app")}
      </div>
      <input class="hidden" type="file" id="import-file" accept="application/json" />
    </section>

    <section class="section-block panel-card">
      <div class="section-head">
        <div>
          <h3>Segurança dos dados</h3>
        </div>
      </div>
      <div class="status-list">
        ${legendRow("Saldo disponível", state.settings.walletAvailable, "green")}
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
        <img src="./assets/tsdb-mark.svg" alt="" />
      </div>
      <div>
        <strong>TSDB Empréstimos</strong>
      </div>
      <button class="icon-button" type="button" data-action="close-drawer" aria-label="Fechar menu">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </header>

    <section class="drawer-balance">
      <span>Saldo disponível</span>
      <strong>${formatCurrency(metrics.walletAvailable)}</strong>
    </section>

    <nav class="drawer-groups" aria-label="Opções do aplicativo">
      ${drawerGroup("Carteira", "fa-vault", true, [
        drawerButton("dashboard", "Início", "", "fa-house"),
        drawerButton("wallet", "Carteira", "", "fa-vault"),
        drawerButton("settings", "Saldo disponível", "", "fa-coins"),
        drawerButton("reports", "Relatórios", "", "fa-chart-column")
      ])}
      ${drawerGroup("Operações", "fa-briefcase", false, [
        drawerButton("new-loan", "Novo empréstimo", "", "fa-plus"),
        drawerButton("clients", "Clientes", "", "fa-users"),
        drawerButton("loans", "Empréstimos", "", "fa-wallet"),
        drawerButton("calendar", "Agenda", "", "fa-calendar-days")
      ])}
      ${drawerGroup("Dados e segurança", "fa-shield-halved", false, [
        drawerButton("export", "Backup JSON", "", "fa-download"),
        drawerButton("export-csv", "Exportar CSV", "", "fa-file-csv"),
        drawerButton("import", "Importar JSON", "", "fa-upload"),
        drawerButton("lock-app", "Bloquear", "", "fa-lock")
      ])}
    </nav>
  `;
}

function drawerGroup(title, icon, open, items) {
  return `
    <details class="drawer-group" ${open ? "open" : ""}>
      <summary>
        <span><i class="fa-solid ${icon}"></i>${title}</span>
        <i class="fa-solid fa-chevron-down"></i>
      </summary>
      <div class="drawer-group-body">
        ${items.join("")}
      </div>
    </details>
  `;
}

function drawerButton(action, title, text, icon) {
  return `
    <button class="drawer-item" type="button" data-action="${action}">
      <i class="fa-solid ${icon}"></i>
      <span>
        <strong>${title}</strong>
      </span>
    </button>
  `;
}

function renderRecentPayments() {
  const payments = getReceivedEvents().slice(0, 4);

  if (!payments.length) {
    return emptyState("Nenhum pagamento registrado ainda.");
  }

  return payments
    .map(
      (payment) => `
        <div class="panel-card">
          <div class="detail-line">
            <span>${escapeHtml(payment.loanName)} - ${formatDate(payment.paidAt)}</span>
            <strong class="status-green">${formatCurrency(payment.amount)}${payment.source === "renewal" ? " · renovado" : ""}</strong>
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

function getRenewalProjection(loan, paidAmount = 0, newDueDate = "") {
  const received = Math.min(Math.max(parseNumber(paidAmount), 0), loan.balance);
  const nextPrincipal = roundMoney(Math.max(loan.balance - received, 0));
  const interestAmount = roundMoney(nextPrincipal * (parseNumber(loan.interestRate) / 100));
  const totalOriginal = roundMoney(nextPrincipal + interestAmount);
  const profitReceived = roundMoney(Math.min(received, loan.profitOpen));
  const principalReduction = roundMoney(Math.max(received - loan.profitOpen, 0));

  return {
    received,
    nextPrincipal,
    interestAmount,
    totalOriginal,
    profitReceived,
    principalReduction,
    newDueDate
  };
}

function renderRenewalPreview(loan, projection) {
  if (!dom.renewalPreview) {
    return;
  }

  dom.renewalPreview.innerHTML = `
    <div class="renewal-preview-hero">
      <span class="eyebrow">Novo ciclo</span>
      <strong>${formatCurrency(projection.totalOriginal)}</strong>
      <small>Total com juros para ${projection.newDueDate ? formatDate(projection.newDueDate) : "novo vencimento"}</small>
    </div>
    <div class="renewal-preview-grid">
      ${previewItem("Saldo atual", formatCurrency(loan.balance), "wallet")}
      ${previewItem("Pago agora", formatCurrency(projection.received), "payment")}
      ${previewItem("Novo principal", formatCurrency(projection.nextPrincipal), "principal")}
      ${previewItem("Juros novo ciclo", formatCurrency(projection.interestAmount), "interest")}
      ${previewItem("Lucro recebido", formatCurrency(projection.profitReceived), "profit")}
      ${previewItem("Abate principal", formatCurrency(projection.principalReduction), "principal")}
    </div>
  `;
}

function updateRenewalPreview() {
  if (!dom.renewalForm) {
    return;
  }

  const loan = getLoan(dom.renewalForm.loanId.value);
  if (!loan) {
    return;
  }

  renderRenewalPreview(
    loan,
    getRenewalProjection(loan, dom.renewalForm.paidAmount.value, dom.renewalForm.newDueDate.value)
  );
}

function openRenewalModal(loanId) {
  const loan = getLoan(loanId);

  if (!loan || !dom.renewalForm) {
    return;
  }

  if (loan.status === "paid" || loan.balance <= 0.01) {
    alert("Este empréstimo já está quitado.");
    return;
  }

  dom.renewalForm.loanId.value = loan.id;
  dom.renewalForm.renewedAt.value = todayIso();
  dom.renewalForm.paidAmount.value = formatMoneyInputValue(loan.profitOpen || 0);
  dom.renewalForm.newDueDate.value = nextMonthlyDueDate(loan.dueDate);
  dom.renewalForm.notes.value = "";
  updateRenewalPreview();
  closeModal("loan-menu-modal");
  openModal("renewal-modal");
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
    <button class="button button-secondary" type="button" data-action="open-renewal" data-loan-id="${loan.id}">
      <i class="fa-solid fa-rotate-right"></i>
      Renovar empréstimo
    </button>
    <button class="button button-secondary" type="button" data-action="whatsapp" data-loan-id="${loan.id}">
      <i class="fa-brands fa-whatsapp"></i>
      Cobrança padrão
    </button>
    <button class="button button-secondary" type="button" data-action="whatsapp-template" data-template="friendly" data-loan-id="${loan.id}">
      <i class="fa-regular fa-comment-dots"></i>
      Lembrete educado
    </button>
    <button class="button button-secondary" type="button" data-action="whatsapp-template" data-template="firm" data-loan-id="${loan.id}">
      <i class="fa-solid fa-bolt"></i>
      Cobrança firme
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
  blurActiveControl();
  const data = new FormData(event.currentTarget);
  const loanId = data.get("loanId");
  const selectedLoan = getLoan(loanId);
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

  if (!selectedLoan) {
    alert("Empréstimo não encontrado.");
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
  updateWalletAvailable(payment.amount, {
    type: "payment",
    label: "Pagamento recebido de " + selectedLoan.name,
    loanId
  });
  saveData();
  closeModal("payment-modal");
  closeModal("loan-menu-modal");
  render();
}

function submitRenewal(event) {
  event.preventDefault();
  blurActiveControl();
  const data = new FormData(event.currentTarget);
  const loanId = data.get("loanId");
  const selectedLoan = getLoan(loanId);
  const rawLoan = state.data.loans.find((loan) => loan.id === loanId);
  const paidAmount = roundMoney(data.get("paidAmount"));
  const renewedAt = data.get("renewedAt");
  const newDueDate = data.get("newDueDate");
  const notes = String(data.get("notes") || "").trim();

  if (!selectedLoan || !rawLoan) {
    alert("Empréstimo não encontrado.");
    return;
  }

  if (!renewedAt || !newDueDate) {
    alert("Informe a data da renovação e o novo vencimento.");
    return;
  }

  if (parseDate(newDueDate) <= parseDate(renewedAt)) {
    alert("O novo vencimento precisa ser posterior à data da renovação.");
    return;
  }

  if (paidAmount < 0 || paidAmount > selectedLoan.balance + 0.01) {
    alert("Informe um valor pago entre zero e o saldo em aberto.");
    return;
  }

  const projection = getRenewalProjection(selectedLoan, paidAmount, newDueDate);

  if (projection.nextPrincipal <= 0.01) {
    alert("O valor informado quita o empréstimo. Use Registrar pagamento para finalizar.");
    return;
  }

  const previousPayments = (rawLoan.payments || []).map(normalizePayment);
  const renewal = {
    id: createId(),
    renewedAt,
    paidAmount: projection.received,
    profitReceived: projection.profitReceived,
    previousPaidAmount: selectedLoan.paidAmount,
    previousProfitReceived: selectedLoan.profitReceived,
    previousPrincipal: selectedLoan.principal,
    previousTotalUpdated: selectedLoan.totalUpdated,
    previousBalance: selectedLoan.balance,
    nextPrincipal: projection.nextPrincipal,
    nextDueDate: newDueDate,
    notes,
    previousPayments
  };

  state.data.loans = state.data.loans.map((loan) => {
    if (loan.id !== loanId) {
      return loan;
    }

    return {
      ...loan,
      principal: projection.nextPrincipal,
      originalPrincipal: parseNumber(loan.originalPrincipal || loan.principal),
      issueDate: renewedAt,
      dueDate: newDueDate,
      payments: [],
      renewals: [...(loan.renewals || []), renewal],
      updatedAt: new Date().toISOString()
    };
  });

  addAudit(
    "renewal",
    "Renovação registrada: recebido " +
      formatCurrency(projection.received) +
      ", novo principal " +
      formatCurrency(projection.nextPrincipal) +
      " e vencimento em " +
      formatDate(newDueDate) +
      ".",
    loanId
  );

  if (projection.received > 0) {
    updateWalletAvailable(projection.received, {
      type: "renewal",
      label: "Renovação recebida de " + selectedLoan.name,
      loanId
    });
  }

  state.selectedLoanId = loanId;
  saveData();
  closeModal("renewal-modal");
  closeModal("loan-menu-modal");
  render();
  setScreen("loans");
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

  if (!confirm("Excluir o empréstimo de " + loan.name + "?")) {
    return;
  }

  addAudit("delete", "Empréstimo excluído: " + loan.name + ".", loanId);
  updateWalletAvailable(loan.principal - loan.paidAmount, {
    type: "delete",
    label: "Exclusão ajustou saldo de " + loan.name,
    loanId
  });
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
      ", tudo bem? Passando só para lembrar com antecedência do nosso combinado. Vencimento: " +
      dueDate +
      ". Valor atualizado: " +
      value +
      ".",
    firm:
      "Ol\u00e1 " +
      loan.name +
      ". Preciso alinhar a regularização do empréstimo com vencimento em " +
      dueDate +
      ". Valor atualizado até hoje: " +
      value +
      ". Fico no aguardo do retorno.",
    late:
      "Ol\u00e1 " +
      loan.name +
      ". O empréstimo está em atraso há " +
      loan.lateDays +
      " dia(s). O valor atualizado até hoje é " +
      value +
      ". Por favor, me envie uma previsão de pagamento."
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

  const latestPayment = getReceivedEvents([loan])[0];

  if (type === "receipt" && !latestPayment) {
    alert("Registre um pagamento antes de gerar recibo.");
    return;
  }

  const title = type === "receipt" ? "Recibo de pagamento" : "Termo de empréstimo";
  const body =
    type === "receipt"
      ? `
        <p>Recebi de <strong>${escapeHtml(loan.name)}</strong> o valor de <strong>${formatCurrency(latestPayment.amount)}</strong> referente ao empréstimo com vencimento em <strong>${formatDate(loan.dueDate)}</strong>.</p>
        <p>Data do pagamento: <strong>${formatDate(latestPayment.paidAt)}</strong></p>
        <p>Método: <strong>${escapeHtml(latestPayment.method || "Não informado")}</strong></p>
        <p>Saldo atualizado após registros: <strong>${formatCurrency(loan.balance)}</strong></p>
      `
      : `
        <p>Cliente: <strong>${escapeHtml(loan.name)}</strong></p>
        <p>Telefone: <strong>${escapeHtml(loan.phone || "Não informado")}</strong></p>
        <p>Valor emprestado: <strong>${formatCurrency(loan.principal)}</strong></p>
        <p>Juros contratado: <strong>${formatPercent(loan.interestRate)}</strong></p>
        <p>Total original: <strong>${formatCurrency(loan.totalOriginal)}</strong></p>
        <p>Data do empréstimo: <strong>${formatDate(loan.issueDate)}</strong></p>
        <p>Data de vencimento: <strong>${formatDate(loan.dueDate)}</strong></p>
        <p>Juros por atraso: <strong>${formatPercent(loan.dailyLateRate)} ao dia</strong></p>
        <p>Observações: ${escapeHtml(loan.notes || "Sem observações.")}</p>
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
          body { font-family: "Trebuchet MS", Arial, sans-serif; margin: 36px; color: #211806; line-height: 1.55; }
          .doc { max-width: 760px; margin: 0 auto; border: 1px solid #d8b75c; border-radius: 18px; padding: 28px; }
          h1 { margin: 0 0 8px; }
          .muted { color: #806b3c; margin-bottom: 28px; }
          .sign { margin-top: 56px; display: grid; gap: 26px; }
          .line { border-top: 1px solid #211806; padding-top: 8px; text-align: center; }
        </style>
      </head>
      <body>
        <main class="doc">
          <h1>${title}</h1>
          <p class="muted">Documento gerado pelo TSDB Empréstimos em ${formatDate(todayIso())}.</p>
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
    alert("Ative e salve um PIN nas configurações antes de bloquear.");
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
  blurActiveControl();
  const data = new FormData(event.currentTarget);
  const previousWallet = getWalletAvailable();
  const nextWallet = parseNumber(data.get("walletAvailable"));
  const walletDiff = nextWallet - previousWallet;
  state.settings.walletAvailable = nextWallet;
  state.settings.walletSetupDone = true;
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
  if (walletDiff) {
    addWalletMovement(
      "adjust",
      walletDiff,
      walletDiff > 0 ? "Ajuste manual aumentou o saldo" : "Ajuste manual reduziu o saldo"
    );
  }
  saveSettings();
  saveData();
  render();
  alert("Configurações salvas.");
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
      state.selectedClientKey = null;
      state.draft = null;
      state.editingLoanId = null;
      saveData();
      saveSettings();
      render();
      alert("Backup importado.");
    })
    .catch(() => alert("Não foi possível importar este arquivo."));
}

function clearData() {
  if (!confirm("Limpar todos os dados do TSDB Empréstimos?")) {
    return;
  }

  addAudit("delete", "Todos os dados foram limpos.");
  state.data = { audit: [], walletMovements: [], loans: [] };
  state.selectedLoanId = null;
  state.selectedClientKey = null;
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

function bindEvents() {
  dom.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      if (item.dataset.nav === "clients") {
        state.selectedClientKey = null;
        renderClients();
      }
      if (item.dataset.nav === "loans") {
        state.selectedLoanId = null;
        renderLoans();
      }
      setScreen(item.dataset.nav);
    });
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

    if (["dashboard", "wallet", "clients", "loans", "calendar", "reports", "settings"].includes(action)) {
      if (action === "clients") {
        state.selectedClientKey = null;
        renderClients();
      }
      if (action === "loans") {
        state.selectedLoanId = null;
        renderLoans();
      }
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
      state.selectedLoanId = null;
      setScreen("loans");
      renderLoans();
    }

    if (action === "filter-on-time") {
      state.filter = "on-time";
      state.selectedLoanId = null;
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
    }

    if (action === "reset-filter") {
      state.filter = "all";
      state.search = "";
      state.selectedLoanId = null;
      renderLoans();
    }

    if (action === "select-loan") {
      state.selectedLoanId = loanId;
      renderLoans();
      setScreen("loans");
    }

    if (action === "select-client") {
      state.selectedClientKey = trigger.dataset.clientKey || null;
      renderClients();
      setScreen("clients");
    }

    if (action === "clear-client-selection") {
      state.selectedClientKey = null;
      renderClients();
    }

    if (action === "reset-client-search") {
      state.clientSearch = "";
      state.selectedClientKey = null;
      renderClients();
    }

    if (action === "open-payment") {
      openPaymentModal(loanId);
    }

    if (action === "open-renewal") {
      openRenewalModal(loanId);
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

    if (action === "skip-wallet-setup") {
      skipWalletSetup();
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
  dom.renewalForm.addEventListener("submit", submitRenewal);
  dom.renewalForm.addEventListener("input", updateRenewalPreview);
  dom.pinForm.addEventListener("submit", unlockApp);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal("payment-modal");
      closeModal("renewal-modal");
      closeModal("loan-menu-modal");
      closeDrawer();
    }
  });
}

function boot() {
  bindEvents();
  render();
  setScreen(shouldShowWalletSetup() ? "walletSetup" : "dashboard");
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
