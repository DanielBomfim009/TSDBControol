export const mockData = {
  clients: [
    {
      id: "cl-1",
      name: "Marcos Silva",
      phone: "(71) 99911-2301",
      document: "123.456.789-10",
      notes: "Prefere pagar por Pix no fim da tarde.",
      status: "ativo",
      createdAt: "2026-04-03"
    },
    {
      id: "cl-2",
      name: "Juliana Rocha",
      phone: "(71) 98842-1008",
      document: "",
      notes: "Cliente recorrente.",
      status: "ativo",
      createdAt: "2026-04-14"
    },
    {
      id: "cl-3",
      name: "Carlos Menezes",
      phone: "(71) 99601-8820",
      document: "",
      notes: "Em observacao por atraso recente.",
      status: "bloqueado",
      createdAt: "2026-03-28"
    }
  ],
  loans: [
    {
      id: "ln-1",
      clientId: "cl-1",
      principal: 1800,
      rate: 30,
      issuedAt: "2026-04-10",
      dueDate: "2026-05-08",
      lateFeeRate: 0.8,
      manualTarget: null,
      notes: "Pagamento unico.",
      status: "atrasado"
    },
    {
      id: "ln-2",
      clientId: "cl-2",
      principal: 900,
      rate: 40,
      issuedAt: "2026-05-02",
      dueDate: "2026-05-21",
      lateFeeRate: 1.1,
      manualTarget: 1280,
      notes: "Valor final ajustado manualmente.",
      status: "ativo"
    },
    {
      id: "ln-3",
      clientId: "cl-3",
      principal: 2500,
      rate: 35,
      issuedAt: "2026-04-15",
      dueDate: "2026-05-01",
      lateFeeRate: 1.2,
      manualTarget: null,
      notes: "Negociar reforco de garantia.",
      status: "atrasado"
    }
  ],
  payments: [
    {
      id: "pm-1",
      loanId: "ln-1",
      amount: 700,
      paidAt: "2026-05-09",
      method: "Pix",
      notes: "Entrada parcial."
    },
    {
      id: "pm-2",
      loanId: "ln-2",
      amount: 300,
      paidAt: "2026-05-12",
      method: "Dinheiro",
      notes: ""
    }
  ]
};
