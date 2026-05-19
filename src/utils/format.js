export const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

export function formatCurrency(value) {
  return currencyFormatter.format(value || 0);
}

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(`${value}T12:00:00`));
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1).replace(".", ",")}%`;
}
