"use server";

// Server actions modułu „Strona WWW" (kreator stron obiektów).
// Wzorzec jak w lib/actions.ts: FormData → walidacja → redirect(?error=…)
// albo revalidatePath + redirect(?saved=1).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireOwner } from "./auth";
import { prisma } from "./db";
import { savePhotoFile } from "./photos";
import { sitePlanFeatures } from "./plans";
import {
  buildDefaultConfig,
  normalizeConfig,
  type SiteConfig,
} from "./site-config";
import { siteRevalidatePaths } from "./sites";
import { SITE_FONTS, siteTemplate } from "./site-themes";
import { slugify } from "./slug";

const PAGE = "/admin/strona";

function fail(msg: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(msg)}`);
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Właściciel z planem obejmującym kreator; inaczej redirect z błędem. */
async function requireBuilder() {
  const { user, property } = await requireOwner();
  if (!sitePlanFeatures(property.plan).builder) {
    fail("Kreator strony WWW jest dostępny od planu Standard.");
  }
  return { user, property };
}

/** Jak requireBuilder + istniejąca strona obiektu. */
async function requireSite() {
  const { user, property } = await requireBuilder();
  const site = await prisma.site.findUnique({ where: { propertyId: property.id } });
  if (!site) fail("Najpierw utwórz stronę w kreatorze.");
  return { user, property, site };
}

function draftOf(site: { draftConfig: unknown }): SiteConfig {
  return normalizeConfig(site.draftConfig);
}

async function saveDraft(siteId: number, config: SiteConfig): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: { draftConfig: config as unknown as Prisma.InputJsonValue },
  });
}

function done(): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

async function uniqueSubdomain(base: string, excludeSiteId?: number): Promise<string> {
  let subdomain = base;
  for (let i = 2; ; i++) {
    const existing = await prisma.site.findUnique({ where: { subdomain } });
    if (!existing || existing.id === excludeSiteId) return subdomain;
    subdomain = `${base}-${i}`;
  }
}

// ---------- wizard ----------

export async function createSite(formData: FormData): Promise<void> {
  const { property } = await requireBuilder();
  const existing = await prisma.site.findUnique({ where: { propertyId: property.id } });
  if (existing) fail("Strona już istnieje.");

  const template = siteTemplate(str(formData, "template"));
  const paletteKey = str(formData, "palette") || template.defaultPalette;
  const fontKey = str(formData, "font") in SITE_FONTS ? str(formData, "font") : template.defaultFont;
  const requestedSubdomain = slugify(str(formData, "subdomain") || property.slug);
  if (requestedSubdomain.length < 3) fail("Adres strony musi mieć min. 3 znaki.");
  const subdomain = await uniqueSubdomain(requestedSubdomain);

  const full = await prisma.property.findUniqueOrThrow({
    where: { id: property.id },
    include: {
      photos: { where: { propertyId: { not: null } }, orderBy: { id: "asc" } },
      unitTypes: { orderBy: { id: "asc" } },
    },
  });
  const config = buildDefaultConfig(full, template.key);
  config.theme.palette = template.palettes.some((p) => p.key === paletteKey)
    ? paletteKey
    : template.defaultPalette;
  config.theme.font = fontKey;

  await prisma.site.create({
    data: {
      propertyId: property.id,
      subdomain,
      template: template.key,
      draftConfig: config as unknown as Prisma.InputJsonValue,
    },
  });
  done();
}

// ---------- publikacja ----------

export async function publishSite(): Promise<void> {
  const { site } = await requireSite();
  const updated = await prisma.site.update({
    where: { id: site.id },
    data: {
      publishedConfig: draftOf(site) as unknown as Prisma.InputJsonValue,
      publishedAt: new Date(),
    },
  });
  for (const path of siteRevalidatePaths(updated)) revalidatePath(path);
  done();
}

export async function revertSiteDraft(): Promise<void> {
  const { site } = await requireSite();
  if (!site.publishedConfig) fail("Strona nie była jeszcze publikowana.");
  await prisma.site.update({
    where: { id: site.id },
    data: { draftConfig: site.publishedConfig as unknown as Prisma.InputJsonValue },
  });
  done();
}

// ---------- ustawienia ----------

export async function updateSiteTheme(formData: FormData): Promise<void> {
  const { property, site } = await requireSite();
  const config = draftOf(site);
  const template = siteTemplate(site.template);

  const palette = str(formData, "palette");
  if (template.palettes.some((p) => p.key === palette)) config.theme.palette = palette;
  const font = str(formData, "font");
  if (font in SITE_FONTS) config.theme.font = font;

  const heroPhotoId = Number(str(formData, "heroPhotoId"));
  config.theme.heroPhotoId = Number.isInteger(heroPhotoId) && heroPhotoId > 0 ? heroPhotoId : null;

  if (str(formData, "removeLogo")) {
    config.theme.logoUrl = null;
  } else {
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      try {
        config.theme.logoUrl = await savePhotoFile(logo, `p${property.id}-site`);
      } catch (e) {
        fail(e instanceof Error ? e.message : "Nie udało się wgrać logo.");
      }
    }
  }

  await saveDraft(site.id, config);
  done();
}

export async function updateSiteSeo(formData: FormData): Promise<void> {
  const { site } = await requireSite();
  const config = draftOf(site);
  config.seo.title = str(formData, "title").slice(0, 70);
  config.seo.description = str(formData, "description").slice(0, 170);
  await saveDraft(site.id, config);
  done();
}

export async function updateSiteCss(formData: FormData): Promise<void> {
  const { site } = await requireSite();
  await prisma.site.update({
    where: { id: site.id },
    data: { customCss: str(formData, "css").slice(0, 20000) },
  });
  done();
}

export async function updateSiteSubdomain(formData: FormData): Promise<void> {
  const { site } = await requireSite();
  const requested = slugify(str(formData, "subdomain"));
  if (requested.length < 3) fail("Adres strony musi mieć min. 3 znaki.");
  const subdomain = await uniqueSubdomain(requested, site.id);
  if (subdomain !== requested) fail("Ten adres jest już zajęty — wybierz inny.");
  const oldPaths = siteRevalidatePaths(site);
  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { subdomain },
  });
  for (const path of [...oldPaths, ...siteRevalidatePaths(updated)]) revalidatePath(path);
  done();
}
