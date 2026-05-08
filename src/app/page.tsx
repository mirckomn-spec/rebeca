"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LOGIN_COOLDOWN_MS = 3000;

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  function startCooldown(durationMs: number) {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    const endsAt = Date.now() + durationMs;
    setCooldownRemaining(durationMs);
    cooldownTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, endsAt - Date.now());
      setCooldownRemaining(remaining);
      if (remaining <= 0 && cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    }, 100);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || cooldownRemaining > 0) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
        retryAfterMs?: number;
      };

      if (!response.ok) {
        if (response.status === 429) {
          const ms = Number(data.retryAfterMs ?? LOGIN_COOLDOWN_MS);
          startCooldown(Number.isFinite(ms) && ms > 0 ? ms : LOGIN_COOLDOWN_MS);
          setError(data.error ?? "Aguarde antes de tentar novamente.");
          return;
        }
        if (typeof data.redirect === "string") {
          router.push(data.redirect);
          router.refresh();
          return;
        }
        setError(data.error ?? "Falha no login.");
        startCooldown(LOGIN_COOLDOWN_MS);
        return;
      }

      const redirectTo =
        typeof data.redirect === "string" ? data.redirect : "/painel";
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Nao foi possivel conectar ao servidor. Tente novamente.");
      startCooldown(LOGIN_COOLDOWN_MS);
    } finally {
      setLoading(false);
    }
  }

  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);
  const isDisabled = loading || cooldownRemaining > 0;
  const buttonLabel = loading
    ? "Entrando..."
    : cooldownRemaining > 0
      ? `Aguarde ${cooldownSeconds}s...`
      : "Acessar dashboard";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6E1E1] px-6 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#BC8A6F33,transparent_40%),radial-gradient(circle_at_85%_15%,#BC8A6F2B,transparent_35%),radial-gradient(circle_at_50%_90%,#BC8A6F22,transparent_45%)]" />

      <section className="relative mx-auto my-auto -translate-y-[2cm] w-full max-w-2xl rounded-[2rem] border border-[#BC8A6F66] bg-white/85 p-7 shadow-2xl shadow-[#BC8A6F40] backdrop-blur-xl">
        <div className="rounded-3xl border border-[#BC8A6F44] bg-gradient-to-b from-[#fff7f3] via-[#fdf0ea] to-[#f7e2d7] p-6">
          <span className="inline-flex rounded-full border border-[#BC8A6F88] bg-[#BC8A6F14] px-3 py-1 text-xs text-[#8e654e]">
            Area Privada
          </span>
          <h1 className="mt-4 text-center text-5xl tracking-tight text-[#7a5643]">Hots</h1>
          <p className="mt-4 text-center text-sm leading-relaxed text-[#9a725c]">
            Cresca conosco. Este painel privado foi criado para a equipe escolhida
            pela Bel registrar comprovantes e acompanhar resultados com organizacao.
          </p>

          <form className="mt-7 grid gap-4" onSubmit={onSubmit} autoComplete="off">
            <label className="grid gap-1 text-sm text-[#9a725c]">
              Usuario
              <input
                className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643] outline-none ring-[#BC8A6F80] placeholder:text-[#c5a18d] focus:ring-2"
                placeholder="Digite seu usuario"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-[#9a725c]">
              Senha
              <input
                type="password"
                className="rounded-xl border border-[#BC8A6F66] bg-white px-4 py-2 text-sm text-[#7a5643] outline-none ring-[#BC8A6F80] placeholder:text-[#c5a18d] focus:ring-2"
                placeholder="Digite sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isDisabled}
              className="mt-2 rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {buttonLabel}
            </button>
            <p className="text-center text-[11px] text-[#9a725c]">
              Por seguranca, ha um intervalo minimo entre tentativas de login.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
