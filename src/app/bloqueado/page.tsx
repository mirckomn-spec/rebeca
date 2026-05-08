import Link from "next/link";

export default function BloqueadoPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6E1E1] px-6 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#BC8A6F33,transparent_40%),radial-gradient(circle_at_85%_15%,#BC8A6F2B,transparent_35%),radial-gradient(circle_at_50%_90%,#BC8A6F22,transparent_45%)]" />
      <section className="relative mx-auto my-auto w-full max-w-2xl rounded-[2rem] border border-[#BC8A6F66] bg-white/85 p-7 shadow-2xl shadow-[#BC8A6F40] backdrop-blur-xl">
        <div className="rounded-3xl border border-red-200 bg-gradient-to-b from-red-50 via-white to-red-50 p-6">
          <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs text-red-900">
            Conta bloqueada
          </span>
          <h1 className="mt-4 text-center text-4xl tracking-tight text-[#7a5643]">
            Acesso bloqueado
          </h1>
          <p className="mt-4 text-center text-sm leading-relaxed text-[#9a725c]">
            Sua conta foi bloqueada e nao pode acessar o painel no momento. Para
            saber o motivo e desbloquear, fale com a Bel.
          </p>

          <div className="mt-4 rounded-2xl border border-[#BC8A6F44] bg-[#fff7f3] p-4 text-sm text-[#7a5643]">
            Qualquer duvida, entre em contato com a Bel no Discord:{" "}
            <strong>@bel123</strong>.
          </div>

          <Link
            href="/"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#BC8A6F] px-4 py-2 text-sm text-white transition hover:brightness-95"
          >
            Voltar para o login
          </Link>
        </div>
      </section>
    </main>
  );
}
