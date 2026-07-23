import Link from "next/link";
import { ExternalLink, Eye, Globe, Rocket, Undo2 } from "lucide-react";
import SiteWizard from "@/components/admin/site/SiteWizard";
import SubmitButton from "@/components/ui/SubmitButton";
import Toggle from "@/components/ui/Toggle";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sitePlanFeatures } from "@/lib/plans";
import {
  publishSite,
  revertSiteDraft,
  updateSiteCss,
  updateSiteSeo,
  updateSiteSubdomain,
  updateSiteTheme,
} from "@/lib/site-actions";
import { normalizeConfig } from "@/lib/site-config";
import { sitesBaseDomain, siteUrl } from "@/lib/site-host";
import { SITE_FONTS, SITE_TEMPLATES, siteTemplate } from "@/lib/site-themes";

export const dynamic = "force-dynamic";

export default async function SitePage(props: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await props.searchParams;
  const { property } = await requireOwner();
  const features = sitePlanFeatures(property.plan);

  if (!features.builder) {
    return (
      <div className="card mx-auto mt-8 max-w-xl space-y-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Globe size={26} strokeWidth={2} />
        </div>
        <h1 className="text-xl font-bold">Własna strona WWW Twojego obiektu</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          Zbuduj stronę-wizytówkę z rezerwacją online w kilkanaście minut: gotowe szablony,
          Twoje zdjęcia i cennik, publikacja na adresie{" "}
          <b>
            {property.slug}.{sitesBaseDomain()}
          </b>
          , a w planie Pro — własna domena. Bez programisty i bez prowizji od rezerwacji.
        </p>
        <Link
          href="/admin/plan"
          className="inline-block rounded-[11px] bg-brand-900 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-950"
        >
          Zobacz plany od Standard
        </Link>
      </div>
    );
  }

  const site = await prisma.site.findUnique({ where: { propertyId: property.id } });

  if (!site) {
    const [photoCount, unitTypeCount] = await Promise.all([
      prisma.photo.count({ where: { propertyId: property.id } }),
      prisma.unitType.count({ where: { propertyId: property.id } }),
    ]);
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-xl font-bold">Strona WWW</h1>
          <p className="text-sm text-slate-500">
            Zbuduj stronę swojego obiektu — poprowadzimy Cię krok po kroku.
          </p>
        </header>
        {error && <p className="alert-error">{error}</p>}
        <SiteWizard
          templates={SITE_TEMPLATES}
          fonts={Object.entries(SITE_FONTS).map(([key, f]) => ({ key, label: f.label }))}
          suggestedSubdomain={property.slug}
          baseDomain={sitesBaseDomain()}
          data={{
            photoCount,
            unitTypeCount,
            hasDescription: property.description.length > 0,
            hasAddress: property.address.length > 0,
          }}
        />
      </div>
    );
  }

  const photos = await prisma.photo.findMany({
    where: { propertyId: property.id },
    orderBy: { id: "asc" },
  });
  const config = normalizeConfig(site.draftConfig);
  const template = siteTemplate(site.template);
  const dirty =
    JSON.stringify(site.draftConfig) !== JSON.stringify(site.publishedConfig ?? null);
  const liveUrl = siteUrl(site);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Strona WWW</h1>
          <p className="text-sm text-slate-500">
            Szablon: {template.label} · adres:{" "}
            {site.publishedAt ? (
              <a href={liveUrl} target="_blank" className="font-medium text-brand-600 hover:underline">
                {liveUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <span>{liveUrl.replace(/^https?:\/\//, "")} (jeszcze nieopublikowana)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/podglad-strony"
            target="_blank"
            className="flex items-center gap-1.5 rounded-[11px] border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:border-brand-600"
          >
            <Eye size={14} strokeWidth={2} /> Podgląd roboczy
          </a>
          {site.publishedAt && (
            <a
              href={liveUrl}
              target="_blank"
              className="flex items-center gap-1.5 rounded-[11px] border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:border-brand-600"
            >
              <ExternalLink size={14} strokeWidth={2} /> Zobacz na żywo
            </a>
          )}
          {dirty && site.publishedAt && (
            <form action={revertSiteDraft}>
              <SubmitButton className="flex items-center gap-1.5 rounded-[11px] border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:border-red-400 hover:text-red-600">
                <Undo2 size={14} strokeWidth={2} /> Cofnij zmiany
              </SubmitButton>
            </form>
          )}
          <form action={publishSite}>
            <SubmitButton
              className="flex items-center gap-1.5 rounded-[11px] bg-brand-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-950 disabled:opacity-50"
              disabled={!dirty && !!site.publishedAt}
            >
              <Rocket size={14} strokeWidth={2} />
              {site.publishedAt ? "Opublikuj zmiany" : "Opublikuj stronę"}
            </SubmitButton>
          </form>
        </div>
      </header>

      {error && <p className="alert-error">{error}</p>}
      {saved && <p className="alert-success">Zapisano.</p>}
      {dirty && site.publishedAt && (
        <p className="rounded-[11px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          Masz nieopublikowane zmiany — goście widzą poprzednią wersję strony, dopóki nie
          klikniesz „Opublikuj zmiany”.
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          {/* Sekcje strony — edytor (uzupełniany w kolejnym etapie) */}
          <section id="sekcje" className="card space-y-4 p-5" data-section-editor>
            <h2 className="text-[15px] font-bold">Sekcje strony</h2>
          </section>
        </div>

        <div className="space-y-5">
          {/* Wygląd */}
          <section className="card space-y-4 p-5">
            <h2 className="text-[15px] font-bold">Wygląd</h2>
            <form action={updateSiteTheme} className="space-y-4">
              <div>
                <p className="mb-2 text-[13px] font-semibold">Paleta kolorów</p>
                <div className="flex flex-wrap gap-2">
                  {template.palettes.map((p) => (
                    <label
                      key={p.key}
                      className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold transition-colors has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                    >
                      <input
                        type="radio"
                        name="palette"
                        value={p.key}
                        defaultChecked={config.theme.palette === p.key}
                        className="sr-only"
                      />
                      <span className="flex gap-1">
                        <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: p.primary }} />
                        <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: p.accent }} />
                      </span>
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-semibold">Typografia</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SITE_FONTS).map(([key, f]) => (
                    <label
                      key={key}
                      className="cursor-pointer rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold transition-colors has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                    >
                      <input
                        type="radio"
                        name="font"
                        value={key}
                        defaultChecked={config.theme.font === key}
                        className="sr-only"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
              {photos.length > 0 && (
                <div>
                  <p className="mb-2 text-[13px] font-semibold">Zdjęcie nagłówka (hero)</p>
                  <div className="flex flex-wrap gap-2">
                    {photos.map((ph) => (
                      <label key={ph.id} className="cursor-pointer">
                        <input
                          type="radio"
                          name="heroPhotoId"
                          value={ph.id}
                          defaultChecked={config.theme.heroPhotoId === ph.id}
                          className="peer sr-only"
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ph.path}
                          alt=""
                          className="h-16 w-24 rounded-lg border-2 border-transparent object-cover opacity-80 transition-all peer-checked:border-brand-600 peer-checked:opacity-100"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[13px] font-semibold">Logo (opcjonalnie)</p>
                {config.theme.logoUrl && (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={config.theme.logoUrl} alt="Logo" className="h-9 rounded bg-slate-100 p-1" />
                    <Toggle name="removeLogo" label="Usuń logo" />
                  </div>
                )}
                <input
                  type="file"
                  name="logo"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700"
                />
              </div>
              <SubmitButton className="rounded-[11px] bg-brand-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-950">
                Zapisz wygląd
              </SubmitButton>
            </form>
          </section>

          {/* Adres strony */}
          <section className="card space-y-3 p-5">
            <h2 className="text-[15px] font-bold">Adres strony</h2>
            <form action={updateSiteSubdomain} className="flex flex-wrap items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center overflow-hidden rounded-[11px] border border-slate-200 focus-within:border-brand-600">
                <input
                  name="subdomain"
                  defaultValue={site.subdomain}
                  className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
                  aria-label="Subdomena"
                />
                <span className="flex-none bg-slate-50 px-3 py-2 text-sm text-slate-400">
                  .{sitesBaseDomain()}
                </span>
              </span>
              <SubmitButton className="rounded-[11px] border border-slate-200 px-4 py-2 text-[13px] font-bold text-slate-700 transition-colors hover:border-brand-600">
                Zmień
              </SubmitButton>
            </form>
            <div data-domain-panel />
          </section>

          {/* SEO */}
          <section className="card space-y-3 p-5">
            <h2 className="text-[15px] font-bold">SEO — Google i social media</h2>
            <form action={updateSiteSeo} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold">
                  Tytuł strony <span className="font-normal text-slate-400">(do 70 znaków)</span>
                </span>
                <input
                  name="title"
                  defaultValue={config.seo.title}
                  maxLength={70}
                  placeholder={property.name}
                  className="w-full rounded-[11px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold">
                  Opis <span className="font-normal text-slate-400">(do 170 znaków)</span>
                </span>
                <textarea
                  name="description"
                  defaultValue={config.seo.description}
                  maxLength={170}
                  rows={3}
                  className="w-full rounded-[11px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                />
              </label>
              <SubmitButton className="rounded-[11px] bg-brand-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-950">
                Zapisz SEO
              </SubmitButton>
            </form>
          </section>

          {/* Zaawansowane */}
          <details className="card p-5">
            <summary className="cursor-pointer select-none text-[15px] font-bold">
              Zaawansowane: własny CSS
            </summary>
            <form action={updateSiteCss} className="mt-3 space-y-3">
              <textarea
                name="css"
                defaultValue={site.customCss}
                rows={8}
                spellCheck={false}
                placeholder={".site-root h1 { letter-spacing: -0.02em; }"}
                className="w-full rounded-[11px] border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-brand-600"
              />
              <p className="text-xs text-slate-400">
                Style nadpisują szablon — na własną odpowiedzialność. CSS działa na stronie
                od razu po zapisie, niezależnie od publikacji sekcji.
              </p>
              <SubmitButton className="rounded-[11px] bg-brand-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-950">
                Zapisz CSS
              </SubmitButton>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
