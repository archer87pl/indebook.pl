import type { SiteCtx } from "./SiteRenderer";

export default function SiteFooter({ ctx }: { ctx: SiteCtx }) {
  const p = ctx.property;
  return (
    <footer className="border-t border-[var(--site-text)]/10 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 text-sm text-[var(--site-muted)] sm:grid-cols-3">
        <div>
          <p className="mb-1 font-bold text-[var(--site-text)]">{p.name}</p>
          {p.address && <p>{p.address}</p>}
        </div>
        <div>
          <p>zameldowanie od {p.checkInFrom}</p>
          <p>wymeldowanie do {p.checkOutTo}</p>
        </div>
        <div className="space-y-1">
          {(p.terms || p.privacyPolicy) && (
            <p>
              <a
                href={`${ctx.appUrl}/o/${p.slug}/regulamin`}
                className="underline-offset-2 hover:underline"
              >
                Regulamin i polityka prywatności
              </a>
            </p>
          )}
          <p>
            Rezerwacje:{" "}
            <a
              href={`${ctx.appUrl}/o/${p.slug}`}
              className="underline-offset-2 hover:underline"
            >
              online, bez prowizji
            </a>
          </p>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-[var(--site-muted)]">
        Strona stworzona w{" "}
        <a href={ctx.appUrl} className="font-semibold underline-offset-2 hover:underline">
          Rezio
        </a>
      </p>
    </footer>
  );
}
