"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";

const PROOF_COOLDOWN_MS = 10_000;

type Proof = {
  id: string;
  sellerName: string;
  productName: string;
  uploader: string;
  saleValue: number;
  originalName: string;
  mimeType: string;
  createdAt: string;
};

type RankingRow = {
  username: string;
  vendas: number;
  valorTotal: number;
};

type RankingWindows = {
  d1: RankingRow[];
  d7: RankingRow[];
  d14: RankingRow[];
  d31: RankingRow[];
};

type RankingPrizes = {
  d1: number;
  d7: number;
  d14: number;
  d31: number;
};

type MembrosPainelClientProps = {
  username: string;
  initialProofs: Proof[];
};

type Fine = {
  id: string;
  username: string;
  reason: string;
  durationType: string;
  durationValue: number | null;
  penaltyPercent: number | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
};

type GoalItem = {
  username: string;
  total: number;
  target: number;
  progress: number;
  streakDays: number;
  bonusActive: boolean;
  commissionPercent: number;
};

type GoalsResponse = {
  dailyTarget: number;
  current: GoalItem;
  users: GoalItem[];
};

type WithdrawalEntry = {
  id: string;
  username: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
};

type WithdrawalsResponse = {
  minWithdraw: number;
  wallet: {
    commissionPercent: number;
    approvedTotal: number;
    grossReal: number;
    referralBonusAmount?: number;
    available: number;
  };
  withdrawals: WithdrawalEntry[];
};

type ReferralOverview = {
  myCode: string;
  bonusPercent: number;
  myInviter: { inviterUsername: string; codeUsed: string; linkedAt: string } | null;
  invitees: {
    inviteeUsername: string;
    codeUsed: string;
    linkedAt: string;
    totalSold: number;
    referralBonus: number;
  }[];
  referralBonusTotal: number;
};

type UserHotsAccessItem = {
  username: string;
  profileKey: "loira" | "morena";
  updatedAt: string;
  updatedBy: string;
  credentials?: {
    login: string;
    password: string;
  } | null;
  profileImageUrl?: string | null;
  grantedSocials?: ("twitter" | "facebook" | "tiktok" | "instagram" | "discord")[];
  socialCredentialsByKey?: Partial<
    Record<
      "twitter" | "facebook" | "tiktok" | "instagram" | "discord",
      { login: string; password: string; url?: string }
    >
  >;
};

type PainelSection =
  | "dashboard"
  | "comprovantes"
  | "tabela"
  | "explicacoes"
  | "perfil"
  | "indicacao"
  | "multas"
  | "metas"
  | "hots";

const HOTS_PROFILE_LINKS: Record<"loira" | "morena", string> = {
  loira:
    "https://cdn.discordapp.com/attachments/1485502262779580447/1497238627154133134/image.png?ex=69eccba2&is=69eb7a22&hm=1bc042391dcea349d376ddc7e8839f78786cd33d5f003cd650034a7e078593f6&",
  morena:
    "https://cdn.discordapp.com/attachments/1485502262779580447/1497238647383130162/image.png?ex=69eccba6&is=69eb7a26&hm=4d086225a877014aadd1ab4f09d91c74518369342e6228dc261b22d21ef40cfe&tos-escuros-morenos-cabelos-do-143938844.jpg",
};

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

function SocialIcon({
  socialKey,
}: {
  socialKey: "twitter" | "facebook" | "tiktok" | "instagram" | "discord";
}) {
  const commonClass = "h-5 w-5 text-[#7a5643]";
  if (socialKey === "twitter") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={commonClass} aria-hidden="true">
        <path d="M18.9 2H22l-6.77 7.73L23.2 22h-6.26l-4.9-6.95L5.96 22H2.8l7.24-8.27L.8 2h6.42l4.43 6.33L18.9 2Z" />
      </svg>
    );
  }
  if (socialKey === "facebook") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={commonClass} aria-hidden="true">
        <path d="M13.5 8V6.2c0-.7.5-1.2 1.2-1.2H17V2h-2.7C11.4 2 9.5 3.9 9.5 6.8V8H7v3h2.5v11h4V11H17l.5-3h-4Z" />
      </svg>
    );
  }
  if (socialKey === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={commonClass} aria-hidden="true">
        <path d="M14.5 3h3c.2 1.8 1.4 3.3 3 4v3.2c-1.5-.1-2.9-.6-4-1.4v6.1c0 3.8-3.1 6.9-6.9 6.9S2.7 18.7 2.7 14.9 5.8 8 9.6 8c.3 0 .7 0 1 .1v3.3c-.3-.1-.6-.1-1-.1-2 0-3.6 1.6-3.6 3.6s1.6 3.6 3.6 3.6 3.6-1.6 3.6-3.6V3Z" />
      </svg>
    );
  }
  if (socialKey === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={commonClass} aria-hidden="true">
        <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm10.8 1.4a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={commonClass} aria-hidden="true">
      <path d="M20 5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v10.5A4.5 4.5 0 0 0 8.5 20H16a4 4 0 0 0 4-4V5Zm-9.6 11.2c-1.7 0-3.1-1.4-3.1-3.1S8.7 10 10.4 10c.8 0 1.6.3 2.2.9l-1.1 1.1a1.5 1.5 0 1 0 1.1 1.4V6.5h2V13a4 4 0 0 1-4.2 3.2Z" />
    </svg>
  );
}

const rankingLabels: Record<keyof RankingWindows, string> = {
  d1: "Ultimas 24 horas",
  d7: "Ultimos 7 dias",
  d14: "Ultimos 14 dias",
  d31: "Ultimos 31 dias",
};

function isFineActiveClient(fine: Fine): boolean {
  if (fine.durationType === "eterno") return true;
  if (!fine.expiresAt) return true;
  return new Date(fine.expiresAt) > new Date();
}

function activePenaltyPercentFromFines(finesList: Fine[]): number {
  let sum = 0;
  for (const fine of finesList) {
    if (!isFineActiveClient(fine)) continue;
    sum += Number(fine.penaltyPercent ?? 0);
  }
  return Math.min(100, Math.max(0, sum));
}

function podiumRowClass(index: number) {
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

export default function MembrosPainelClient({
  username,
  initialProofs,
}: MembrosPainelClientProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<PainelSection>("dashboard");
  const [proofs, setProofs] = useState(initialProofs);
  const [productName, setProductName] = useState("");
  const [saleValue, setSaleValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState<RankingWindows | null>(null);
  const [rankingPrizes, setRankingPrizes] = useState<RankingPrizes>({
    d1: 0,
    d7: 0,
    d14: 0,
    d31: 150,
  });
  const [rankingTab, setRankingTab] = useState<keyof RankingWindows>("d31");
  const [dashboardTab, setDashboardTab] = useState<keyof RankingWindows>("d31");
  const [dashboardChartMode, setDashboardChartMode] = useState<"real" | "total">("real");
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);
  const [fines, setFines] = useState<Fine[]>([]);
  const [goals, setGoals] = useState<GoalsResponse | null>(null);
  const [withdrawalsData, setWithdrawalsData] = useState<WithdrawalsResponse | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [referralData, setReferralData] = useState<ReferralOverview | null>(null);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [referralBusy, setReferralBusy] = useState(false);
  const [explanationTopic, setExplanationTopic] = useState<"site" | "vendas">("site");
  const [hotsAccess, setHotsAccess] = useState<UserHotsAccessItem[]>([]);
  const [openedHotProfile, setOpenedHotProfile] = useState<"loira" | "morena" | null>(null);
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

  async function loadRanking() {
    const response = await fetch("/api/ranking");
    if (!response.ok) return;
    const data = (await response.json()) as RankingWindows & {
      storage?: string;
      warning?: string | null;
      prizes?: Partial<RankingPrizes>;
    };
    const { d1, d7, d14, d31 } = data;
    setRanking({ d1, d7, d14, d31 });
    setRankingPrizes({
      d1: Number(data.prizes?.d1 ?? 0),
      d7: Number(data.prizes?.d7 ?? 0),
      d14: Number(data.prizes?.d14 ?? 0),
      d31: Number(data.prizes?.d31 ?? 150),
    });
  }

  async function loadGoals() {
    const response = await fetch("/api/goals");
    if (!response.ok) return;
    setGoals((await response.json()) as GoalsResponse);
  }

  async function loadWithdrawals() {
    const response = await fetch("/api/withdrawals");
    if (!response.ok) return;
    setWithdrawalsData((await response.json()) as WithdrawalsResponse);
  }

  async function loadReferrals() {
    const response = await fetch("/api/referrals");
    if (!response.ok) return;
    setReferralData((await response.json()) as ReferralOverview);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega ranking ao montar
    void loadRanking();
  }, []);

  useEffect(() => {
    async function loadExtraData() {
      const [finesRes, goalsRes] = await Promise.all([fetch("/api/fines"), fetch("/api/goals")]);
      if (finesRes.ok) {
        setFines((await finesRes.json()) as Fine[]);
      }
      if (goalsRes.ok) {
        setGoals((await goalsRes.json()) as GoalsResponse);
      }
      const accessRes = await fetch("/api/hots-access");
      if (accessRes.ok) {
        const accessData = (await accessRes.json()) as UserHotsAccessItem[] | UserHotsAccessItem | null;
        setHotsAccess(
          Array.isArray(accessData) ? accessData : accessData ? [accessData] : [],
        );
      }
      await Promise.all([loadWithdrawals(), loadReferrals()]);
    }
    loadExtraData();
  }, []);

  useEffect(() => {
    if (activeSection !== "tabela" && activeSection !== "metas" && activeSection !== "dashboard") {
      return;
    }
    const interval = setInterval(() => {
      void loadRanking();
      void loadGoals();
      void loadMyProofs();
      void loadWithdrawals();
      void loadReferrals();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeSection]);

  async function loadMyProofs() {
    const response = await fetch("/api/proofs");
    if (!response.ok) return;
    const data = await response.json();
    setProofs(data);
  }

  function handleDashboardModeChange(mode: "real" | "total") {
    setHoveredChartIndex(null);
    setDashboardChartMode(mode);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || proofCooldownRemaining > 0) return;
    if (!productName.trim()) {
      setMessage("Informe o nome do produto vendido.");
      return;
    }
    if (!saleValue.trim()) {
      setMessage("Informe o valor da venda em reais.");
      return;
    }
    if (!file) {
      setMessage("Selecione uma foto ou video de comprovante.");
      return;
    }

    setLoading(true);
    setMessage("");

    const formData = new FormData();
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
      penaltyPercentApplied?: number;
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

    const penaltyPercentApplied = Number(data?.penaltyPercentApplied ?? 0);
    setMessage(
      penaltyPercentApplied > 0
        ? `Comprovante enviado! Multa aplicada: ${penaltyPercentApplied.toFixed(2)}%.`
        : "Comprovante enviado! Seu rank sera atualizado.",
    );
    setProductName("");
    setSaleValue("");
    setFile(null);
    startProofCooldown(Number(data?.cooldownMs ?? PROOF_COOLDOWN_MS));
    await loadMyProofs();
    await Promise.all([loadRanking(), loadGoals(), loadWithdrawals()]);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function handleAvatarSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!avatarFile) {
      setMessage("Selecione uma imagem para foto de perfil.");
      return;
    }
    const formData = new FormData();
    formData.set("avatar", avatarFile);
    const response = await fetch("/api/profile", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Falha ao atualizar foto.");
      return;
    }
    setAvatarFile(null);
    setMessage("Foto de perfil atualizada com sucesso.");
  }

  async function handleRequestWithdraw() {
    setWithdrawBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/withdrawals", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(String(data.error ?? "Falha ao solicitar saque."));
        return;
      }
      setMessage("Solicitacao de saque enviada com sucesso.");
      await loadWithdrawals();
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function handleApplyReferralCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!referralCodeInput.trim()) {
      setMessage("Informe um codigo de indicacao.");
      return;
    }
    setReferralBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: referralCodeInput.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(String(data.error ?? "Falha ao aplicar codigo."));
        return;
      }
      setReferralCodeInput("");
      setMessage("Codigo de indicacao aplicado com sucesso.");
      await Promise.all([loadReferrals(), loadWithdrawals()]);
    } finally {
      setReferralBusy(false);
    }
  }

  const rows = ranking?.[rankingTab] ?? [];
  const activePersonalPenaltyPercent = activePenaltyPercentFromFines(fines);
  const commissionPercent = goals?.current.commissionPercent ?? 35;
  const isDailyGoalCompleted = (goals?.current.progress ?? 0) >= 100;
  const realNetMultiplier = (commissionPercent / 100) * (1 - activePersonalPenaltyPercent / 100);

  const dashboardDaysMap: Record<keyof RankingWindows, number> = {
    d1: 1,
    d7: 7,
    d14: 14,
    d31: 31,
  };
  const nowMs = Date.now();
  const filteredProofs = proofs.filter((proof) => {
    const ageMs = nowMs - new Date(proof.createdAt).getTime();
    return ageMs <= dashboardDaysMap[dashboardTab] * 24 * 60 * 60 * 1000;
  });
  const dashboardTotalSold = filteredProofs.reduce(
    (acc, proof) => acc + Number(proof.saleValue ?? 0),
    0,
  );
  const dashboardMyShare = dashboardTotalSold * realNetMultiplier;
  const availableToWithdraw = Number(withdrawalsData?.wallet.available ?? 0);
  const minWithdraw = Number(withdrawalsData?.minWithdraw ?? 200);
  const hasPendingWithdraw = (withdrawalsData?.withdrawals ?? []).some(
    (item) => item.status === "pending",
  );
  const canRequestWithdraw = availableToWithdraw >= minWithdraw && !hasPendingWithdraw;
  const dashboardVisibleReal = Math.max(0, availableToWithdraw);
  const dashboardProofsCount = filteredProofs.length;
  const dashboardAverageTicket =
    dashboardProofsCount > 0 ? dashboardTotalSold / dashboardProofsCount : 0;
  const chartPointsCount = 12;
  const selectedDays = dashboardDaysMap[dashboardTab];
  const chartStepDays = Math.max(1, Math.ceil(selectedDays / chartPointsCount));
  const chartSeries = Array.from({ length: chartPointsCount }, (_, index) => {
    const endTime = nowMs - (chartPointsCount - 1 - index) * chartStepDays * 24 * 60 * 60 * 1000;
    const startTime = endTime - chartStepDays * 24 * 60 * 60 * 1000;
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
  const realSeries = chartSeries.map((item) => ({
    ...item,
    value: Number((item.value * realNetMultiplier).toFixed(2)),
  }));
  const activeSeries = dashboardChartMode === "real" ? realSeries : chartSeries;
  const chartMax = Math.max(...activeSeries.map((item) => item.value), 1);
  const svgWidth = 900;
  const svgHeight = 260;
  const chartPaddingX = 30;
  const chartPaddingY = 28;
  const plotWidth = svgWidth - chartPaddingX * 2;
  const plotHeight = svgHeight - chartPaddingY * 2;
  const strokePath = activeSeries
    .map((point, index) => {
      const x =
        chartPaddingX + (index / Math.max(activeSeries.length - 1, 1)) * plotWidth;
      const y = chartPaddingY + (1 - point.value / chartMax) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPath = `${strokePath} L ${(chartPaddingX + plotWidth).toFixed(2)} ${(chartPaddingY + plotHeight).toFixed(2)} L ${chartPaddingX.toFixed(2)} ${(chartPaddingY + plotHeight).toFixed(2)} Z`;
  const hoveredPoint =
    hoveredChartIndex === null ? null : activeSeries[Math.max(0, Math.min(hoveredChartIndex, activeSeries.length - 1))];
  const loiraAccess = hotsAccess.find((item) => item.profileKey === "loira") ?? null;
  const morenaAccess = hotsAccess.find((item) => item.profileKey === "morena") ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#F6E1E1] via-[#f8ece7] to-[#f3dfd5] p-6">
      <div className="mx-auto my-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl border border-[#BC8A6F66] bg-white/85 p-4 shadow-2xl shadow-[#BC8A6F35] backdrop-blur">
          <div className="relative">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-[#BC8A6F55] bg-[#fff7f3] px-3 py-2 text-left"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
            >
              <UserAvatar username={username} className="h-11 w-11 shrink-0" />
              <div className="min-w-0 flex-1">
              <p className="text-xs text-[#9a725c]">Logado como</p>
              <p className="text-lg text-[#7a5643]">{username}</p>
              <p className="mt-1 text-xs text-[#9a725c]">
                Clique no nome para abrir Perfil e trocar a foto.
              </p>
              </div>
            </button>
            {profileMenuOpen ? (
              <div className="mt-2 rounded-xl border border-[#BC8A6F44] bg-white p-2">
                <button
                  type="button"
                  className="w-full rounded-lg bg-[#fff7f3] px-3 py-2 text-left text-sm text-[#7a5643]"
                  onClick={() => {
                    setActiveSection("perfil");
                    setProfileMenuOpen(false);
                  }}
                >
                  Perfil
                </button>
                <button
                  type="button"
                  className="mt-1 w-full rounded-lg bg-[#fff7f3] px-3 py-2 text-left text-sm text-[#7a5643]"
                  onClick={() => {
                    setActiveSection("indicacao");
                    setProfileMenuOpen(false);
                  }}
                >
                  Indicacao
                </button>
              </div>
            ) : null}
          </div>
          <nav className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("dashboard")}
              className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "dashboard" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("comprovantes")}
              className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "comprovantes" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
            >
              Comprovantes
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("tabela")}
              className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "tabela" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
            >
              Tabela
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("explicacoes")}
              className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "explicacoes" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
            >
              Explicacoes
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("multas")}
              className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "multas" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
            >
              Multas
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("metas")}
              className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "metas" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
            >
              Metas
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("hots")}
              className={`sidebar-nav-stable rounded-xl px-3 py-2 text-left text-sm hover:brightness-[0.98] ${activeSection === "hots" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
            >
              Hots
            </button>
          </nav>
          <button
            type="button"
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
              <h2 className="text-2xl text-[#7a5643]">Dashboard</h2>
              <p className="mt-2 text-sm text-[#9a725c]">
                Veja suas vendas por periodo e o valor real a receber ({commissionPercent}%).
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(Object.keys(rankingLabels) as (keyof RankingWindows)[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDashboardTab(key)}
                    className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-xs hover:brightness-[0.98] ${dashboardTab === key ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                  >
                    {rankingLabels[key]}
                  </button>
                ))}
              </div>
              {dashboardChartMode === "real" ? (
                <article className="mb-4 rounded-3xl border-2 border-[#BC8A6F] bg-gradient-to-br from-[#fff7f3] via-[#fdeee6] to-[#f7dfd4] p-6 shadow-lg shadow-[#BC8A6F22]">
                  <p className="text-sm font-medium uppercase tracking-wide text-[#9a725c]">
                    Valor real no periodo ({commissionPercent}% e multas ativas)
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-[#7a5643] sm:text-5xl">
                    R$ {dashboardVisibleReal.toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-[#9a725c]">
                    Este e o saldo disponivel para saque agora (minimo R$ {minWithdraw.toFixed(2)}).
                  </p>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void handleRequestWithdraw()}
                      disabled={!canRequestWithdraw || withdrawBusy}
                      className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {withdrawBusy
                        ? "Solicitando..."
                        : hasPendingWithdraw
                          ? "Saque pendente"
                          : "Solicitar Saque"}
                    </button>
                  </div>
                  {!hasPendingWithdraw && availableToWithdraw < minWithdraw ? (
                    <p className="mt-2 text-xs text-amber-900">
                      Voce precisa ter pelo menos R$ {minWithdraw.toFixed(2)} disponiveis para sacar.
                    </p>
                  ) : null}
                  {activePersonalPenaltyPercent > 0 ? (
                    <p className="mt-2 text-xs text-[#9a725c]">
                      Multas ativas em % somam{" "}
                      <strong className="text-[#7a5643]">
                        {activePersonalPenaltyPercent.toFixed(1)}%
                      </strong>{" "}
                      e reduzem o valor real exibido aqui e no grafico (ate 100%).
                    </p>
                  ) : null}
                </article>
              ) : null}
              {dashboardChartMode === "total" ? (
                <article className="mb-4 rounded-3xl border-2 border-[#8b5a3c] bg-gradient-to-br from-[#fff7f3] via-[#f5e0d4] to-[#edd3c5] p-6 shadow-lg shadow-[#BC8A6F22]">
                  <p className="text-sm font-medium uppercase tracking-wide text-[#9a725c]">
                    Total vendido no periodo (100% — bruto dos comprovantes)
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-[#7a5643] sm:text-5xl">
                    R$ {dashboardTotalSold.toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-[#9a725c]">
                    Este valor e o somatorio dos comprovantes no periodo selecionado acima.
                  </p>
                </article>
              ) : null}
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Comprovantes</p>
                  <p className="text-2xl text-[#7a5643]">{dashboardProofsCount}</p>
                </article>
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">
                    {dashboardChartMode === "total"
                      ? "Ticket medio (R$)"
                      : "Ticket real medio (R$)"}
                  </p>
                  <p className="text-2xl text-[#7a5643]">
                    {(dashboardChartMode === "total"
                      ? dashboardAverageTicket
                      : dashboardAverageTicket * realNetMultiplier
                    ).toFixed(2)}
                  </p>
                </article>
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">
                    {dashboardChartMode === "total"
                      ? `Estimativa de comissao (${commissionPercent}%)`
                      : "Multa ativa (%)"}
                  </p>
                  <p className="text-2xl text-[#7a5643]">
                    {dashboardChartMode === "total"
                      ? `R$ ${(dashboardTotalSold * (commissionPercent / 100)).toFixed(2)}`
                      : `${activePersonalPenaltyPercent.toFixed(1)}%`}
                  </p>
                </article>
              </div>
              <div className="mt-5 overflow-hidden rounded-3xl border border-[#BC8A6F66] bg-gradient-to-b from-[#fff3ef] to-[#f7e5dc] p-4 shadow-xl shadow-[#BC8A6F40]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDashboardModeChange("real")}
                      className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-xs hover:brightness-[0.98] ${
                        dashboardChartMode === "real"
                          ? "bg-[#BC8A6F] text-white"
                          : "bg-white text-[#7a5643]"
                      }`}
                    >
                      Valor real ({commissionPercent}%) - principal
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDashboardModeChange("total")}
                      className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-xs hover:brightness-[0.98] ${
                        dashboardChartMode === "total"
                          ? "bg-[#BC8A6F] text-white"
                          : "bg-white text-[#7a5643]"
                      }`}
                    >
                      Total vendido (100%)
                    </button>
                  </div>
                  <p className="text-xs text-[#9a725c]">
                    {chartStepDays} dia(s) por ponto
                  </p>
                </div>
                <p className="mb-2 text-sm text-[#7a5643]">
                  {dashboardChartMode === "real"
                    ? "Grafico principal: valor real estimado que voce recebe."
                    : "Grafico secundario: total bruto vendido no periodo."}
                </p>
                <div key={dashboardChartMode} className="panel-content-enter">
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="h-56 w-full"
                    role="img"
                    aria-label="Grafico ondulado de vendas"
                    onMouseLeave={() => setHoveredChartIndex(null)}
                  >
                  <defs>
                    <linearGradient id="waveArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#BC8A6F" stopOpacity="0.6" />
                      <stop offset="70%" stopColor="#E8B7A1" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#F6D6C8" stopOpacity="0.08" />
                    </linearGradient>
                    <linearGradient id="waveStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#D7A58A" />
                      <stop offset="100%" stopColor="#BC8A6F" />
                    </linearGradient>
                  </defs>

                  {[0, 1, 2, 3, 4].map((line) => {
                    const y = chartPaddingY + (line / 4) * plotHeight;
                    return (
                      <line
                        key={line}
                        x1={chartPaddingX}
                        y1={y}
                        x2={chartPaddingX + plotWidth}
                        y2={y}
                        stroke="#BC8A6F33"
                        strokeWidth="1"
                      />
                    );
                  })}

                  <path d={areaPath} fill="url(#waveArea)" />
                  <path
                    d={strokePath}
                    fill="none"
                    stroke="url(#waveStroke)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {activeSeries.map((point, index) => {
                    const x =
                      chartPaddingX + (index / Math.max(activeSeries.length - 1, 1)) * plotWidth;
                    const y = chartPaddingY + (1 - point.value / chartMax) * plotHeight;
                    const isHovered = hoveredChartIndex === index;
                    return (
                      <circle
                        key={`dot-${point.label}`}
                        cx={x}
                        cy={y}
                        r={isHovered ? 6 : 4}
                        fill={isHovered ? "#7a5643" : "#BC8A6F"}
                        stroke="#fff"
                        strokeWidth="2"
                        onMouseEnter={() => setHoveredChartIndex(index)}
                      />
                    );
                  })}
                  {hoveredPoint ? (
                    <>
                      {(() => {
                        const x =
                          chartPaddingX +
                          (Math.max(0, Math.min(hoveredChartIndex ?? 0, activeSeries.length - 1)) /
                            Math.max(activeSeries.length - 1, 1)) *
                            plotWidth;
                        const y =
                          chartPaddingY +
                          (1 - hoveredPoint.value / chartMax) * plotHeight;
                        return (
                          <>
                            <line
                              x1={x}
                              y1={chartPaddingY}
                              x2={x}
                              y2={chartPaddingY + plotHeight}
                              stroke="#BC8A6F66"
                              strokeDasharray="4 4"
                              strokeWidth="1.5"
                            />
                            <rect
                              x={Math.max(chartPaddingX, Math.min(x - 95, svgWidth - 190))}
                              y={Math.max(8, y - 56)}
                              width="190"
                              height="42"
                              rx="10"
                              fill="#fff7f3"
                              stroke="#BC8A6F88"
                            />
                            <text
                              x={Math.max(chartPaddingX + 10, Math.min(x - 85, svgWidth - 180))}
                              y={Math.max(25, y - 38)}
                              fill="#7a5643"
                              fontSize="12"
                            >
                              Ponto {hoveredPoint.label}
                            </text>
                            <text
                              x={Math.max(chartPaddingX + 10, Math.min(x - 85, svgWidth - 180))}
                              y={Math.max(41, y - 22)}
                              fill="#7a5643"
                              fontSize="12"
                            >
                              R$ {hoveredPoint.value.toFixed(2)}
                            </text>
                          </>
                        );
                      })()}
                    </>
                  ) : null}
                  </svg>
                </div>
              </div>
            </>
          ) : null}

          {activeSection === "comprovantes" ? (
            <>
              <h2 className="text-2xl text-[#7a5643]">Enviar comprovante</h2>
              <p className="mt-2 text-sm text-[#9a725c]">
                Registre o produto vendido, o valor em reais e anexe print ou gravacao
                como prova. Tudo validado sobe no ranking geral.
              </p>

              <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
                <label className="grid gap-1 text-sm text-[#9a725c]">
                  Nome do produto vendido
                  <input
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex.: Pacote premium"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#9a725c]">
                  Valor da venda (R$)
                  <input
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    value={saleValue}
                    onChange={(e) => setSaleValue(e.target.value)}
                    placeholder="Ex.: 49,90"
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#9a725c]">
                  Comprovante (imagem ou video)
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </label>
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
                  Por seguranca, ha um intervalo de 10 segundos entre envios de comprovante.
                </p>
                {message ? <p className="text-sm text-[#7a5643]">{message}</p> : null}
              </form>

              <div className="mt-8">
                <h3 className="text-xl text-[#7a5643]">Meus envios</h3>
                <div className="mt-3 grid gap-3">
                  {proofs.length === 0 ? (
                    <p className="text-sm text-[#9a725c]">Nenhum comprovante ainda.</p>
                  ) : (
                    proofs.map((proof) => (
                      <article
                        key={proof.id}
                        className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4"
                      >
                        <p className="text-sm text-[#7a5643]">
                          {proof.productName} — R$ {Number(proof.saleValue ?? 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-[#9a725c]">
                          {new Date(proof.createdAt).toLocaleString("pt-BR")}
                        </p>
                        <a
                          className="mt-2 inline-block text-sm text-[#BC8A6F] underline"
                          href={`/api/proofs/${proof.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver arquivo
                        </a>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}

          {activeSection === "tabela" ? (
            <>
              <h2 className="text-2xl text-[#7a5643]">Quem mais vendeu</h2>
              <p className="mt-2 text-sm text-[#9a725c]">
                Ranking por quantidade de comprovantes aprovados no periodo (exceto admin).
              </p>
              {rankingPrizes[rankingTab] > 0 ? (
                <div className="mt-3 rounded-2xl border border-[#BC8A6F66] bg-[#BC8A6F] p-4 text-white">
                  <p className="text-lg">
                    Premio do periodo: o 1 colocado ganha{" "}
                    <strong>R$ {rankingPrizes[rankingTab].toFixed(2)}</strong>.
                  </p>
                  <p className="text-sm text-white/90">
                    Janela atual: {rankingLabels[rankingTab]}. Foque no volume e na consistencia.
                  </p>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {(Object.keys(rankingLabels) as (keyof RankingWindows)[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRankingTab(key)}
                    className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-xs hover:brightness-[0.98] ${rankingTab === key ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                  >
                    {rankingLabels[key]}
                  </button>
                ))}
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-[#BC8A6F44]">
                <table className="w-full border-collapse bg-white text-left">
                  <thead className="bg-[#fff7f3]">
                    <tr>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Pos.</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Foto</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Usuario</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Vendas</th>
                      <th className="px-4 py-3 text-sm text-[#7a5643]">Valor total (R$)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-sm text-[#9a725c]" colSpan={5}>
                          Sem dados neste periodo.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, index) => (
                        <tr
                          key={row.username}
                          className={`border-t border-[#BC8A6F22] ${podiumRowClass(index)}`}
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex min-w-[2.25rem] items-center justify-center rounded-full bg-white/80 px-2 py-0.5 text-sm font-bold text-[#7a5643] ring-1 ring-[#BC8A6F44]">
                              {index === 0 ? "1" : index === 1 ? "2" : index === 2 ? "3" : index + 1}
                              {index < 3 ? "º" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <UserAvatar username={row.username} className="h-9 w-9" />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[#7a5643]">
                            {row.username}
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
                          <td className="px-4 py-3 text-sm text-[#7a5643]">{row.vendas}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-[#7a5643]">
                            {row.valorTotal.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {activeSection === "explicacoes" ? (
            <>
              <h2 className="text-2xl text-[#7a5643]">Como funciona</h2>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setExplanationTopic("site")}
                  className={`rounded-full px-4 py-2 text-sm ${explanationTopic === "site" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Site
                </button>
                <button
                  type="button"
                  onClick={() => setExplanationTopic("vendas")}
                  className={`rounded-full px-4 py-2 text-sm ${explanationTopic === "vendas" ? "bg-[#BC8A6F] text-white" : "bg-[#fff7f3] text-[#7a5643]"}`}
                >
                  Vendas
                </button>
              </div>
              {explanationTopic === "site" ? (
                <div
                  key="site"
                  className="panel-content-enter mt-4 space-y-4 text-sm leading-relaxed text-[#9a725c]"
                >
                  <p>
                    Na aba <strong className="text-[#7a5643]">Comprovantes</strong> voce envia
                    o nome do produto, o valor vendido em reais e anexa uma imagem ou video
                    que comprove a venda. Quanto mais comprovantes validos voce registrar,
                    mais sobe no ranking de vendas.
                  </p>
                  <p>
                    Na aba <strong className="text-[#7a5643]">Tabela</strong> voce acompanha
                    quem mais vendeu nos periodos de 1, 7, 14 e 31 dias. O ranking considera
                    a quantidade de comprovantes enviados no periodo (empate desempata pelo
                    valor total registrado).
                  </p>
                  <p className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4 text-[#7a5643]">
                    <strong className="text-base">Meta diaria obrigatoria:</strong> cada usuario
                    tem meta de <strong>R$ 150,00 por dia</strong>. Esse acumulado aparece na aba
                    <strong> Metas</strong> e aumenta automaticamente conforme os comprovantes
                    forem enviados com o valor da venda.
                  </p>
                  <p>
                    Na aba <strong className="text-[#7a5643]">Multas</strong> aparecem suas
                    advertencias aplicadas pelo painel admin da Bel, com motivo, duracao e
                    percentual de desconto caso a multa tenha %.
                  </p>
                  <p className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4 text-[#7a5643]">
                    <strong className="text-base">Premio de 31 dias:</strong> quem terminar
                    o periodo de <strong>31 dias</strong> em primeiro lugar no ranking geral
                    recebe <strong>R$ 150,00</strong> como bonificacao.
                  </p>
                </div>
              ) : null}
              {explanationTopic === "vendas" ? (
                <div
                  key="vendas"
                  className="panel-content-enter mt-4 space-y-4 text-sm leading-relaxed text-[#9a725c]"
                >
                  <p>
                    Nosso trabalho consiste em oferecer aos clientes acesso a grupos VIP, com
                    fotos e videos exclusivos. Prezamos pelo respeito, profissionalismo e
                    dedicacao, valorizando especialmente aqueles que compram com frequencia,
                    proporcionando uma experiencia personalizada e unica.
                  </p>
                  <p>
                    Mantenham sempre a educacao no atendimento e, quando necessario, sejam
                    firmes ao encerrar conversas prolongadas que nao resultem em compras.
                  </p>
                  <p className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4 text-[#7a5643]">
                    Todos os pagamentos devem ser enviados exclusivamente para o seguinte PIX:
                    <strong className="text-base"> 15991515912</strong>
                  </p>
                  <p>
                    Todos os comprovantes de pagamento devem ser enviados diretamente no site
                    onde este comunicado esta disponivel, na aba
                    <strong className="text-[#7a5643]"> "Comprovantes"</strong>, para que possam
                    ser devidamente verificados.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}

          {activeSection === "perfil" ? (
            <>
              <h2 className="text-2xl text-[#7a5643]">Perfil</h2>
              <p className="mt-2 text-sm text-[#9a725c]">
                Aqui voce pode atualizar sua foto de perfil.
              </p>
              <div className="mt-4">
                <UserAvatar username={username} className="h-28 w-28 border-2 border-[#BC8A6F66]" />
              </div>
              <form className="mt-4 grid gap-3" onSubmit={handleAvatarSubmit}>
                <input
                  type="file"
                  accept="image/*"
                  className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643]"
                  onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                  required
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white hover:brightness-95"
                >
                  Salvar foto de perfil
                </button>
              </form>
            </>
          ) : null}

          {activeSection === "indicacao" ? (
            <>
              <h2 className="text-2xl text-[#7a5643]">Indicacao</h2>
              <p className="mt-2 text-sm text-[#9a725c]">
                Quando alguem usa seu codigo, voce recebe <strong>{referralData?.bonusPercent ?? 4}%</strong> em
                cima de tudo que essa pessoa vender.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Seu codigo exclusivo</p>
                  <p className="mt-1 text-2xl font-semibold tracking-wide text-[#7a5643]">
                    {referralData?.myCode ?? "..."}
                  </p>
                  <p className="mt-2 text-xs text-[#9a725c]">
                    Compartilhe este codigo. O bonus cai para voce, nao para quem usa.
                  </p>
                </article>
                <article className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <p className="text-sm text-[#9a725c]">Bonus acumulado por indicacao</p>
                  <p className="mt-1 text-2xl font-semibold text-[#7a5643]">
                    R$ {Number(referralData?.referralBonusTotal ?? 0).toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-[#9a725c]">
                    Esse valor tambem entra no seu saldo disponivel para saque.
                  </p>
                </article>
              </div>

              <form
                className="mt-4 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4"
                onSubmit={handleApplyReferralCode}
              >
                <p className="text-sm font-medium text-[#7a5643]">Usar codigo de convite</p>
                {referralData?.myInviter ? (
                  <p className="mt-1 text-xs text-[#9a725c]">
                    Codigo ja vinculado: <strong>{referralData.myInviter.codeUsed}</strong> (de @
                    {referralData.myInviter.inviterUsername}).
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#9a725c]">
                    Voce pode vincular apenas um codigo, uma unica vez.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="w-64 rounded-xl border border-[#BC8A6F66] bg-white px-3 py-2 text-sm text-[#7a5643]"
                    placeholder="Digite o codigo de convite"
                    value={referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                    disabled={Boolean(referralData?.myInviter) || referralBusy}
                  />
                  <button
                    type="submit"
                    disabled={Boolean(referralData?.myInviter) || referralBusy}
                    className="rounded-xl bg-[#BC8A6F] px-3 py-2 text-xs text-white hover:brightness-95 disabled:opacity-50"
                  >
                    {referralBusy ? "Aplicando..." : "Aplicar codigo"}
                  </button>
                </div>
              </form>

              <div className="mt-4 rounded-2xl border border-[#BC8A6F44] bg-white p-4">
                <p className="text-sm font-medium text-[#7a5643]">Pessoas que usaram seu codigo</p>
                <div className="mt-3 grid gap-2">
                  {(referralData?.invitees ?? []).length === 0 ? (
                    <p className="text-sm text-[#9a725c]">Ninguem usou seu codigo ainda.</p>
                  ) : (
                    (referralData?.invitees ?? []).map((item) => (
                      <article
                        key={`${item.inviteeUsername}-${item.linkedAt}`}
                        className="rounded-xl border border-[#BC8A6F33] bg-[#fff7f3] px-3 py-2"
                      >
                        <p className="text-sm text-[#7a5643]">
                          @{item.inviteeUsername} - vendeu R$ {item.totalSold.toFixed(2)}
                        </p>
                        <p className="text-xs text-[#9a725c]">
                          Seu bonus ({referralData?.bonusPercent ?? 4}%): R$ {item.referralBonus.toFixed(2)}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}

          {activeSection === "multas" ? (
            <>
              <h2 className="text-2xl text-[#7a5643]">Multas e advertencias</h2>
              <p className="mt-2 text-sm text-[#9a725c]">
                Aqui aparecem as advertencias aplicadas no seu usuario.
              </p>
              <div className="mt-4 grid gap-3">
                {fines.length === 0 ? (
                  <p className="text-sm text-[#9a725c]">Nenhuma multa/advertencia registrada.</p>
                ) : (
                  fines.map((fine) => (
                    <article
                      key={fine.id}
                      className="rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4"
                    >
                      <p className="text-sm text-[#7a5643]">Motivo: {fine.reason}</p>
                      <p className="text-xs text-[#9a725c]">
                        Aplicada em {new Date(fine.createdAt).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-[#9a725c]">
                        Duracao:{" "}
                        {fine.durationType === "eterno"
                          ? "Eterno"
                          : `${fine.durationValue ?? 0} ${fine.durationType}`}
                      </p>
                      <p className="text-xs text-[#9a725c]">
                        Penalidade: {Number(fine.penaltyPercent ?? 0).toFixed(2)}%
                      </p>
                      <p className="text-xs text-[#9a725c]">
                        Termino:{" "}
                        {fine.expiresAt ? new Date(fine.expiresAt).toLocaleString("pt-BR") : "Sem termino"}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : null}

          {activeSection === "metas" ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <UserAvatar username={username} className="h-14 w-14 border-2 border-[#BC8A6F55]" />
                <div>
                  <h2 className="text-2xl text-[#7a5643]">Metas diarias</h2>
                  <p className="mt-1 text-sm text-[#9a725c]">
                    Meta diaria: R$ 150,00. O valor aumenta conforme seus comprovantes de venda.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                <p className="text-sm text-[#7a5643]">
                  Sua meta hoje: R$ {goals?.current.target.toFixed(2) ?? "150.00"}
                </p>
                <p className="text-sm text-[#7a5643]">
                  Seu acumulado hoje: R$ {goals?.current.total.toFixed(2) ?? "0.00"}
                </p>
                <p className="text-sm text-[#7a5643]">
                  Progresso: {goals?.current.progress.toFixed(2) ?? "0.00"}%
                </p>
                <p className="text-sm text-[#7a5643]">
                  Foguinho: {goals?.current.streakDays ?? 0} dia(s) seguido(s)
                </p>
                <p className="text-sm text-[#7a5643]">
                  Comissao ativa hoje:{" "}
                  <strong>{isDailyGoalCompleted ? "40%" : "35%"}</strong>
                </p>
                <div className="mt-2 h-3 w-full rounded-full bg-white">
                  <div
                    className="h-3 rounded-full bg-[#BC8A6F]"
                    style={{ width: `${Math.min(100, goals?.current.progress ?? 0)}%` }}
                  />
                </div>
              </div>
              {Math.min(100, goals?.current.progress ?? 0) >= 100 ? (
                <div className="mt-4 rounded-2xl border-2 border-[#BC8A6F] bg-gradient-to-br from-[#fff7f3] to-[#fce6ef] p-5 text-center shadow-md">
                  <p className="text-lg font-semibold text-[#a64d79]">🔥 Parabens!</p>
                  <p className="mt-1 text-sm text-[#8f4568]">
                    Voce completou <strong>100%</strong> da sua meta diaria. Seu foguinho esta em{" "}
                    <strong>{goals?.current.streakDays ?? 0} dia(s)</strong> e sua comissao hoje
                    fica em <strong>40%</strong>.
                  </p>
                </div>
              ) : null}
              {!isDailyGoalCompleted ? (
                <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  Hoje a meta ainda nao foi batida. Sem foguinho ativo e a comissao segue em{" "}
                  <strong>35%</strong>.
                </div>
              ) : null}
              <p className="mt-4 text-sm text-[#9a725c]">
                Aqui aparece apenas o seu progresso pessoal. O ranking geral fica na aba Tabela.
              </p>
            </>
          ) : null}

          {activeSection === "hots" ? (
            <>
              {!openedHotProfile ? (
                <>
                  <h2 className="text-2xl text-[#7a5643]">Hots</h2>
                  <p className="mt-2 text-sm text-[#9a725c]">
                    Escolha de perfil de atendimento liberada pela Bel no painel admin.
                  </p>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <article className="sidebar-hover-grow overflow-hidden rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={loiraAccess?.profileImageUrl
                          ? loiraAccess.profileImageUrl
                          : HOTS_PROFILE_LINKS.loira}
                        alt="Perfil loira"
                        className="h-72 w-full object-cover"
                      />
                      <div className="p-4">
                        <p className="text-lg text-[#7a5643]">Perfil Loira</p>
                        <p
                          className={`mt-1 text-sm ${loiraAccess ? "text-green-700" : "text-gray-500"}`}
                        >
                          {loiraAccess
                            ? "Acesso liberado."
                            : "Acesso bloqueado."}
                        </p>
                        <button
                          type="button"
                          disabled={!loiraAccess}
                          onClick={() => setOpenedHotProfile("loira")}
                          className={`mt-3 w-full rounded-xl px-4 py-2 text-sm ${
                            loiraAccess
                              ? "bg-[#BC8A6F] text-white hover:brightness-95"
                              : "cursor-not-allowed bg-gray-300 text-gray-600"
                          }`}
                        >
                          {loiraAccess ? "Abrir" : "Bloqueado"}
                        </button>
                      </div>
                    </article>
                    <article className="sidebar-hover-grow overflow-hidden rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={morenaAccess?.profileImageUrl
                          ? morenaAccess.profileImageUrl
                          : HOTS_PROFILE_LINKS.morena}
                        alt="Perfil morena"
                        className="h-72 w-full object-cover"
                      />
                      <div className="p-4">
                        <p className="text-lg text-[#7a5643]">Perfil Morena</p>
                        <p
                          className={`mt-1 text-sm ${morenaAccess ? "text-green-700" : "text-gray-500"}`}
                        >
                          {morenaAccess
                            ? "Acesso liberado."
                            : "Acesso bloqueado."}
                        </p>
                        <button
                          type="button"
                          disabled={!morenaAccess}
                          onClick={() => setOpenedHotProfile("morena")}
                          className={`mt-3 w-full rounded-xl px-4 py-2 text-sm ${
                            morenaAccess
                              ? "bg-[#BC8A6F] text-white hover:brightness-95"
                              : "cursor-not-allowed bg-gray-300 text-gray-600"
                          }`}
                        >
                          {morenaAccess ? "Abrir" : "Bloqueado"}
                        </button>
                      </div>
                    </article>
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-lg text-[#7a5643]">
                      Perfil {openedHotProfile === "loira" ? "Loira" : "Morena"} - redes sociais
                    </p>
                    <button
                      type="button"
                      className="text-sm text-[#BC8A6F] underline"
                      onClick={() => setOpenedHotProfile(null)}
                    >
                      Fechar
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(
                      ["twitter", "facebook", "tiktok", "instagram", "discord"] as const
                    ).map((socialKey) => {
                      const profileAccess = openedHotProfile === "loira" ? loiraAccess : morenaAccess;
                      const granted = Boolean(profileAccess?.grantedSocials?.includes(socialKey));
                      const socialCred = profileAccess?.socialCredentialsByKey?.[socialKey];
                      return (
                        <article
                          key={`${openedHotProfile}-${socialKey}`}
                          className="rounded-xl border border-[#BC8A6F44] bg-white p-3 transition-transform duration-200 hover:scale-[1.03]"
                        >
                          <p className="flex items-center gap-2 text-sm font-medium text-[#7a5643]">
                            <SocialIcon socialKey={socialKey} />
                            {HOTS_SOCIAL_LABELS[socialKey]}
                          </p>
                          <p
                            className={`mt-1 flex items-center gap-1 text-xs ${granted ? "text-green-700" : "text-gray-500"}`}
                          >
                            {granted ? (
                              <svg
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-4 w-4"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.264a1 1 0 0 1-1.42-.004L3.3 9.109a1 1 0 1 1 1.4-1.43l4.078 3.994 6.513-6.57a1 1 0 0 1 1.413-.006Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : null}
                            {granted ? "Acesso liberado." : "Acesso bloqueado."}
                          </p>
                          {granted ? (
                            <div className="mt-2 space-y-1 text-xs text-[#7a5643]">
                              <p>
                                <strong>Login:</strong> {socialCred?.login ?? "Nao configurado"}
                              </p>
                              <p>
                                <strong>Senha:</strong> {socialCred?.password ?? "Nao configurado"}
                              </p>
                              <p>
                                <strong>URL:</strong> {socialCred?.url ?? "Nao configurado"}
                              </p>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
