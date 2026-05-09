"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";

const PROOF_COOLDOWN_MS = 10_000;

const ADMIN_RANKING_LABELS: Record<"d1" | "d7" | "d14" | "d31", string> = {
  d1: "Ultimas 24 horas",
  d7: "Ultimos 7 dias",
  d14: "Ultimos 14 dias",
  d31: "Ultimos 31 dias",
};

const ADMIN_DASHBOARD_DAYS: Record<"d1" | "d7" | "d14" | "d31", number> = {
  d1: 1,
  d7: 7,
  d14: 14,
  d31: 31,
};

type Proof = {
  id: string;
  sellerName: string;
  productName: string;
  uploader: string;
  saleValue: number;
  grossSaleValue?: number;
  penaltyPercentApplied?: number | null;
  originalName: string;
  mimeType: string;
  createdAt: string;
};

type DashboardClientProps = {
  initialProofs: Proof[];
  members: {
    username: string;
    role: string;
    totalSales: number;
  }[];
};

type AdminFine = {
  id: string;
  username: string;
  reason: string;
  durationType: string;
  durationValue: number | null;
  penaltyPercent: number | null;
  expiresAt: string | null;
  createdAt: string;
};

type HotsAccessItem = {
  username: string;
  profileKey: "loira" | "morena";
  scope: "profile" | "social";
  socialKey?: "twitter" | "facebook" | "tiktok" | "instagram" | "discord";
  updatedAt: string;
  updatedBy: string;
};

type HotsSocialCredential = {
  login: string;
  password: string;
  url?: string;
};

type HotsProfileCredentials = {
  profileKey: "loira" | "morena";
  login: string;
  password: string;
  imageUrl?: string;
  socialCredentialsByKey?: Partial<
    Record<"twitter" | "facebook" | "tiktok" | "instagram" | "discord", HotsSocialCredential>
  >;
  updatedAt: string;
  updatedBy: string;
};

type ManagedSiteUser = {
  username: string;
  blocked: boolean;
  blockedReason: string | null;
  deleted: boolean;
};

type GoalAdminItem = {
  username: string;
  total: number;
  target: number;
  progress: number;
  streakDays: number;
  bonusActive: boolean;
  commissionPercent: number;
  globalCommissionPercent: number;
  goalReachedCommissionPercent: number;
};

type AdminWithdrawal = {
  id: string;
  username: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
};

type AdminRankingRow = {
  username: string;
  vendas: number;
  valorTotal: number;
};

type AdminRankingWindows = {
  d1: AdminRankingRow[];
  d7: AdminRankingRow[];
  d14: AdminRankingRow[];
  d31: AdminRankingRow[];
};

type AdminRankingPrizes = {
  d1: number;
  d7: number;
  d14: number;
  d31: number;
};

const FIXED_MEMBER_USERS = [
  "camila",
  "miguel",
  "isa",
  "amanda",
  "duda",
  "andre",
  "perk",
  "neat",
];

const HOTS_SOCIAL_LABELS: Record<
  "twitter" | "facebook" | "tiktok" | "instagram" | "discord",
  string
> = {
  twitter: "Twitter",
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
  discord: "Discord",
};

function isAdminFineActive(fine: AdminFine): boolean {
  if (fine.durationType === "eterno") return true;
  if (!fine.expiresAt) return true;
  return new Date(fine.expiresAt) > new Date();
}

function activePenaltyPercentFromAdminFines(finesList: AdminFine[]): number {
  let sum = 0;
  for (const fine of finesList) {
    if (!isAdminFineActive(fine)) continue;
    sum += Number(fine.penaltyPercent ?? 0);
  }
  return Math.min(100, Math.max(0, sum));
}

function adminPodiumRowClass(index: number) {
  if (index === 0) {
    return "bg-gradient-to-r from-amber-100/95 via-amber-50/60 to-transparent border-l-4 border-amber-600 shadow-sm";
  }
  if (index === 1) {
    return "bg-gradient-to-r from-slate-200/90 via-slate-50/70 to-transparent border-l-4 border-slate-500 shadow-sm";
  }
  if (index === 2) {
    return "bg-gradient-to-r from-orange-100/95 via-orange-50/60 to-transparent border-l-4 border-amber-800 shadow-sm";
  }
  return "";
}

export default function DashboardClient({ initialProofs, members }: DashboardClientProps) {
  type DashboardSection =
    | "dashboard"
    | "comprovantes"
    | "tabela"
    | "membros"
    | "usuarios"
    | "saques"
    | "configuracoes"
    | "gerenciar-multas"
    | "hots"
    | "indicacoes";

  const router = useRouter();
  const [proofs, setProofs] = useState(initialProofs);
  const [membersState, setMembersState] = useState(members);
  const [activeSection, setActiveSection] = useState<DashboardSection>("dashboard");
  const [proofTargetUser, setProofTargetUser] = useState("camila");
  const [productName, setProductName] = useState("");
  const [saleValue, setSaleValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fineUser, setFineUser] = useState("camila");
  const [fineReason, setFineReason] = useState("");
  const [fineDurationType, setFineDurationType] = useState("dias");
  const [fineDurationValue, setFineDurationValue] = useState("1");
  const [finePenaltyPercent, setFinePenaltyPercent] = useState("0");
  const [fineMessage, setFineMessage] = useState("");
  const [fines, setFines] = useState<AdminFine[]>([]);
  const [fineAdminTab, setFineAdminTab] = useState<"aplicar" | "multas">("aplicar");
  const [fineEditById, setFineEditById] = useState<
    Record<string, { durationType: string; durationValue: string; penaltyPercent: string }>
  >({});
  const [hotsUser, setHotsUser] = useState("camila");
  const [hotsProfile, setHotsProfile] = useState<"loira" | "morena">("loira");
  const [hotsSocial, setHotsSocial] = useState<
    "twitter" | "facebook" | "tiktok" | "instagram" | "discord"
  >("instagram");
  const [hotsMessage, setHotsMessage] = useState("");
  const [hotsAccessList, setHotsAccessList] = useState<HotsAccessItem[]>([]);
  const [hotsTab, setHotsTab] = useState<"liberar" | "modificar">("liberar");
  const [hotsConfigProfile, setHotsConfigProfile] = useState<"loira" | "morena">("loira");
  const [hotsLoginInput, setHotsLoginInput] = useState("");
  const [hotsPasswordInput, setHotsPasswordInput] = useState("");
  const [hotsImageUrlInput, setHotsImageUrlInput] = useState("");
  const [hotsConfigSocial, setHotsConfigSocial] = useState<
    "twitter" | "facebook" | "tiktok" | "instagram" | "discord"
  >("instagram");
  const [hotsSocialLoginInput, setHotsSocialLoginInput] = useState("");
  const [hotsSocialPasswordInput, setHotsSocialPasswordInput] = useState("");
  const [hotsSocialUrlInput, setHotsSocialUrlInput] = useState("");
  const [hotsCredentialsByProfile, setHotsCredentialsByProfile] = useState<
    Partial<Record<"loira" | "morena", HotsProfileCredentials>>
  >({});
  const [memberRoster, setMemberRoster] = useState<string[] | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedSiteUser[]>([]);
  const [adminUsersMessage, setAdminUsersMessage] = useState("");
  const [newLoginUsername, setNewLoginUsername] = useState("");
  const [newLoginPassword, setNewLoginPassword] = useState("");
  const [newLoginRandom, setNewLoginRandom] = useState(false);
  const [adminDashboardTab, setAdminDashboardTab] = useState<keyof typeof ADMIN_DASHBOARD_DAYS>(
    "d31",
  );
  const [adminHoveredChartIndex, setAdminHoveredChartIndex] = useState<number | null>(null);
  const [proofUploaderFilter, setProofUploaderFilter] = useState<string>("");
  const [userActionBusy, setUserActionBusy] = useState<string | null>(null);
  const [memberManageUsername, setMemberManageUsername] = useState<string | null>(null);
  const [memberManageFines, setMemberManageFines] = useState<AdminFine[]>([]);
  const [proofDeleteBusyId, setProofDeleteBusyId] = useState<string | null>(null);
  const [memberManageError, setMemberManageError] = useState("");
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [withdrawalsMessage, setWithdrawalsMessage] = useState("");
  const [withdrawalsTab, setWithdrawalsTab] = useState<"pendentes" | "historico">("pendentes");
  const [withdrawActionBusyId, setWithdrawActionBusyId] = useState<string | null>(null);
  const [withdrawMinInput, setWithdrawMinInput] = useState("200");
  const [blockReasonTargetUser, setBlockReasonTargetUser] = useState<string | null>(null);
  const [blockReasonDraft, setBlockReasonDraft] = useState("");
  const [revealedPasswordByUser, setRevealedPasswordByUser] = useState<Record<string, string>>({});
  const [passwordRevealBusyUser, setPasswordRevealBusyUser] = useState<string | null>(null);
  const [passwordRevealError, setPasswordRevealError] = useState<string>("");
  const [referralsAdminData, setReferralsAdminData] = useState<{
    bonusPercent: number;
    defaultBonusPercent: number;
    links: {
      inviterUsername: string;
      inviteeUsername: string;
      codeUsed: string;
      linkedAt: string;
      totalSold: number;
      referralBonus: number;
    }[];
    groupedByInviter: {
      inviterUsername: string;
      totalSold: number;
      referralBonus: number;
      invitees: {
        inviterUsername: string;
        inviteeUsername: string;
        codeUsed: string;
        linkedAt: string;
        totalSold: number;
        referralBonus: number;
      }[];
    }[];
  } | null>(null);
  const [referralsBonusInput, setReferralsBonusInput] = useState<string>("4");
  const [referralsAdminMessage, setReferralsAdminMessage] = useState("");
  const [referralsAdminBusy, setReferralsAdminBusy] = useState(false);
  const [proofCooldownRemaining, setProofCooldownRemaining] = useState(0);
  const proofCooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (proofCooldownTimerRef.current) clearInterval(proofCooldownTimerRef.current);
    };
  }, []);

  function startProofCooldown(durationMs: number) {
    if (proofCooldownTimerRef.current) clearInterval(proofCooldownTimerRef.current);
    const endsAt = Date.now() + durationMs;
    setProofCooldownRemaining(durationMs);
    proofCooldownTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, endsAt - Date.now());
      setProofCooldownRemaining(remaining);
      if (remaining <= 0 && proofCooldownTimerRef.current) {
        clearInterval(proofCooldownTimerRef.current);
        proofCooldownTimerRef.current = null;
      }
    }, 100);
  }
  const [goalsUsers, setGoalsUsers] = useState<GoalAdminItem[]>([]);
  const [memberWalletAvailable, setMemberWalletAvailable] = useState<number>(0);
  const [memberControlMessage, setMemberControlMessage] = useState("");
  const [memberControlBusy, setMemberControlBusy] = useState(false);
  const [memberBalanceTargetInput, setMemberBalanceTargetInput] = useState("");
  const [memberBalanceEditing, setMemberBalanceEditing] = useState(false);
  const [memberBalanceBusy, setMemberBalanceBusy] = useState(false);
  const memberBalanceEditingRef = useRef(false);
  useEffect(() => {
    memberBalanceEditingRef.current = memberBalanceEditing;
  }, [memberBalanceEditing]);
  const [memberGoalTodayInput, setMemberGoalTodayInput] = useState("");
  const [memberStreakInput, setMemberStreakInput] = useState("");
  const [memberGoalCommissionInput, setMemberGoalCommissionInput] = useState("");
  const [memberGlobalCommissionInput, setMemberGlobalCommissionInput] = useState("");
  const [editingProofId, setEditingProofId] = useState<string | null>(null);
  const [editingProofProductName, setEditingProofProductName] = useState("");
  const [editingProofSaleValue, setEditingProofSaleValue] = useState("");
  const [editingProofFile, setEditingProofFile] = useState<File | null>(null);
  const [adminRanking, setAdminRanking] = useState<AdminRankingWindows | null>(null);
  const [adminRankingTab, setAdminRankingTab] = useState<keyof AdminRankingWindows>("d31");
  const [adminRankingPrizes, setAdminRankingPrizes] = useState<AdminRankingPrizes>({
    d1: 0,
    d7: 0,
    d14: 0,
    d31: 150,
  });
  const [adminRankingOverrides, setAdminRankingOverrides] = useState<Record<string, number>>({});
  const [rankingEditUsername, setRankingEditUsername] = useState<string>("");
  const [rankingEditValue, setRankingEditValue] = useState<string>("");
  const [rankingPrizeInput, setRankingPrizeInput] = useState<string>("150");
  const [rankingMessage, setRankingMessage] = useState("");

  const rosterForSelects = memberRoster ?? FIXED_MEMBER_USERS;

  const membrosCards = useMemo(() => {
    const proofMap = new Map<string, number>();
    for (const m of membersState) {
      if (m.role === "admin") continue;
      proofMap.set(m.username.toLowerCase(), m.totalSales);
    }
    const belRow = membersState.find((m) => m.username === "bel");
    const roster = rosterForSelects
      .map((u) => u.toLowerCase())
      .filter((u) => u && u !== "bel");
    const membroRows = roster.map((username) => ({
      username,
      role: "membro" as const,
      totalSales: proofMap.get(username) ?? 0,
    }));
    membroRows.sort((a, b) => a.username.localeCompare(b.username));
    return [
      { username: "bel", role: "admin" as const, totalSales: belRow?.totalSales ?? 0 },
      ...membroRows,
    ];
  }, [membersState, rosterForSelects]);

  useEffect(() => {
    if (activeSection === "gerenciar-multas") {
      loadFines();
      if (fineAdminTab === "multas") {
        void loadAllFines();
      }
    }
    if (activeSection === "hots") {
      loadHotsAccessList();
    }
    if (activeSection === "usuarios" || activeSection === "membros") {
      void loadAdminUsers();
    }
    if (activeSection === "saques") {
      void Promise.all([loadWithdrawals(), loadWithdrawSettings()]);
    }
    if (activeSection === "dashboard" || activeSection === "comprovantes" || activeSection === "membros") {
      void loadProofs();
      if (activeSection === "membros") {
        void loadGoalsUsers();
      }
    }
    if (activeSection === "tabela") {
      void loadAdminRanking();
    }
    if (activeSection === "indicacoes") {
      void loadReferralsAdmin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, fineUser, fineAdminTab]);

  useEffect(() => {
    if (!memberManageUsername) {
      setMemberManageFines([]);
      setMemberControlMessage("");
      setMemberBalanceEditing(false);
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/fines?username=${encodeURIComponent(memberManageUsername)}`,
      );
      if (!res.ok) {
        setMemberManageFines([]);
        return;
      }
      setMemberManageFines((await res.json()) as AdminFine[]);
      await loadMemberWallet(memberManageUsername);
    })();
    // Polling em tempo real do saldo do membro selecionado (3s).
    const interval = setInterval(() => {
      if (!memberBalanceBusy) {
        void loadMemberWallet(memberManageUsername);
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberManageUsername]);

  useEffect(() => {
    if (activeSection !== "membros") {
      setMemberManageUsername(null);
      setMemberManageError("");
      return;
    }
    // Polling para manter os dados de membros (goals, ranking, comissoes)
    // sempre frescos enquanto admin esta na aba.
    const interval = setInterval(() => {
      void loadGoalsUsers();
      void loadProofs();
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // Rebobina os inputs APENAS quando troca de membro selecionado.
  // O polling em background atualiza `goalsUsers` (display "Atual:")
  // mas nao reseta o que admin esta digitando nos inputs.
  const lastSelectedMemberRef = useRef<string | null>(null);
  useEffect(() => {
    if (!memberManageUsername) {
      lastSelectedMemberRef.current = null;
      return;
    }
    const goal = goalsUsers.find((item) => item.username === memberManageUsername);
    if (!goal) return;
    if (lastSelectedMemberRef.current === memberManageUsername) return;
    lastSelectedMemberRef.current = memberManageUsername;
    setMemberGoalTodayInput(String(Number(goal.total ?? 0).toFixed(2)));
    setMemberStreakInput(String(Math.max(0, Number(goal.streakDays ?? 0))));
    setMemberGoalCommissionInput(
      String(Number(goal.goalReachedCommissionPercent ?? 40).toFixed(2)),
    );
    setMemberGlobalCommissionInput(
      String(Number(goal.globalCommissionPercent ?? 35).toFixed(2)),
    );
  }, [memberManageUsername, goalsUsers]);

  async function loadAdminUsers() {
    const response = await fetch("/api/admin/users");
    if (!response.ok) {
      setAdminUsersMessage("Nao foi possivel carregar usuarios (MongoDB ativo?).");
      return;
    }
    const data = await response.json();
    setManagedUsers((data.users ?? []) as ManagedSiteUser[]);
    if (Array.isArray(data.memberRoster)) {
      setMemberRoster(data.memberRoster as string[]);
    }
    setAdminUsersMessage("");
  }

  useEffect(() => {
    void loadAdminUsers();
    // Roster do servidor (Mongo + legado) para abas Membros/Usuarios e selects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminUsersMessage("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        newLoginRandom
          ? { username: newLoginUsername.trim().toLowerCase(), randomPassword: true }
          : {
              username: newLoginUsername.trim().toLowerCase(),
              randomPassword: false,
              password: newLoginPassword,
            },
      ),
    });
    const data = await response.json();
    if (!response.ok) {
      setAdminUsersMessage(data.error ?? "Falha ao criar usuario.");
      return;
    }
    const extra =
      typeof data.generatedPassword === "string"
        ? ` Senha gerada: ${data.generatedPassword}`
        : "";
    setAdminUsersMessage(`Usuario criado.${extra}`);
    setNewLoginUsername("");
    setNewLoginPassword("");
    setNewLoginRandom(false);
    await loadAdminUsers();
  }

  async function handleBlockUser(username: string, blockedReason: string) {
    setUserActionBusy(username);
    setAdminUsersMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "block",
          username,
          blockedReason: blockedReason.trim() || "Sem motivo informado.",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAdminUsersMessage(data.error ?? "Falha ao bloquear.");
        return;
      }
      setAdminUsersMessage(`OK: @${username} foi bloqueado. Motivo salvo no cadastro dele.`);
      await loadAdminUsers();
    } finally {
      setUserActionBusy(null);
    }
  }

  async function handleUnblockUser(username: string) {
    setUserActionBusy(username);
    setAdminUsersMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unblock", username }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAdminUsersMessage(data.error ?? "Falha ao desbloquear.");
        return;
      }
      setAdminUsersMessage(`OK: @${username} esta ativo de novo (bloqueio removido).`);
      await loadAdminUsers();
    } finally {
      setUserActionBusy(null);
    }
  }

  async function handleRevealPassword(username: string) {
    if (revealedPasswordByUser[username]) {
      setRevealedPasswordByUser((prev) => {
        const next = { ...prev };
        delete next[username];
        return next;
      });
      return;
    }
    setPasswordRevealBusyUser(username);
    setPasswordRevealError("");
    try {
      const response = await fetch(
        `/api/admin/users/password?username=${encodeURIComponent(username)}`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPasswordRevealError(
          `@${username}: ${String(data?.error ?? "Falha ao recuperar senha.")}`,
        );
        return;
      }
      setRevealedPasswordByUser((prev) => ({
        ...prev,
        [username]: String(data?.password ?? ""),
      }));
    } finally {
      setPasswordRevealBusyUser(null);
    }
  }

  async function handleRemoveUser(username: string) {
    if (
      !confirm(
        "APAGAR DEFINITIVAMENTE este usuario? Remove login, comprovantes, multas, perfil, saques, liberacoes HOTS e ajustes de ranking na tabela. Nao da para desfazer.",
      )
    ) {
      return;
    }
    setUserActionBusy(username);
    setAdminUsersMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge", username }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAdminUsersMessage(data.error ?? "Falha ao remover usuario.");
        return;
      }
      setAdminUsersMessage(`OK: @${username} foi removido do site e os dados dele foram apagados.`);
      await loadAdminUsers();
      await loadProofs();
      if (activeSection === "membros") {
        void loadGoalsUsers();
      }
      if (memberManageUsername === username.toLowerCase()) {
        setMemberManageUsername(null);
      }
    } finally {
      setUserActionBusy(null);
    }
  }

  async function loadProofs() {
    const response = await fetch("/api/proofs");
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (data?.error) {
        setMessage(data.error);
      }
      return;
    }
    const data = await response.json();
    setProofs(data);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const count31 = data.filter(
      (item: Proof) => now - new Date(item.createdAt).getTime() <= 31 * dayMs,
    ).length;

    const membersMap = new Map<string, number>();
    for (const proof of data as Proof[]) {
      const key = String(proof.uploader || proof.sellerName).toLowerCase();
      if (!key || key === "bel") continue;
      const current = membersMap.get(key) ?? 0;
      membersMap.set(key, current + 1);
    }
    setMembersState([
      { username: "bel", role: "admin", totalSales: count31 },
      ...Array.from(membersMap.entries()).map(([username, totalSales]) => ({
        username,
        role: "membro",
        totalSales,
      })),
    ]);
  }

  async function loadAdminRanking() {
    const response = await fetch("/api/ranking");
    if (!response.ok) return;
    const data = (await response.json()) as AdminRankingWindows & {
      prizes?: Partial<AdminRankingPrizes>;
      valueOverridesByUser?: Record<string, number>;
    };
    setAdminRanking({ d1: data.d1, d7: data.d7, d14: data.d14, d31: data.d31 });
    const prizes = {
      d1: Number(data.prizes?.d1 ?? 0),
      d7: Number(data.prizes?.d7 ?? 0),
      d14: Number(data.prizes?.d14 ?? 0),
      d31: Number(data.prizes?.d31 ?? 150),
    };
    setAdminRankingPrizes(prizes);
    setRankingPrizeInput(String(prizes[adminRankingTab]));
    setAdminRankingOverrides(
      Object.fromEntries(
        Object.entries(data.valueOverridesByUser ?? {}).map(([k, v]) => [k.toLowerCase(), Number(v)]),
      ),
    );
  }

  async function handleSaveRankingUserValue(username: string) {
    const value = Number(rankingEditValue.replace(",", "."));
    if (!Number.isFinite(value)) return;
    const response = await fetch("/api/ranking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, valueOverride: value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setRankingMessage(String(data.error ?? "Falha ao salvar valor da tabela."));
      return;
    }
    setRankingMessage(`Valor de tabela de @${username} atualizado.`);
    await loadAdminRanking();
  }

  async function handleSaveRankingPrize() {
    const value = Number(rankingPrizeInput.replace(",", "."));
    if (!Number.isFinite(value)) return;
    const response = await fetch("/api/ranking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prizeWindow: adminRankingTab, prizeValue: value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setRankingMessage(String(data.error ?? "Falha ao salvar premio."));
      return;
    }
    setRankingMessage(`Premio de ${adminRankingTab} atualizado.`);
    await loadAdminRanking();
  }

  async function handleResetRankingTable() {
    const confirmed = window.confirm(
      "ATENCAO: isso vai zerar a tabela inteira (vendas e valores de todos) e NAO tem reversao. Deseja continuar?",
    );
    if (!confirmed) return;
    const response = await fetch("/api/ranking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetRanking: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setRankingMessage(String(data.error ?? "Falha ao resetar a tabela."));
      return;
    }
    setRankingMessage("Tabela resetada com sucesso. Todos os valores foram zerados.");
    await loadAdminRanking();
  }

  async function loadReferralsAdmin() {
    setReferralsAdminMessage("");
    const response = await fetch("/api/admin/referrals");
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setReferralsAdminMessage(String(data?.error ?? "Falha ao carregar indicacoes."));
      setReferralsAdminData(null);
      return;
    }
    const data = (await response.json()) as NonNullable<typeof referralsAdminData>;
    setReferralsAdminData(data);
    setReferralsBonusInput(String(Number(data.bonusPercent ?? 4)));
  }

  async function handleSaveReferralsBonusPercent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReferralsAdminBusy(true);
    setReferralsAdminMessage("");
    try {
      const value = Number(referralsBonusInput.replace(",", "."));
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setReferralsAdminMessage("Percentual invalido. Use um numero entre 0 e 100.");
        return;
      }
      const response = await fetch("/api/admin/referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bonusPercent: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReferralsAdminMessage(String(data?.error ?? "Falha ao salvar percentual."));
        return;
      }
      setReferralsAdminMessage(
        `Percentual de indicacao atualizado para ${Number(data?.bonusPercent ?? value).toFixed(2)}%.`,
      );
      await loadReferralsAdmin();
    } finally {
      setReferralsAdminBusy(false);
    }
  }

  async function loadGoalsUsers() {
    const response = await fetch("/api/goals");
    if (!response.ok) return;
    const data = (await response.json()) as { users?: GoalAdminItem[] };
    setGoalsUsers((data.users ?? []) as GoalAdminItem[]);
  }

  async function loadMemberWallet(username: string) {
    const response = await fetch(`/api/withdrawals?username=${encodeURIComponent(username)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { wallet?: { available?: number } };
    const available = Number(data.wallet?.available ?? 0);
    setMemberWalletAvailable(available);
    if (!memberBalanceEditingRef.current) {
      setMemberBalanceTargetInput(available.toFixed(2));
    }
  }

  async function handleSaveMemberBalanceTarget() {
    if (!memberManageUsername) return;
    const raw = String(memberBalanceTargetInput).trim().replace(",", ".");
    const target = Number(raw);
    if (!Number.isFinite(target) || target < 0) {
      setMemberControlMessage("Saldo invalido.");
      return;
    }
    setMemberBalanceBusy(true);
    setMemberControlMessage("");
    try {
      const response = await fetch("/api/admin/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: memberManageUsername,
          setAvailableTo: Number(target.toFixed(2)),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        wallet?: { available?: number };
      };
      if (!response.ok) {
        setMemberControlMessage(String(data.error ?? "Falha ao salvar saldo."));
        return;
      }
      const newAvailable = Number(data.wallet?.available ?? target);
      setMemberWalletAvailable(newAvailable);
      setMemberBalanceTargetInput(newAvailable.toFixed(2));
      setMemberBalanceEditing(false);
      setMemberControlMessage("Saldo atualizado em tempo real.");
      void loadGoalsUsers();
    } finally {
      setMemberBalanceBusy(false);
    }
  }

  async function patchMemberControls(payload: Record<string, unknown>) {
    if (!memberManageUsername) return false;
    setMemberControlBusy(true);
    setMemberControlMessage("");
    try {
      const response = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: memberManageUsername, ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMemberControlMessage(String(data.error ?? "Falha ao salvar controle do membro."));
        return false;
      }
      await Promise.all([loadGoalsUsers(), loadMemberWallet(memberManageUsername)]);
      setMemberControlMessage("Atualizacao salva.");
      return true;
    } finally {
      setMemberControlBusy(false);
    }
  }

  async function handleDeleteMemberProof(proofId: string) {
    if (
      !confirm(
        "Apagar este comprovante? Ele sai do ranking, metas e somatorios do membro (irreversivel).",
      )
    ) {
      return;
    }
    setProofDeleteBusyId(proofId);
    setMemberManageError("");
    try {
      const response = await fetch(`/api/proofs/${proofId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMemberManageError(String(data.error ?? "Falha ao apagar comprovante."));
        return;
      }
      await loadProofs();
    } finally {
      setProofDeleteBusyId(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || proofCooldownRemaining > 0) return;
    if (!file) {
      setMessage("Selecione um print ou gravacao.");
      return;
    }

    setLoading(true);
    setMessage("");

    const formData = new FormData();
    formData.set("uploader", proofTargetUser);
    formData.set("productName", productName);
    formData.set("saleValue", saleValue);
    formData.set("file", file);

    const response = await fetch("/api/proofs", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      retryAfterMs?: number;
      cooldownMs?: number;
    };
    setLoading(false);

    if (!response.ok) {
      if (response.status === 429) {
        const ms = Number(data.retryAfterMs ?? PROOF_COOLDOWN_MS);
        startProofCooldown(Number.isFinite(ms) && ms > 0 ? ms : PROOF_COOLDOWN_MS);
      }
      setMessage(data.error ?? "Falha ao enviar comprovante.");
      return;
    }

    setMessage("Comprovante enviado com sucesso!");
    setProductName("");
    setSaleValue("");
    setFile(null);
    startProofCooldown(Number(data.cooldownMs ?? PROOF_COOLDOWN_MS));
    await loadProofs();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function loadFines() {
    const user = fineUser || "camila";
    const response = await fetch(`/api/fines?username=${encodeURIComponent(user)}`);
    if (!response.ok) return;
    setFines((await response.json()) as AdminFine[]);
  }

  async function loadAllFines() {
    const response = await fetch("/api/fines?all=1");
    if (!response.ok) return;
    setFines((await response.json()) as AdminFine[]);
  }

  async function handleApplyFine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFineMessage("");

    const response = await fetch("/api/fines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: fineUser,
        reason: fineReason,
        durationType: fineDurationType,
        durationValue: fineDurationType === "eterno" ? null : fineDurationValue,
        penaltyPercent: finePenaltyPercent,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setFineMessage(data.error ?? "Falha ao aplicar multa.");
      return;
    }

    setFineMessage("Multa aplicada com sucesso.");
    setFineReason("");
    await loadFines();
  }

  async function handleRemoveFine(fineId: string, username: string) {
    const response = await fetch("/api/fines", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fineId, username }),
    });
    const data = await response.json();
    if (!response.ok) {
      setFineMessage(data.error ?? "Falha ao remover multa.");
      return;
    }
    setFineMessage("Multa removida com sucesso.");
    if (fineAdminTab === "multas") {
      await loadAllFines();
    } else {
      await loadFines();
    }
  }

  async function handleUpdateFine(fineId: string) {
    const edit = fineEditById[fineId];
    if (!edit) return;
    const response = await fetch("/api/fines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: fineId,
        durationType: edit.durationType,
        durationValue: edit.durationType === "eterno" ? null : Number(edit.durationValue),
        penaltyPercent: Number(edit.penaltyPercent),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setFineMessage(String(data.error ?? "Falha ao atualizar multa."));
      return;
    }
    setFineMessage("Multa atualizada com sucesso.");
    await loadAllFines();
  }

  async function loadHotsAccessList() {
    const response = await fetch("/api/hots-access?all=1");
    if (!response.ok) return;
    const data = (await response.json()) as {
      access?: HotsAccessItem[];
      profilesByKey?: Partial<Record<"loira" | "morena", HotsProfileCredentials>>;
    };
    setHotsAccessList(data.access ?? []);
    setHotsCredentialsByProfile(data.profilesByKey ?? {});
  }

  useEffect(() => {
    const current = hotsCredentialsByProfile[hotsConfigProfile];
    setHotsLoginInput(current?.login ?? "");
    setHotsPasswordInput(current?.password ?? "");
    setHotsImageUrlInput(current?.imageUrl ?? "");
    const socialCurrent = current?.socialCredentialsByKey?.[hotsConfigSocial];
    setHotsSocialLoginInput(socialCurrent?.login ?? "");
    setHotsSocialPasswordInput(socialCurrent?.password ?? "");
    setHotsSocialUrlInput(socialCurrent?.url ?? "");
  }, [hotsConfigProfile, hotsConfigSocial, hotsCredentialsByProfile]);

  async function loadWithdrawals() {
    const response = await fetch("/api/withdrawals");
    if (!response.ok) {
      setWithdrawalsMessage("Falha ao carregar saques.");
      return;
    }
    const data = (await response.json()) as { withdrawals?: AdminWithdrawal[] };
    setWithdrawals((data.withdrawals ?? []) as AdminWithdrawal[]);
    setWithdrawalsMessage("");
  }

  async function loadWithdrawSettings() {
    const response = await fetch("/api/withdrawal-settings");
    if (!response.ok) return;
    const data = (await response.json()) as { minWithdraw?: number };
    setWithdrawMinInput(String(Number(data.minWithdraw ?? 200).toFixed(2)));
  }

  async function handleUpdateWithdrawMin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWithdrawalsMessage("");
    const value = Number(withdrawMinInput.replace(",", "."));
    const response = await fetch("/api/withdrawal-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minWithdraw: value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWithdrawalsMessage(String(data.error ?? "Falha ao salvar minimo."));
      return;
    }
    setWithdrawalsMessage(`Minimo de saque atualizado para R$ ${Number(data.minWithdraw ?? value).toFixed(2)}.`);
  }

  async function handleReviewWithdraw(
    id: string,
    action: "approve" | "reject",
    rejectionReason?: string,
  ) {
    setWithdrawActionBusyId(id);
    setWithdrawalsMessage("");
    try {
      const response = await fetch("/api/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, rejectionReason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWithdrawalsMessage(String(data.error ?? "Falha ao revisar saque."));
        return;
      }
      setWithdrawalsMessage(
        action === "approve"
          ? "Saque aprovado com sucesso."
          : "Saque recusado com sucesso.",
      );
      await loadWithdrawals();
    } finally {
      setWithdrawActionBusyId(null);
    }
  }

  async function handleReleaseHotsAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHotsMessage("");

    const response = await fetch("/api/hots-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "release",
        username: hotsUser,
        profileKey: hotsProfile,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setHotsMessage(data.error ?? "Falha ao liberar acesso.");
      return;
    }
    setHotsMessage("Acesso liberado com sucesso.");
    await loadHotsAccessList();
  }

  async function handleReleaseHotsSocialAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHotsMessage("");
    const response = await fetch("/api/hots-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "release-social",
        username: hotsUser,
        profileKey: hotsProfile,
        socialKey: hotsSocial,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setHotsMessage(String(data.error ?? "Falha ao liberar rede social."));
      return;
    }
    setHotsMessage(`Rede ${HOTS_SOCIAL_LABELS[hotsSocial]} liberada para @${hotsUser}.`);
    await loadHotsAccessList();
  }

  async function handleRemoveHotsAccess(
    username: string,
    profileKey: "loira" | "morena",
    scope: "profile" | "social",
    socialKey?: "twitter" | "facebook" | "tiktok" | "instagram" | "discord",
  ) {
    const confirmed = window.confirm(
      scope === "profile"
        ? `Remover acesso de @${username} para perfil ${profileKey}?`
        : `Remover acesso de @${username} para ${HOTS_SOCIAL_LABELS[socialKey ?? "instagram"]} (${profileKey})?`,
    );
    if (!confirmed) return;
    const response = await fetch("/api/hots-access", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, profileKey, scope, socialKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setHotsMessage(String(data.error ?? "Falha ao remover acesso."));
      return;
    }
    setHotsMessage(
      scope === "profile"
        ? `Acesso removido: @${username} (${profileKey}).`
        : `Acesso removido: @${username} (${HOTS_SOCIAL_LABELS[socialKey ?? "instagram"]}).`,
    );
    await loadHotsAccessList();
  }

  async function handleSaveHotsCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHotsMessage("");
    const response = await fetch("/api/hots-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-credentials",
        profileKey: hotsConfigProfile,
        login: hotsLoginInput,
        password: hotsPasswordInput,
        imageUrl: hotsImageUrlInput,
        socialKey: hotsConfigSocial,
        socialLogin: hotsSocialLoginInput,
        socialPassword: hotsSocialPasswordInput,
        socialUrl: hotsSocialUrlInput,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setHotsMessage(String(data.error ?? "Falha ao salvar credenciais."));
      return;
    }
    setHotsMessage(`Credenciais do perfil ${hotsConfigProfile} atualizadas.`);
    await loadHotsAccessList();
  }

  const ranking = [...membersState]
    .filter((member) => member.role !== "admin")
    .sort((a, b) => b.totalSales - a.totalSales);

  const adminNowMs = Date.now();
  const adminFilteredProofs = proofs.filter((proof) => {
    const ageMs = adminNowMs - new Date(proof.createdAt).getTime();
    return ageMs <= ADMIN_DASHBOARD_DAYS[adminDashboardTab] * 24 * 60 * 60 * 1000;
  });
  const adminTotalSold = adminFilteredProofs.reduce(
    (acc, proof) => acc + Number(proof.saleValue ?? 0),
    0,
  );
  const adminProofsCount = adminFilteredProofs.length;
  const adminAvgTicket = adminProofsCount > 0 ? adminTotalSold / adminProofsCount : 0;
  const adminChartPointsCount = 12;
  const adminSelectedDays = ADMIN_DASHBOARD_DAYS[adminDashboardTab];
  const adminChartStepDays = Math.max(1, Math.ceil(adminSelectedDays / adminChartPointsCount));
  const adminChartSeries = Array.from({ length: adminChartPointsCount }, (_, index) => {
    const endTime =
      adminNowMs -
      (adminChartPointsCount - 1 - index) * adminChartStepDays * 24 * 60 * 60 * 1000;
    const startTime = endTime - adminChartStepDays * 24 * 60 * 60 * 1000;
    const total = proofs
      .filter((proof) => {
        const createdTime = new Date(proof.createdAt).getTime();
        return createdTime > startTime && createdTime <= endTime;
      })
      .reduce((acc, proof) => acc + Number(proof.saleValue ?? 0), 0);
    return {
      label: `${index + 1}`,
      value: Number(total.toFixed(2)),
    };
  });
  const adminChartMax = Math.max(...adminChartSeries.map((item) => item.value), 1);
  const adminSvgWidth = 900;
  const adminSvgHeight = 260;
  const adminChartPaddingX = 30;
  const adminChartPaddingY = 28;
  const adminPlotWidth = adminSvgWidth - adminChartPaddingX * 2;
  const adminPlotHeight = adminSvgHeight - adminChartPaddingY * 2;
  const adminStrokePath = adminChartSeries
    .map((point, index) => {
      const x =
        adminChartPaddingX + (index / Math.max(adminChartSeries.length - 1, 1)) * adminPlotWidth;
      const y = adminChartPaddingY + (1 - point.value / adminChartMax) * adminPlotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const adminAreaPath = `${adminStrokePath} L ${(adminChartPaddingX + adminPlotWidth).toFixed(2)} ${(adminChartPaddingY + adminPlotHeight).toFixed(2)} L ${adminChartPaddingX.toFixed(2)} ${(adminChartPaddingY + adminPlotHeight).toFixed(2)} Z`;
  const adminHoveredPoint =
    adminHoveredChartIndex === null
      ? null
      : adminChartSeries[
          Math.max(0, Math.min(adminHoveredChartIndex, adminChartSeries.length - 1))
        ];

  const proofUploaderOptions = Array.from(
    new Set(
      proofs.map((p) => String(p.uploader || p.sellerName || "").toLowerCase()).filter((u) => u),
    ),
  ).sort();
  const proofsSortedForAdmin = [...proofs]
    .filter((p) => {
      if (!proofUploaderFilter) return true;
      const up = String(p.uploader || p.sellerName || "").toLowerCase();
      return up === proofUploaderFilter;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const dashboardRecentEntries = [...proofs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);
  const visibleWithdrawals =
    withdrawalsTab === "pendentes"
      ? withdrawals.filter((item) => item.status === "pending")
      : withdrawals;

  const adminUsersMessageIsError =
    adminUsersMessage.includes("Falha") ||
    adminUsersMessage.includes("Nao foi") ||
    adminUsersMessage.toLowerCase().includes("invalido") ||
    adminUsersMessage.toLowerCase().includes("ja existe");

  const dayMsMember = 24 * 60 * 60 * 1000;
  const managedMemberProofs =
    memberManageUsername === null
      ? []
      : [...proofs]
          .filter((p) => String(p.uploader || "").toLowerCase() === memberManageUsername)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const managedPenalty = activePenaltyPercentFromAdminFines(memberManageFines);
  const managedSumStored = managedMemberProofs.reduce((a, p) => a + Number(p.saleValue ?? 0), 0);
  const managedSumGross = managedMemberProofs.reduce(
    (a, p) => a + Number(p.grossSaleValue ?? p.saleValue ?? 0),
    0,
  );
  const managedSumRealEst = managedSumStored * 0.35 * (1 - managedPenalty / 100);
  const managed31Proofs = managedMemberProofs.filter(
    (p) => Date.now() - new Date(p.createdAt).getTime() <= 31 * dayMsMember,
  );
  const managed31SumStored = managed31Proofs.reduce((a, p) => a + Number(p.saleValue ?? 0), 0);
  const selectedMemberGoal =
    memberManageUsername == null
      ? null
      : goalsUsers.find((item) => item.username === memberManageUsername) ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#F6E1E1] via-[#f8ece7] to-[#f3dfd5] p-6">
      <div className="mx-auto my-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl border border-[#BC8A6F66] bg-white/85 p-4 shadow-2xl shadow-[#BC8A6F35] backdrop-blur">
          <h2 className="mb-4 text-xl text-[#7a5643]">Admin Bel</h2>
          <nav className="grid gap-2">
            <button onClick={() => setActiveSection("dashboard")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "dashboard" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Dashboard</button>
            <button onClick={() => setActiveSection("comprovantes")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "comprovantes" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Comprovantes</button>
            <button onClick={() => setActiveSection("tabela")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "tabela" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Tabela</button>
            <button onClick={() => setActiveSection("membros")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "membros" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Membros</button>
            <button onClick={() => setActiveSection("usuarios")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "usuarios" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Usuarios</button>
            <button onClick={() => setActiveSection("indicacoes")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "indicacoes" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Indicacoes</button>
            <button onClick={() => setActiveSection("saques")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "saques" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Saques</button>
            <button onClick={() => setActiveSection("gerenciar-multas")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "gerenciar-multas" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Gerenciar Multas</button>
            <button onClick={() => setActiveSection("hots")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "hots" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Hots</button>
            <button onClick={() => setActiveSection("configuracoes")} className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "configuracoes" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}>Configuracoes</button>
          </nav>
          <button
            onClick={handleLogout}
            className="mt-6 w-full rounded-xl bg-[#BC8A6F] px-3 py-2 text-xs text-white hover:brightness-95"
          >
            Sair
          </button>
        </aside>

        <section
          key={activeSection}
          className="panel-content-enter rounded-3xl border border-[#BC8A6F66] bg-white/85 p-6 shadow-2xl shadow-[#BC8A6F35] backdrop-blur"
        >
          {activeSection === "dashboard" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Dashboard de vendas</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Visao geral de todos os comprovantes (equipe + Bel). Mesmo estilo de onda do painel
                dos usuarios, com destaque no total em R$ no periodo.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(Object.keys(ADMIN_DASHBOARD_DAYS) as (keyof typeof ADMIN_DASHBOARD_DAYS)[]).map(
                  (key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setAdminHoveredChartIndex(null);
                        setAdminDashboardTab(key);
                      }}
                      className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-xs hover:brightness-[0.98] ${adminDashboardTab === key ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                    >
                      {ADMIN_RANKING_LABELS[key]}
                    </button>
                  ),
                )}
              </div>
              <article className="mt-4 rounded-3xl border-2 border-[#8b5a3c] bg-gradient-to-br from-[#fff7f3] via-[#f5e0d4] to-[#edd3c5] p-6 shadow-lg shadow-[#BC8A6F22]">
                <p className="text-sm font-medium uppercase tracking-wide text-[#9a725c]">
                  Total vendido no periodo (soma dos valores dos comprovantes)
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-[#7a5643] sm:text-5xl">
                  R$ {adminTotalSold.toFixed(2)}
                </p>
                <p className="mt-2 text-xs text-[#9a725c]">
                  Periodo: {ADMIN_RANKING_LABELS[adminDashboardTab]}. Inclui todos os envios
                  registrados no site.
                </p>
              </article>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Comprovantes no periodo</p>
                  <p className="text-2xl text-[#7a5643]">{adminProofsCount}</p>
                </article>
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Ticket medio (R$)</p>
                  <p className="text-2xl text-[#7a5643]">{adminAvgTicket.toFixed(2)}</p>
                </article>
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Estimativa comissao 35%</p>
                  <p className="text-2xl text-[#7a5643]">R$ {(adminTotalSold * 0.35).toFixed(2)}</p>
                </article>
              </div>
              <div className="mt-4 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                <p className="text-sm font-medium text-[#7a5643]">
                  Historico rapido de entradas (ultimos comprovantes)
                </p>
                <div className="mt-3 grid gap-2">
                  {dashboardRecentEntries.length === 0 ? (
                    <p className="text-sm text-[#9a725c]">Sem comprovantes ainda.</p>
                  ) : (
                    dashboardRecentEntries.map((proof) => (
                      <div
                        key={`dash-proof-${proof.id}`}
                        className="flex items-center justify-between rounded-xl border border-[#BC8A6F33] bg-white px-3 py-2 text-sm"
                      >
                        <span className="text-[#7a5643]">
                          {new Date(proof.createdAt).toLocaleString("pt-BR")}
                        </span>
                        <strong className="text-[#7a5643]">
                          R$ {Number(proof.saleValue ?? 0).toFixed(2)}
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-3xl border border-[#BC8A6F66] bg-gradient-to-b from-[#fff3ef] to-[#f7e5dc] p-4 shadow-xl shadow-[#BC8A6F40]">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#7a5643]">Grafico em onda (R$ por trecho)</p>
                  <p className="text-xs text-[#9a725c]">{adminChartStepDays} dia(s) por ponto</p>
                </div>
                <svg
                  viewBox={`0 0 ${adminSvgWidth} ${adminSvgHeight}`}
                  className="h-56 w-full"
                  role="img"
                  aria-label="Grafico ondulado de vendas em reais"
                  onMouseLeave={() => setAdminHoveredChartIndex(null)}
                >
                  <defs>
                    <linearGradient id="adminWaveArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#BC8A6F" stopOpacity="0.6" />
                      <stop offset="70%" stopColor="#E8B7A1" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#F6D6C8" stopOpacity="0.08" />
                    </linearGradient>
                    <linearGradient id="adminWaveStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#D7A58A" />
                      <stop offset="100%" stopColor="#BC8A6F" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3, 4].map((line) => {
                    const y = adminChartPaddingY + (line / 4) * adminPlotHeight;
                    return (
                      <line
                        key={line}
                        x1={adminChartPaddingX}
                        y1={y}
                        x2={adminChartPaddingX + adminPlotWidth}
                        y2={y}
                        stroke="#BC8A6F33"
                        strokeWidth="1"
                      />
                    );
                  })}
                  <path d={adminAreaPath} fill="url(#adminWaveArea)" />
                  <path
                    d={adminStrokePath}
                    fill="none"
                    stroke="url(#adminWaveStroke)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {adminChartSeries.map((point, index) => {
                    const x =
                      adminChartPaddingX +
                      (index / Math.max(adminChartSeries.length - 1, 1)) * adminPlotWidth;
                    const y =
                      adminChartPaddingY + (1 - point.value / adminChartMax) * adminPlotHeight;
                    const isHovered = adminHoveredChartIndex === index;
                    return (
                      <circle
                        key={`admin-dot-${point.label}`}
                        cx={x}
                        cy={y}
                        r={isHovered ? 6 : 4}
                        fill={isHovered ? "#7a5643" : "#BC8A6F"}
                        stroke="#fff"
                        strokeWidth="2"
                        onMouseEnter={() => setAdminHoveredChartIndex(index)}
                      />
                    );
                  })}
                  {adminHoveredPoint && adminHoveredChartIndex !== null ? (
                    <>
                      {(() => {
                        const x =
                          adminChartPaddingX +
                          (Math.max(
                            0,
                            Math.min(adminHoveredChartIndex, adminChartSeries.length - 1),
                          ) /
                            Math.max(adminChartSeries.length - 1, 1)) *
                            adminPlotWidth;
                        const y =
                          adminChartPaddingY +
                          (1 - adminHoveredPoint.value / adminChartMax) * adminPlotHeight;
                        return (
                          <>
                            <line
                              x1={x}
                              y1={adminChartPaddingY}
                              x2={x}
                              y2={adminChartPaddingY + adminPlotHeight}
                              stroke="#BC8A6F66"
                              strokeDasharray="4 4"
                              strokeWidth="1.5"
                            />
                            <rect
                              x={Math.max(adminChartPaddingX, Math.min(x - 95, adminSvgWidth - 190))}
                              y={Math.max(8, y - 56)}
                              width="190"
                              height="42"
                              rx="10"
                              fill="#fff7f3"
                              stroke="#BC8A6F88"
                            />
                            <text
                              x={Math.max(
                                adminChartPaddingX + 10,
                                Math.min(x - 85, adminSvgWidth - 180),
                              )}
                              y={Math.max(25, y - 38)}
                              fill="#7a5643"
                              fontSize="12"
                            >
                              Ponto {adminHoveredPoint.label}
                            </text>
                            <text
                              x={Math.max(
                                adminChartPaddingX + 10,
                                Math.min(x - 85, adminSvgWidth - 180),
                              )}
                              y={Math.max(41, y - 22)}
                              fill="#7a5643"
                              fontSize="12"
                            >
                              R$ {adminHoveredPoint.value.toFixed(2)}
                            </text>
                          </>
                        );
                      })()}
                    </>
                  ) : null}
                </svg>
              </div>
            </>
          ) : null}

          {activeSection === "comprovantes" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Comprovantes</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Envio da Bel e lista de <strong className="text-[#7a5643]">todos</strong> os
                comprovantes do site. Filtre por quem enviou ou veja o total geral.
              </p>
              <form className="mt-6 grid gap-3" onSubmit={onSubmit}>
                <select
                  className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                  value={proofTargetUser}
                  onChange={(event) => setProofTargetUser(event.target.value)}
                >
                  {rosterForSelects.map((user) => (
                    <option key={user} value={user}>
                      Enviar por @{user}
                    </option>
                  ))}
                </select>
                <input placeholder="Produto vendido" className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]" value={productName} onChange={(event) => setProductName(event.target.value)} required />
                <input placeholder="Valor (R$)" className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]" value={saleValue} onChange={(event) => setSaleValue(event.target.value)} required />
                <input type="file" accept="image/*,video/*" className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
                <button
                  type="submit"
                  disabled={loading || proofCooldownRemaining > 0}
                  className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? "Enviando..."
                    : proofCooldownRemaining > 0
                      ? `Aguarde ${Math.ceil(proofCooldownRemaining / 1000)}s...`
                      : "Enviar comprovante"}
                </button>
                <p className="text-[11px] text-[#9a725c]">
                  Por seguranca, ha um intervalo de 10 segundos entre envios.
                </p>
                {message ? <p className="text-sm text-[#7a5643]">{message}</p> : null}
              </form>

              <div className="mt-8 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <label className="grid gap-1 text-sm text-[#7a5643]">
                    Filtrar por quem enviou (login)
                    <select
                      className="max-w-md rounded-xl border border-[#BC8A6F66] bg-white px-3 py-2 text-sm text-[#7a5643]"
                      value={proofUploaderFilter}
                      onChange={(e) => setProofUploaderFilter(e.target.value)}
                    >
                      <option value="">Todos os usuarios</option>
                      {proofUploaderOptions.map((u) => (
                        <option key={u} value={u}>
                          @{u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm text-[#9a725c]">
                    Mostrando{" "}
                    <strong className="text-[#7a5643]">{proofsSortedForAdmin.length}</strong> de{" "}
                    <strong className="text-[#7a5643]">{proofs.length}</strong> comprovante(s)
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {proofs.length === 0 ? (
                  <p className="text-sm text-[#9a725c]">Nenhum comprovante enviado ainda.</p>
                ) : proofsSortedForAdmin.length === 0 ? (
                  <p className="text-sm text-[#9a725c]">Nenhum comprovante para este filtro.</p>
                ) : (
                  proofsSortedForAdmin.map((proof) => {
                    const who = String(proof.uploader || proof.sellerName || "?").toLowerCase();
                    return (
                      <article
                        key={proof.id}
                        className="flex flex-col gap-3 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4 sm:flex-row sm:items-start"
                      >
                        <div className="flex shrink-0 items-center gap-3">
                          <UserAvatar username={who} className="h-12 w-12" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-[#9a725c]">
                              Quem enviou
                            </p>
                            <p className="truncate text-base font-semibold text-[#7a5643]">@{who}</p>
                            <p className="text-xs text-[#9a725c]">
                              {new Date(proof.createdAt).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 border-t border-[#BC8A6F22] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                          <p className="text-sm text-[#7a5643]">
                            <span className="text-[#9a725c]">Produto:</span> {proof.productName}
                            {Number(proof.saleValue ?? 0) > 0
                              ? ` — R$ ${Number(proof.saleValue ?? 0).toFixed(2)}`
                              : ""}
                          </p>
                          <a
                            className="mt-2 inline-block text-sm font-medium text-[#BC8A6F] underline"
                            href={`/api/proofs/${proof.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir arquivo: {proof.originalName}
                          </a>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </>
          ) : null}

          {activeSection === "tabela" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Tabela de quem mais vendeu</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Mesma tabela dos usuarios. Ajustes feitos aqui atualizam para todos em tempo real.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["d1", "d7", "d14", "d31"] as (keyof AdminRankingWindows)[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setAdminRankingTab(key);
                      setRankingPrizeInput(String(adminRankingPrizes[key]));
                    }}
                    className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-xs hover:brightness-[0.98] ${adminRankingTab === key ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                  >
                    {ADMIN_RANKING_LABELS[key]}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-2 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <label className="grid gap-1 text-xs text-[#7a5643]">
                  Premio do periodo ({ADMIN_RANKING_LABELS[adminRankingTab]})
                  <input
                    className="rounded-lg border border-[#BC8A6F66] bg-white px-2 py-1 text-sm text-[#7a5643]"
                    inputMode="decimal"
                    value={rankingPrizeInput}
                    onChange={(e) => setRankingPrizeInput(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleSaveRankingPrize()}
                  className="rounded-lg bg-[#BC8A6F] px-3 py-2 text-xs text-white hover:brightness-95"
                >
                  Salvar premio
                </button>
                <span className="text-xs text-[#9a725c]">
                  Atual: R$ {Number(adminRankingPrizes[adminRankingTab] ?? 0).toFixed(2)}
                </span>
              </div>
              {rankingMessage ? <p className="mt-2 text-sm text-[#7a5643]">{rankingMessage}</p> : null}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void handleResetRankingTable()}
                  className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100"
                >
                  Resetar tabela (sem reversao)
                </button>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-[#BC8A6F44]">
                <table className="w-full border-collapse bg-white text-left">
                  <thead className="bg-[#fff7f3]">
                    <tr>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Posicao</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Foto</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Usuario</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Vendas</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Valor total (R$)</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Editar valor tabela</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adminRanking?.[adminRankingTab] ?? []).length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-sm text-[#9a725c]" colSpan={6}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      (adminRanking?.[adminRankingTab] ?? []).map((item, index) => (
                        <tr
                          key={item.username}
                          className={`border-t border-[#BC8A6F22] ${adminPodiumRowClass(index)}`}
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex min-w-[2.25rem] items-center justify-center rounded-full bg-white/80 px-2 py-0.5 text-sm font-bold text-[#7a5643] ring-1 ring-[#BC8A6F44]">
                              {index === 0 ? "1" : index === 1 ? "2" : index === 2 ? "3" : index + 1}
                              {index < 3 ? "º" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <UserAvatar username={item.username} className="h-9 w-9" />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[#7a5643]">
                            {item.username}
                            {index === 0 ? (
                              <span className="ml-2 text-xs font-semibold text-amber-800">Lider</span>
                            ) : null}
                            {index === 1 ? (
                              <span className="ml-2 text-xs font-semibold text-slate-600">2 lugar</span>
                            ) : null}
                            {index === 2 ? (
                              <span className="ml-2 text-xs font-semibold text-orange-800">3 lugar</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#7a5643]">{item.vendas}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-[#7a5643]">
                            R$ {Number(item.valorTotal ?? 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <input
                                className="w-24 rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643]"
                                inputMode="decimal"
                                value={rankingEditUsername === item.username ? rankingEditValue : String(adminRankingOverrides[item.username] ?? 0)}
                                onChange={(e) => {
                                  setRankingEditUsername(item.username);
                                  setRankingEditValue(e.target.value);
                                }}
                              />
                              <button
                                type="button"
                                className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3]"
                                onClick={() => {
                                  if (rankingEditUsername !== item.username) {
                                    setRankingEditUsername(item.username);
                                    setRankingEditValue(String(adminRankingOverrides[item.username] ?? 0));
                                  }
                                  void handleSaveRankingUserValue(item.username);
                                }}
                              >
                                Salvar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {activeSection === "membros" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Membros</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Abra o perfil de cada pessoa para ver comprovantes, somatorios e apagar envios
                individuais (o ranking e as metas usam os mesmos valores do sistema).
              </p>

              {!memberManageUsername ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {membrosCards.map((member) => (
                    <div
                      key={`${member.role}-${member.username}`}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-[#BC8A6F33] bg-[#fff7f3] px-3 py-2 text-sm text-[#7a5643]"
                    >
                      {member.role !== "admin" ? (
                        <UserAvatar username={member.username} className="h-10 w-10 shrink-0" />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#BC8A6F44] bg-white text-xs text-[#9a725c]">
                          ADM
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-[#7a5643]">@{member.username}</span> (
                        {member.role}) — comprovantes (31 dias): {member.totalSales}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setMemberManageError("");
                          setMemberManageUsername(member.username.toLowerCase());
                        }}
                        className="rounded-lg bg-[#BC8A6F] px-3 py-1.5 text-xs text-white hover:brightness-95"
                      >
                        Gerenciar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <button
                    type="button"
                    onClick={() => {
                      setMemberManageUsername(null);
                      setMemberManageError("");
                    }}
                    className="text-sm font-medium text-[#BC8A6F] underline hover:brightness-95"
                  >
                    ← Voltar para lista de membros
                  </button>

                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                    <UserAvatar username={memberManageUsername} className="h-14 w-14 shrink-0" />
                    <div>
                      <p className="text-lg font-semibold text-[#7a5643]">@{memberManageUsername}</p>
                      <p className="text-xs text-[#9a725c]">
                        Valores &quot;reais&quot; abaixo usam a mesma logica do painel do membro: 35%
                        sobre a soma armazenada, menos multas ativas em %.
                      </p>
                    </div>
                  </div>

                  {memberManageError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                      {memberManageError}
                    </div>
                  ) : null}

                  <div className="grid gap-3 rounded-2xl border-2 border-[#BC8A6F88] bg-gradient-to-br from-[#fff3ec] to-[#f7e2d2] p-4 shadow-sm lg:grid-cols-2">
                    <article className="rounded-xl border-2 border-[#BC8A6F88] bg-white p-4 shadow-sm">
                      <p className="text-sm font-bold uppercase tracking-wide text-[#7a5643]">
                        Saldo da conta (em tempo real)
                      </p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#7a5643]">
                        R$ {memberWalletAvailable.toFixed(2)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#9a725c]">
                        Edite o valor abaixo e clique em <strong>Salvar saldo</strong>. Use isso
                        quando algum pagamento foi feito fora do site para deixar o saldo
                        certo (ex.: pagar R$ 100 fora &rarr; subtrair R$ 100 do saldo).
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#7a5643]">R$</span>
                        <input
                          className="w-36 rounded-lg border-2 border-[#BC8A6F88] bg-[#fff7f3] px-2 py-1.5 text-sm font-semibold text-[#7a5643]"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={memberBalanceTargetInput}
                          onChange={(e) => {
                            setMemberBalanceTargetInput(e.target.value);
                            setMemberBalanceEditing(true);
                          }}
                          onFocus={() => setMemberBalanceEditing(true)}
                          onBlur={() => {
                            const raw = String(memberBalanceTargetInput).trim().replace(",", ".");
                            const num = Number(raw);
                            if (
                              !Number.isFinite(num) ||
                              Math.abs(num - memberWalletAvailable) < 0.005
                            ) {
                              setMemberBalanceEditing(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={memberBalanceBusy}
                          onClick={() => void handleSaveMemberBalanceTarget()}
                          className="rounded-lg bg-[#BC8A6F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-45"
                        >
                          {memberBalanceBusy ? "Salvando..." : "Salvar saldo"}
                        </button>
                        <button
                          type="button"
                          disabled={memberBalanceBusy}
                          onClick={() => {
                            setMemberBalanceTargetInput(memberWalletAvailable.toFixed(2));
                            setMemberBalanceEditing(false);
                          }}
                          className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3] disabled:opacity-45"
                        >
                          Cancelar
                        </button>
                      </div>
                    </article>

                    <article className="rounded-xl border border-[#BC8A6F33] bg-white p-3">
                      <p className="text-sm font-medium text-[#7a5643]">Meta, foguinho e comissao de meta</p>
                      <p className="mt-1 text-[11px] text-[#9a725c]">
                        Esta comissao entra quando a pessoa bate a meta diaria.
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <input
                          className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643]"
                          inputMode="decimal"
                          placeholder="Meta hoje (R$)"
                          value={memberGoalTodayInput}
                          onChange={(e) => setMemberGoalTodayInput(e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643]"
                          inputMode="numeric"
                          placeholder="Foguinho (dias)"
                          value={memberStreakInput}
                          onChange={(e) => setMemberStreakInput(e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643]"
                          inputMode="decimal"
                          placeholder="Comissao da meta (%)"
                          value={memberGoalCommissionInput}
                          onChange={(e) => setMemberGoalCommissionInput(e.target.value)}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={memberControlBusy}
                          onClick={() =>
                            void patchMemberControls({
                              dailyProgressOverride: Number(memberGoalTodayInput.replace(",", ".")),
                            })
                          }
                          className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3] disabled:opacity-45"
                        >
                          Salvar meta hoje
                        </button>
                        <button
                          type="button"
                          disabled={memberControlBusy}
                          onClick={() =>
                            void patchMemberControls({
                              streakOverride: Number(memberStreakInput),
                            })
                          }
                          className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3] disabled:opacity-45"
                        >
                          Salvar foguinho
                        </button>
                        <button
                          type="button"
                          disabled={memberControlBusy}
                          onClick={() =>
                            void patchMemberControls({
                              goalReachedCommissionPercentOverride: Number(
                                memberGoalCommissionInput.replace(",", "."),
                              ),
                            })
                          }
                          className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3] disabled:opacity-45"
                        >
                          Salvar comissao da meta
                        </button>
                      </div>
                      {selectedMemberGoal ? (
                        <p className="mt-2 text-xs text-[#9a725c]">
                          Atual: meta hoje R$ {Number(selectedMemberGoal.total ?? 0).toFixed(2)} | foguinho{" "}
                          {selectedMemberGoal.streakDays} | comissao da meta{" "}
                          {selectedMemberGoal.goalReachedCommissionPercent.toFixed(2)}%
                        </p>
                      ) : null}
                    </article>
                    <article className="rounded-xl border border-[#BC8A6F88] bg-[#fff3ec] p-3 shadow-sm">
                      <p className="text-sm font-semibold text-[#7a5643]">Comissao GLOBAL (destaque)</p>
                      <p className="mt-1 text-[11px] text-[#9a725c]">
                        Percentual padrao da pessoa quando ainda nao bateu a meta do dia.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          className="w-44 rounded-lg border-2 border-[#BC8A6F88] px-2 py-1 text-sm font-medium text-[#7a5643]"
                          inputMode="decimal"
                          placeholder="Comissao global (%)"
                          value={memberGlobalCommissionInput}
                          onChange={(e) => setMemberGlobalCommissionInput(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={memberControlBusy}
                          onClick={() =>
                            void patchMemberControls({
                              globalCommissionPercentOverride: Number(
                                memberGlobalCommissionInput.replace(",", "."),
                              ),
                            })
                          }
                          className="rounded-lg bg-[#BC8A6F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-45"
                        >
                          Salvar comissao GLOBAL
                        </button>
                      </div>
                      {selectedMemberGoal ? (
                        <p className="mt-2 text-xs text-[#9a725c]">
                          Atual global: {selectedMemberGoal.globalCommissionPercent.toFixed(2)}% | efetiva hoje:{" "}
                          {selectedMemberGoal.commissionPercent.toFixed(2)}%
                        </p>
                      ) : null}
                    </article>
                  </div>

                  {memberControlMessage ? (
                    <div className="rounded-xl border border-[#BC8A6F44] bg-[#fff7f3] px-3 py-2 text-sm text-[#7a5643]">
                      {memberControlMessage}
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                      <p className="text-xs text-[#9a725c]">Comprovantes (total)</p>
                      <p className="text-2xl font-semibold text-[#7a5643]">{managedMemberProofs.length}</p>
                    </article>
                    <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                      <p className="text-xs text-[#9a725c]">Soma armazenada (total)</p>
                      <p className="text-2xl font-semibold text-[#7a5643]">
                        R$ {managedSumStored.toFixed(2)}
                      </p>
                      <p className="mt-1 text-[10px] leading-tight text-[#9a725c]">
                        Base usada no ranking (valor ja ajustado na epoca do envio).
                      </p>
                    </article>
                    <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                      <p className="text-xs text-[#9a725c]">Bruto declarado (total)</p>
                      <p className="text-2xl font-semibold text-[#7a5643]">
                        R$ {managedSumGross.toFixed(2)}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                      <p className="text-xs text-[#9a725c]">Valor real estimado (total)</p>
                      <p className="text-2xl font-semibold text-[#7a5643]">
                        R$ {managedSumRealEst.toFixed(2)}
                      </p>
                      <p className="mt-1 text-[10px] text-[#9a725c]">
                        Multa ativa: {managedPenalty.toFixed(1)}%
                      </p>
                    </article>
                  </div>

                  <article className="rounded-2xl border border-[#BC8A6F66] bg-gradient-to-r from-[#fff7f3] to-[#f7e5dc] p-4">
                    <p className="text-sm font-medium text-[#7a5643]">Ultimos 31 dias (ranking)</p>
                    <p className="mt-1 text-sm text-[#9a725c]">
                      {managed31Proofs.length} comprovante(s) — soma armazenada{" "}
                      <strong className="text-[#7a5643]">R$ {managed31SumStored.toFixed(2)}</strong>
                    </p>
                  </article>

                  <div className="overflow-hidden rounded-2xl border border-[#BC8A6F44]">
                    <table className="w-full min-w-0 border-collapse bg-white text-left text-sm">
                      <thead className="bg-[#fff7f3]">
                        <tr>
                          <th className="px-3 py-2 text-[#7a5643]">Data</th>
                          <th className="px-3 py-2 text-[#7a5643]">Produto</th>
                          <th className="px-3 py-2 text-[#7a5643]">Armaz.</th>
                          <th className="hidden px-3 py-2 text-[#7a5643] sm:table-cell">Bruto</th>
                          <th className="px-3 py-2 text-[#7a5643]">Arquivo</th>
                          <th className="px-3 py-2 text-right text-[#7a5643]">Acao</th>
                        </tr>
                      </thead>
                      <tbody>
                        {managedMemberProofs.length === 0 ? (
                          <tr>
                            <td className="px-3 py-4 text-[#9a725c]" colSpan={6}>
                              Nenhum comprovante com uploader @{memberManageUsername}.
                            </td>
                          </tr>
                        ) : (
                          managedMemberProofs.map((proof) => {
                            const gross = Number(proof.grossSaleValue ?? proof.saleValue ?? 0);
                            const busy = proofDeleteBusyId === proof.id;
                            return (
                              <tr key={proof.id} className="border-t border-[#BC8A6F22] align-top">
                                <td className="px-3 py-2 text-xs text-[#9a725c]">
                                  {new Date(proof.createdAt).toLocaleString("pt-BR", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </td>
                                <td className="max-w-[140px] px-3 py-2 text-[#7a5643] sm:max-w-none">
                                  {editingProofId === proof.id ? (
                                    <input
                                      className="w-full rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643]"
                                      value={editingProofProductName}
                                      onChange={(e) => setEditingProofProductName(e.target.value)}
                                    />
                                  ) : (
                                    <span className="line-clamp-2">{proof.productName}</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#7a5643]">
                                  {editingProofId === proof.id ? (
                                    <input
                                      className="w-24 rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643]"
                                      inputMode="decimal"
                                      value={editingProofSaleValue}
                                      onChange={(e) => setEditingProofSaleValue(e.target.value)}
                                    />
                                  ) : (
                                    `R$ ${Number(proof.saleValue ?? 0).toFixed(2)}`
                                  )}
                                </td>
                                <td className="hidden whitespace-nowrap px-3 py-2 text-[#7a5643] sm:table-cell">
                                  R$ {gross.toFixed(2)}
                                </td>
                                <td className="px-3 py-2">
                                  <a
                                    className="text-[#BC8A6F] underline"
                                    href={`/api/proofs/${proof.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Abrir
                                  </a>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {editingProofId === proof.id ? (
                                    <div className="mb-1 flex justify-end gap-1">
                                      <button
                                        type="button"
                                        className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3]"
                                        onClick={async () => {
                                          const formData = new FormData();
                                          formData.set("productName", editingProofProductName);
                                          formData.set(
                                            "saleValue",
                                            String(Number(editingProofSaleValue.replace(",", "."))),
                                          );
                                          if (editingProofFile) formData.set("file", editingProofFile);
                                          const response = await fetch(`/api/proofs/${proof.id}`, {
                                            method: "PATCH",
                                            body: formData,
                                          });
                                          const data = await response.json().catch(() => ({}));
                                          if (!response.ok) {
                                            setMemberManageError(String(data.error ?? "Falha ao editar comprovante."));
                                            return;
                                          }
                                          setEditingProofId(null);
                                          setEditingProofProductName("");
                                          setEditingProofSaleValue("");
                                          setEditingProofFile(null);
                                          await Promise.all([
                                            loadProofs(),
                                            loadGoalsUsers(),
                                            memberManageUsername ? loadMemberWallet(memberManageUsername) : Promise.resolve(),
                                          ]);
                                        }}
                                      >
                                        Salvar
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3]"
                                        onClick={() => {
                                          setEditingProofId(null);
                                          setEditingProofProductName("");
                                          setEditingProofSaleValue("");
                                          setEditingProofFile(null);
                                        }}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="mb-1 rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3]"
                                      onClick={() => {
                                        setEditingProofId(proof.id);
                                        setEditingProofProductName(proof.productName);
                                        setEditingProofSaleValue(String(Number(proof.saleValue ?? 0).toFixed(2)));
                                        setEditingProofFile(null);
                                      }}
                                    >
                                      Editar
                                    </button>
                                  )}
                                  {editingProofId === proof.id ? (
                                    <label className="mb-1 block text-right">
                                      <input
                                        type="file"
                                        accept="image/*,video/*"
                                        className="max-w-[180px] rounded-lg border border-[#BC8A6F66] px-2 py-1 text-[10px] text-[#7a5643]"
                                        onChange={(e) => setEditingProofFile(e.target.files?.[0] ?? null)}
                                      />
                                    </label>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleDeleteMemberProof(proof.id)}
                                    className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-800 hover:bg-red-200/80 disabled:opacity-50"
                                  >
                                    {busy ? "..." : "Apagar"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {activeSection === "usuarios" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Usuarios do site</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Crie logins, gere senha aleatoria, bloqueie com motivo ou encerre contas. Requer
                MongoDB conectado.
              </p>
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={handleCreateUser}>
                <input
                  className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643] sm:col-span-2"
                  placeholder="Novo usuario (login)"
                  value={newLoginUsername}
                  onChange={(e) => setNewLoginUsername(e.target.value)}
                  required
                />
                <label className="flex items-center gap-2 text-sm text-[#7a5643] sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={newLoginRandom}
                    onChange={(e) => setNewLoginRandom(e.target.checked)}
                  />
                  Gerar senha aleatoria (mostrada uma vez apos criar)
                </label>
                {!newLoginRandom ? (
                  <input
                    type="password"
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643] sm:col-span-2"
                    placeholder="Senha inicial"
                    value={newLoginPassword}
                    onChange={(e) => setNewLoginPassword(e.target.value)}
                    required={!newLoginRandom}
                  />
                ) : null}
                <button
                  type="submit"
                  className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95 sm:col-span-2"
                >
                  Criar usuario
                </button>
              </form>
              {adminUsersMessage ? (
                <div
                  className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
                    adminUsersMessageIsError
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  }`}
                  role="status"
                >
                  {adminUsersMessage}
                </div>
              ) : null}
              {passwordRevealError ? (
                <div
                  className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
                  role="status"
                >
                  {passwordRevealError}
                </div>
              ) : null}
              <div className="mt-6 overflow-hidden rounded-2xl border border-[#BC8A6F44]">
                <table className="w-full border-collapse bg-white text-left text-sm">
                  <thead className="bg-[#fff7f3]">
                    <tr>
                      <th className="px-3 py-2 text-[#7a5643]">Foto</th>
                      <th className="px-3 py-2 text-[#7a5643]">Usuario</th>
                      <th className="min-w-[180px] px-3 py-2 text-[#7a5643]">Situacao atual</th>
                      <th className="px-3 py-2 text-[#7a5643]">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      new Set([
                        ...rosterForSelects,
                        ...managedUsers.map((u) => u.username),
                      ]),
                    )
                      .filter((u) => u !== "bel")
                      .sort()
                      .map((uname) => {
                        const row = managedUsers.find((u) => u.username === uname);
                        const inDb = Boolean(row);
                        const deleted = Boolean(row?.deleted);
                        const blocked = Boolean(row?.blocked);
                        const rowBusy = userActionBusy === uname;
                        return (
                          <tr key={uname} className="border-t border-[#BC8A6F22] align-top">
                            <td className="px-3 py-2">
                              <UserAvatar username={uname} className="h-9 w-9" />
                            </td>
                            <td className="px-3 py-2 font-medium text-[#7a5643]">@{uname}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex flex-wrap items-center gap-1">
                                  {!inDb ? (
                                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-300/60">
                                      Ativo
                                    </span>
                                  ) : null}
                                  {inDb && deleted ? (
                                    <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800 ring-1 ring-slate-400/50">
                                      Conta encerrada
                                    </span>
                                  ) : null}
                                  {inDb && !deleted && blocked ? (
                                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 ring-1 ring-red-300/60">
                                      Bloqueado
                                    </span>
                                  ) : null}
                                  {inDb && !deleted && !blocked ? (
                                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-300/60">
                                      Ativo
                                    </span>
                                  ) : null}
                                </div>
                                {inDb && blocked && row?.blockedReason ? (
                                  <p className="text-xs leading-snug text-[#7a5643]">
                                    <span className="text-[#9a725c]">Motivo:</span>{" "}
                                    {row.blockedReason}
                                  </p>
                                ) : null}
                                {rowBusy ? (
                                  <p className="text-xs font-medium text-[#BC8A6F]">
                                    Atualizando...
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  className="rounded-lg bg-[#BC8A6F] px-2 py-1 text-xs text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={rowBusy || deleted || blocked}
                                  onClick={() => {
                                    setBlockReasonTargetUser(uname);
                                    setBlockReasonDraft("");
                                  }}
                                >
                                  Bloquear
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3] disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={rowBusy || deleted || !blocked}
                                  onClick={() => handleUnblockUser(uname)}
                                >
                                  Desbloquear
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-[#BC8A6F66] bg-white px-2 py-1 text-xs text-[#7a5643] hover:bg-[#fff7f3] disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={passwordRevealBusyUser === uname}
                                  onClick={() => void handleRevealPassword(uname)}
                                >
                                  {passwordRevealBusyUser === uname
                                    ? "Buscando..."
                                    : revealedPasswordByUser[uname]
                                      ? "Ocultar Senha"
                                      : "Ver Senha"}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-800 hover:bg-red-200/80 disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={rowBusy}
                                  onClick={() => handleRemoveUser(uname)}
                                >
                                  Apagar
                                </button>
                              </div>
                              {revealedPasswordByUser[uname] ? (
                                <div className="mt-2 rounded-lg border border-[#BC8A6F33] bg-[#fff7f3] px-2 py-1 text-xs text-[#7a5643]">
                                  <span className="text-[#9a725c]">Senha de @{uname}:</span>{" "}
                                  <strong className="break-all font-mono">
                                    {revealedPasswordByUser[uname]}
                                  </strong>
                                </div>
                              ) : null}
                              {blockReasonTargetUser === uname && !blocked && !deleted ? (
                                <div className="mt-2 w-full rounded-xl border border-[#BC8A6F33] bg-[#fff7f3] p-2">
                                  <p className="text-xs text-[#7a5643]">Motivo do bloqueio para @{uname}</p>
                                  <textarea
                                    className="mt-1 w-full rounded-lg border border-[#BC8A6F66] bg-white px-2 py-1 text-xs text-[#7a5643]"
                                    rows={2}
                                    placeholder="Digite o motivo do bloqueio..."
                                    value={blockReasonDraft}
                                    onChange={(e) => setBlockReasonDraft(e.target.value)}
                                  />
                                  <div className="mt-2 flex gap-1">
                                    <button
                                      type="button"
                                      disabled={rowBusy}
                                      onClick={() => {
                                        void handleBlockUser(uname, blockReasonDraft);
                                        setBlockReasonTargetUser(null);
                                        setBlockReasonDraft("");
                                      }}
                                      className="rounded-lg bg-[#BC8A6F] px-2 py-1 text-xs text-white hover:brightness-95 disabled:opacity-45"
                                    >
                                      Confirmar bloqueio
                                    </button>
                                    <button
                                      type="button"
                                      disabled={rowBusy}
                                      onClick={() => {
                                        setBlockReasonTargetUser(null);
                                        setBlockReasonDraft("");
                                      }}
                                      className="rounded-lg border border-[#BC8A6F66] px-2 py-1 text-xs text-[#7a5643] hover:bg-white disabled:opacity-45"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {activeSection === "saques" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Saques</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Revise solicitacoes de saque dos usuarios e configure o valor minimo permitido.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWithdrawalsTab("pendentes")}
                  className={`rounded-full px-4 py-2 text-sm ${withdrawalsTab === "pendentes" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Pendentes
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawalsTab("historico")}
                  className={`rounded-full px-4 py-2 text-sm ${withdrawalsTab === "historico" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Historico
                </button>
              </div>

              <form className="mt-5 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4" onSubmit={handleUpdateWithdrawMin}>
                <p className="text-sm font-medium text-[#7a5643]">Minimo de saque</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="w-40 rounded-xl border border-[#BC8A6F66] bg-white px-3 py-2 text-sm text-[#7a5643]"
                    inputMode="decimal"
                    value={withdrawMinInput}
                    onChange={(e) => setWithdrawMinInput(e.target.value)}
                    placeholder="200.00"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#BC8A6F] px-3 py-2 text-xs text-white hover:brightness-95"
                  >
                    Salvar minimo
                  </button>
                </div>
              </form>

              {withdrawalsMessage ? (
                <p className="mt-3 text-sm text-[#7a5643]">{withdrawalsMessage}</p>
              ) : null}

              <div className="mt-5 overflow-hidden rounded-2xl border border-[#BC8A6F44]">
                <table className="w-full border-collapse bg-white text-left text-sm">
                  <thead className="bg-[#fff7f3]">
                    <tr>
                      <th className="px-3 py-2 text-[#7a5643]">Usuario</th>
                      <th className="px-3 py-2 text-[#7a5643]">Valor</th>
                      <th className="px-3 py-2 text-[#7a5643]">Status</th>
                      <th className="px-3 py-2 text-[#7a5643]">Data</th>
                      <th className="px-3 py-2 text-[#7a5643]">Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWithdrawals.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-[#9a725c]" colSpan={5}>
                          {withdrawalsTab === "pendentes"
                            ? "Nenhuma solicitacao pendente."
                            : "Nenhum saque no historico."}
                        </td>
                      </tr>
                    ) : (
                      visibleWithdrawals.map((item) => {
                        const busy = withdrawActionBusyId === item.id;
                        const isPending = item.status === "pending";
                        return (
                          <tr key={item.id} className="border-t border-[#BC8A6F22] align-top">
                            <td className="px-3 py-2 font-medium text-[#7a5643]">@{item.username}</td>
                            <td className="px-3 py-2 text-[#7a5643]">R$ {Number(item.amount ?? 0).toFixed(2)}</td>
                            <td className="px-3 py-2 text-[#7a5643]">
                              {item.status === "approved"
                                ? "Aprovado"
                                : item.status === "rejected"
                                  ? "Recusado"
                                  : "Pendente"}
                              {item.status === "rejected" && item.rejectionReason ? (
                                <p className="mt-1 text-xs text-[#9a725c]">Motivo: {item.rejectionReason}</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-xs text-[#9a725c]">
                              {new Date(item.requestedAt).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  disabled={!isPending || busy}
                                  onClick={() => void handleReviewWithdraw(item.id, "approve")}
                                  className="rounded-lg bg-emerald-100 px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-200/80 disabled:opacity-45"
                                >
                                  Aprovar
                                </button>
                                <button
                                  type="button"
                                  disabled={!isPending || busy}
                                  onClick={() => {
                                    const reason = prompt("Motivo da recusa:");
                                    if (!reason) return;
                                    void handleReviewWithdraw(item.id, "reject", reason);
                                  }}
                                  className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-900 hover:bg-red-200/80 disabled:opacity-45"
                                >
                                  Recusar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {activeSection === "indicacoes" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Indicacoes</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Veja quem indicou quem e ajuste o percentual de bonus que cada anfitriao
                ganha em cima das vendas dos convidados.
              </p>

              <form
                className="mt-5 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4"
                onSubmit={handleSaveReferralsBonusPercent}
              >
                <p className="text-sm font-medium text-[#7a5643]">
                  Percentual de bonus por indicacao (%)
                </p>
                <p className="mt-1 text-xs text-[#9a725c]">
                  Valor padrao: {Number(referralsAdminData?.defaultBonusPercent ?? 4).toFixed(2)}%.
                  Aplica-se a todas as indicacoes ativas e futuras.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="w-32 rounded-xl border border-[#BC8A6F66] bg-white px-3 py-2 text-sm text-[#7a5643]"
                    inputMode="decimal"
                    value={referralsBonusInput}
                    onChange={(event) => setReferralsBonusInput(event.target.value)}
                    placeholder="4"
                  />
                  <button
                    type="submit"
                    disabled={referralsAdminBusy}
                    className="rounded-xl bg-[#BC8A6F] px-3 py-2 text-xs text-white hover:brightness-95 disabled:opacity-60"
                  >
                    {referralsAdminBusy ? "Salvando..." : "Salvar percentual"}
                  </button>
                  <span className="text-xs text-[#9a725c]">
                    Atual:{" "}
                    <strong className="text-[#7a5643]">
                      {Number(referralsAdminData?.bonusPercent ?? 4).toFixed(2)}%
                    </strong>
                  </span>
                </div>
                {referralsAdminMessage ? (
                  <p className="mt-3 text-sm text-[#7a5643]">{referralsAdminMessage}</p>
                ) : null}
              </form>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Total de vinculos</p>
                  <p className="text-2xl text-[#7a5643]">
                    {referralsAdminData?.links.length ?? 0}
                  </p>
                </article>
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Anfitrioes (quem indicou)</p>
                  <p className="text-2xl text-[#7a5643]">
                    {referralsAdminData?.groupedByInviter.length ?? 0}
                  </p>
                </article>
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Bonus total acumulado</p>
                  <p className="text-2xl text-[#7a5643]">
                    R${" "}
                    {(referralsAdminData?.groupedByInviter.reduce(
                      (acc, item) => acc + item.referralBonus,
                      0,
                    ) ?? 0).toFixed(2)}
                  </p>
                </article>
              </div>

              <div className="mt-5 grid gap-3">
                <h4 className="text-base font-medium text-[#7a5643]">
                  Quem indicou quem
                </h4>
                {(referralsAdminData?.groupedByInviter ?? []).length === 0 ? (
                  <p className="text-sm text-[#9a725c]">
                    Nenhuma indicacao registrada ainda.
                  </p>
                ) : (
                  (referralsAdminData?.groupedByInviter ?? []).map((group) => (
                    <article
                      key={`inviter-${group.inviterUsername}`}
                      className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            username={group.inviterUsername}
                            className="h-10 w-10"
                          />
                          <div>
                            <p className="text-sm font-semibold text-[#7a5643]">
                              @{group.inviterUsername}
                            </p>
                            <p className="text-xs text-[#9a725c]">
                              Convidou {group.invitees.length} pessoa(s)
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[#9a725c]">Bonus acumulado</p>
                          <p className="text-base font-semibold text-[#7a5643]">
                            R$ {group.referralBonus.toFixed(2)}
                          </p>
                          <p className="text-xs text-[#9a725c]">
                            de R$ {group.totalSold.toFixed(2)} vendidos
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {group.invitees.map((invitee) => (
                          <div
                            key={`invitee-${group.inviterUsername}-${invitee.inviteeUsername}-${invitee.linkedAt}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#BC8A6F33] bg-white px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <UserAvatar
                                username={invitee.inviteeUsername}
                                className="h-8 w-8"
                              />
                              <div>
                                <p className="text-sm text-[#7a5643]">
                                  @{invitee.inviteeUsername}
                                </p>
                                <p className="text-xs text-[#9a725c]">
                                  Codigo: {invitee.codeUsed} ·{" "}
                                  {new Date(invitee.linkedAt).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-[#9a725c]">
                                Vendeu R$ {invitee.totalSold.toFixed(2)}
                              </p>
                              <p className="text-xs font-medium text-[#7a5643]">
                                Bonus: R$ {invitee.referralBonus.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : null}

          {activeSection === "configuracoes" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Configuracoes</h3>
              <div className="mt-4 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                <p className="text-sm text-[#9a725c]">
                  Espaco reservado para opcoes futuras como cadastro de novos logins,
                  permissoes e metas de vendas.
                </p>
              </div>
            </>
          ) : null}

          {activeSection === "gerenciar-multas" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Gerenciar Multas</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Escolha o usuario, o motivo e a duracao da advertencia.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFineAdminTab("aplicar");
                    void loadFines();
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs ${fineAdminTab === "aplicar" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFineAdminTab("multas");
                    void loadAllFines();
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs ${fineAdminTab === "multas" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Multas
                </button>
              </div>
              {fineAdminTab === "aplicar" ? (
              <form className="mt-6 grid gap-3" onSubmit={handleApplyFine}>
                <select
                  className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                  value={fineUser}
                  onChange={(event) => setFineUser(event.target.value)}
                >
                  {rosterForSelects.map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                  placeholder="Motivo da multa"
                  value={fineReason}
                  onChange={(event) => setFineReason(event.target.value)}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    value={fineDurationType}
                    onChange={(event) => setFineDurationType(event.target.value)}
                  >
                    <option value="eterno">Eterno</option>
                    <option value="dias">Dias</option>
                    <option value="segundos">Segundos</option>
                  </select>
                  <input
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    placeholder="Quantidade"
                    value={fineDurationValue}
                    onChange={(event) => setFineDurationValue(event.target.value)}
                    disabled={fineDurationType === "eterno"}
                    required={fineDurationType !== "eterno"}
                  />
                </div>
                <label className="grid gap-1 text-sm text-[#7a5643]">
                  <span className="font-medium">Desconto extra no valor real da pessoa (%)</span>
                  <span className="text-xs font-normal leading-relaxed text-[#9a725c]">
                    Este campo e sempre em <strong className="text-[#7a5643]">porcentagem (%)</strong>
                    . Digite <strong className="text-[#7a5643]">0</strong> quando nao quiser desconto
                    por % (multa so por tempo/motivo). Ex.: <strong className="text-[#7a5643]">10</strong>{" "}
                    = reduz 10% do valor real dela enquanto a multa estiver valendo.
                  </span>
                  <input
                    className="mt-1 rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    inputMode="decimal"
                    placeholder="0 = sem % extra"
                    value={finePenaltyPercent}
                    onChange={(event) => setFinePenaltyPercent(event.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95"
                >
                  Aplicar multa (usa o % acima; 0 = sem desconto percentual)
                </button>
                {fineMessage ? <p className="text-sm text-[#7a5643]">{fineMessage}</p> : null}
              </form>
              ) : null}

              <div className="mt-4 grid gap-3">
                {fines.map((fine) => (
                  <article key={fine.id} className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                    <p className="text-sm text-[#7a5643]">Usuario: {fine.username}</p>
                    <p className="text-sm text-[#7a5643]">Motivo: {fine.reason}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select
                        className="rounded-lg border border-[#BC8A6F66] bg-white px-2 py-1 text-xs text-[#7a5643]"
                        value={fineEditById[fine.id]?.durationType ?? fine.durationType}
                        onChange={(e) =>
                          setFineEditById((prev) => ({
                            ...prev,
                            [fine.id]: {
                              durationType: e.target.value,
                              durationValue:
                                prev[fine.id]?.durationValue ?? String(fine.durationValue ?? 1),
                              penaltyPercent:
                                prev[fine.id]?.penaltyPercent ??
                                String(Number(fine.penaltyPercent ?? 0).toFixed(2)),
                            },
                          }))
                        }
                      >
                        <option value="eterno">Eterno</option>
                        <option value="dias">Dias</option>
                        <option value="segundos">Segundos</option>
                      </select>
                      <input
                        className="rounded-lg border border-[#BC8A6F66] bg-white px-2 py-1 text-xs text-[#7a5643]"
                        inputMode="numeric"
                        value={fineEditById[fine.id]?.durationValue ?? String(fine.durationValue ?? 1)}
                        onChange={(e) =>
                          setFineEditById((prev) => ({
                            ...prev,
                            [fine.id]: {
                              durationType: prev[fine.id]?.durationType ?? fine.durationType,
                              durationValue: e.target.value,
                              penaltyPercent:
                                prev[fine.id]?.penaltyPercent ??
                                String(Number(fine.penaltyPercent ?? 0).toFixed(2)),
                            },
                          }))
                        }
                      />
                      <input
                        className="rounded-lg border border-[#BC8A6F66] bg-white px-2 py-1 text-xs text-[#7a5643]"
                        inputMode="decimal"
                        value={fineEditById[fine.id]?.penaltyPercent ?? String(Number(fine.penaltyPercent ?? 0).toFixed(2))}
                        onChange={(e) =>
                          setFineEditById((prev) => ({
                            ...prev,
                            [fine.id]: {
                              durationType: prev[fine.id]?.durationType ?? fine.durationType,
                              durationValue:
                                prev[fine.id]?.durationValue ?? String(fine.durationValue ?? 1),
                              penaltyPercent: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <p className="text-xs text-[#9a725c]">
                      Termino: {fine.expiresAt ? new Date(fine.expiresAt).toLocaleString("pt-BR") : "Sem termino"}
                    </p>
                    <div className="mt-2 flex gap-1">
                      <button
                        onClick={() => void handleUpdateFine(fine.id)}
                        className="rounded-lg border border-[#BC8A6F66] px-3 py-1 text-xs text-[#7a5643] hover:bg-white"
                      >
                        Salvar edicao
                      </button>
                      <button
                        onClick={() => handleRemoveFine(fine.id, fine.username)}
                        className="rounded-lg bg-[#BC8A6F] px-3 py-1 text-xs text-white hover:brightness-95"
                      >
                        Remover multa
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {activeSection === "hots" ? (
            <>
              <h3 className="text-2xl text-[#7a5643]">Hots</h3>
              <p className="mt-2 text-sm text-[#9a725c]">
                Gerencie liberacoes e credenciais dos perfis loira e morena.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setHotsTab("liberar")}
                  className={`rounded-full px-4 py-2 text-sm ${hotsTab === "liberar" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Liberar Hots
                </button>
                <button
                  type="button"
                  onClick={() => setHotsTab("modificar")}
                  className={`rounded-full px-4 py-2 text-sm ${hotsTab === "modificar" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Modificar Hots
                </button>
              </div>

              {hotsTab === "liberar" ? (
                <div className="mt-6 grid gap-4">
                  <div>
                    <p className="mb-2 text-sm font-medium text-[#7a5643]">Quem recebe o acesso</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {rosterForSelects.map((user) => (
                        <button
                          key={user}
                          type="button"
                          onClick={() => setHotsUser(user)}
                          className={`flex min-h-[3.25rem] items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition hover:brightness-[0.98] ${
                            hotsUser === user
                              ? "border-[#BC8A6F] bg-[#fff7f3] text-[#7a5643] ring-2 ring-[#BC8A6F55]"
                              : "border-[#BC8A6F44] bg-white text-[#7a5643]"
                          }`}
                        >
                          <UserAvatar username={user} className="h-9 w-9 shrink-0" />
                          <span className="truncate font-medium">@{user}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <form className="grid gap-3 rounded-xl border border-[#BC8A6F44] bg-white p-3" onSubmit={handleReleaseHotsAccess}>
                    <p className="text-sm font-medium text-[#7a5643]">Liberar perfil completo</p>
                    <select
                      className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                      value={hotsProfile}
                      onChange={(event) =>
                        setHotsProfile(event.target.value === "morena" ? "morena" : "loira")
                      }
                    >
                      <option value="loira">Perfil loira</option>
                      <option value="morena">Perfil morena</option>
                    </select>
                    <button className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95">
                      Liberar perfil para @{hotsUser}
                    </button>
                  </form>
                  <form className="grid gap-3 rounded-xl border border-[#BC8A6F44] bg-white p-3" onSubmit={handleReleaseHotsSocialAccess}>
                    <p className="text-sm font-medium text-[#7a5643]">Liberar rede social especifica</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                        value={hotsProfile}
                        onChange={(event) =>
                          setHotsProfile(event.target.value === "morena" ? "morena" : "loira")
                        }
                      >
                        <option value="loira">Perfil loira</option>
                        <option value="morena">Perfil morena</option>
                      </select>
                      <select
                        className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                        value={hotsSocial}
                        onChange={(event) =>
                          setHotsSocial(
                            event.target.value as "twitter" | "facebook" | "tiktok" | "instagram" | "discord",
                          )
                        }
                      >
                        {Object.entries(HOTS_SOCIAL_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95">
                      Liberar rede para @{hotsUser}
                    </button>
                  </form>
                  {hotsMessage ? <p className="text-sm text-[#7a5643]">{hotsMessage}</p> : null}
                </div>
              ) : null}

              {hotsTab === "modificar" ? (
                <form className="mt-6 grid gap-4" onSubmit={handleSaveHotsCredentials}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setHotsConfigProfile("loira")}
                      className={`rounded-xl border px-4 py-3 text-sm ${hotsConfigProfile === "loira" ? "border-[#BC8A6F] bg-[#fff7f3] text-[#7a5643]" : "border-[#BC8A6F44] bg-white text-[#7a5643]"}`}
                    >
                      Perfil loira
                    </button>
                    <button
                      type="button"
                      onClick={() => setHotsConfigProfile("morena")}
                      className={`rounded-xl border px-4 py-3 text-sm ${hotsConfigProfile === "morena" ? "border-[#BC8A6F] bg-[#fff7f3] text-[#7a5643]" : "border-[#BC8A6F44] bg-white text-[#7a5643]"}`}
                    >
                      Perfil morena
                    </button>
                  </div>
                  <input
                    value={hotsLoginInput}
                    onChange={(event) => setHotsLoginInput(event.target.value)}
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    placeholder="Login do perfil selecionado"
                    required
                  />
                  <input
                    value={hotsPasswordInput}
                    onChange={(event) => setHotsPasswordInput(event.target.value)}
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    placeholder="Senha do perfil selecionado"
                    required
                  />
                  <input
                    value={hotsImageUrlInput}
                    onChange={(event) => setHotsImageUrlInput(event.target.value)}
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    placeholder="URL da foto do perfil selecionado"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                      value={hotsConfigSocial}
                      onChange={(event) =>
                        setHotsConfigSocial(
                          event.target.value as "twitter" | "facebook" | "tiktok" | "instagram" | "discord",
                        )
                      }
                    >
                      {Object.entries(HOTS_SOCIAL_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={hotsSocialUrlInput}
                      onChange={(event) => setHotsSocialUrlInput(event.target.value)}
                      className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                      placeholder="URL da rede social selecionada"
                    />
                  </div>
                  <input
                    value={hotsSocialLoginInput}
                    onChange={(event) => setHotsSocialLoginInput(event.target.value)}
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    placeholder="Login da rede social selecionada"
                  />
                  <input
                    value={hotsSocialPasswordInput}
                    onChange={(event) => setHotsSocialPasswordInput(event.target.value)}
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    placeholder="Senha da rede social selecionada"
                  />
                  <button className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95">
                    Salvar credenciais de {hotsConfigProfile}
                  </button>
                  {hotsMessage ? <p className="text-sm text-[#7a5643]">{hotsMessage}</p> : null}
                </form>
              ) : null}

              <div className="mt-5 grid gap-3">
                {hotsAccessList.map((item) => (
                  <article
                    key={`${item.username}-${item.profileKey}-${item.scope}-${item.socialKey ?? "none"}`}
                    className="flex items-start gap-3 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4"
                  >
                    <UserAvatar username={item.username} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#7a5643]">
                        @{item.username} — perfil {item.profileKey}
                        {item.scope === "social" && item.socialKey ? ` (${HOTS_SOCIAL_LABELS[item.socialKey]})` : ""}
                      </p>
                      <p className="text-xs text-[#9a725c]">
                        Atualizado em {new Date(item.updatedAt).toLocaleString("pt-BR")} por{" "}
                        {item.updatedBy}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          void handleRemoveHotsAccess(
                            item.username,
                            item.profileKey,
                            item.scope,
                            item.socialKey,
                          )
                        }
                        className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-800 hover:bg-red-100"
                      >
                        Remover acesso
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
