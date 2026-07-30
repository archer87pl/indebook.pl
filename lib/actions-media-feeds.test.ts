import { beforeEach, describe, expect, it, vi } from "vitest";

// Reszta akcji panelu: zdjęcia, feedy iCal i kasowanie faktury. Feedy są tu
// najciekawsze — adres podaje właściciel, więc przechodzi przez zaporę SSRF
// już przy dodawaniu, a nie tylko przy pobieraniu. Zdjęcia kasujemy najpierw
// z dysku/Bloba, potem z bazy: odwrotna kolejność zostawia osierocone pliki.

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => void cb() }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "pl",
  getTranslations: async () => (k: string) => k,
}));

const owner = { user: { id: 5 }, property: { id: 3, slug: "willa", name: "Willa" } };
vi.mock("./auth", () => ({
  requireOwner: async () => owner,
  requireSuperadmin: async () => ({ id: 1 }),
  getSessionUser: async () => owner.user,
  createSession: async () => {},
  destroySession: async () => {},
  SESSION_COOKIE: "rezflow_session",
}));

let unitType: { id: number; propertyId: number; seasons: unknown[]; property: unknown } | null = null;
let unit: { id: number; unitTypeId: number; unitType: { propertyId: number } } | null = null;
let photo:
  | { id: number; path: string; propertyId: number | null; unitType: { propertyId: number } | null }
  | null = null;
let feed:
  | { id: number; unitId: number; url: string; name: string; unit: { unitType: { propertyId: number } } }
  | null = null;
let feeds: { id: number; name: string; url: string }[] = [];
let invoice: { id: number; propertyId: number } | null = null;

let saveError: Error | null = null;
let syncResults: { ok: boolean; imported: number; error?: string }[] = [];

const photosCreated: Record<string, unknown>[] = [];
const photosDeleted: number[] = [];
const filesSaved: string[] = [];
const filesDeleted: string[] = [];
const feedsCreated: Record<string, unknown>[] = [];
const feedsDeleted: number[] = [];
const blocksDeletedMany: Record<string, unknown>[] = [];
const invoicesDeleted: number[] = [];
const syncedFeeds: number[] = [];
const urlsChecked: string[] = [];
let assertUrlError: Error | null = null;

vi.mock("./db", () => ({
  prisma: {
    unitType: { findUnique: async () => unitType },
    unit: { findUnique: async () => unit },
    photo: {
      findUnique: async () => photo,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        photosCreated.push(data);
      },
      delete: async ({ where }: { where: { id: number } }) => {
        photosDeleted.push(where.id);
      },
    },
    icalFeed: {
      findUnique: async () => feed,
      findMany: async () => feeds,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        feedsCreated.push(data);
        return { id: 61, ...data };
      },
      delete: async ({ where }: { where: { id: number } }) => {
        feedsDeleted.push(where.id);
      },
    },
    invoice: {
      findUnique: async () => invoice,
      delete: async ({ where }: { where: { id: number } }) => {
        invoicesDeleted.push(where.id);
      },
    },
    block: {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        blocksDeletedMany.push(where);
        return { count: 0 };
      },
    },
    property: { findUnique: async () => null },
    pricingRule: { findMany: async () => [] },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("./photos", () => ({
  savePhotoFile: async (_file: File, prefix: string) => {
    if (saveError) throw saveError;
    filesSaved.push(prefix);
    return `/uploads/${prefix}-abc.jpg`;
  },
  deletePhotoFile: async (path: string) => {
    filesDeleted.push(path);
  },
}));

vi.mock("./ical", () => ({
  syncIcalFeed: async (f: { id: number }) => {
    syncedFeeds.push(f.id);
    return syncResults.shift() ?? { ok: true, imported: 0 };
  },
}));

vi.mock("./net", () => ({
  assertPublicUrl: async (url: string) => {
    urlsChecked.push(url);
    if (assertUrlError) throw assertUrlError;
  },
}));

vi.mock("./mailer", () => ({ sendMail: async () => {} }));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({ logEvent: async () => {} }));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({ afterAri: async () => {}, syncUnitRange: async () => {} }));

const {
  addIcalFeed,
  deleteIcalFeed,
  deleteInvoice,
  deletePhoto,
  syncAllIcalFeeds,
  syncOneIcalFeed,
  uploadPropertyPhoto,
  uploadUnitTypePhoto,
} = await import("./actions");

const form = (entries: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

const jpg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });

async function target(run: Promise<void>): Promise<string> {
  try {
    await run;
    throw new Error("akcja nie przekierowała");
  } catch (e) {
    if (e instanceof RedirectError) return decodeURIComponent(e.to);
    throw e;
  }
}

beforeEach(() => {
  unitType = { id: 7, propertyId: 3, seasons: [], property: { id: 3 } };
  unit = { id: 101, unitTypeId: 7, unitType: { propertyId: 3 } };
  photo = { id: 71, path: "/uploads/p3-abc.jpg", propertyId: 3, unitType: null };
  feed = {
    id: 61,
    unitId: 101,
    url: "https://ical.booking.com/kalendarz.ics",
    name: "Booking.com",
    unit: { unitType: { propertyId: 3 } },
  };
  feeds = [
    { id: 61, name: "Booking.com", url: "https://ical.booking.com/a.ics" },
    { id: 62, name: "Airbnb", url: "https://airbnb.com/b.ics" },
  ];
  invoice = { id: 81, propertyId: 3 };
  saveError = null;
  assertUrlError = null;
  syncResults = [];
  photosCreated.length = 0;
  photosDeleted.length = 0;
  filesSaved.length = 0;
  filesDeleted.length = 0;
  feedsCreated.length = 0;
  feedsDeleted.length = 0;
  blocksDeletedMany.length = 0;
  invoicesDeleted.length = 0;
  syncedFeeds.length = 0;
  urlsChecked.length = 0;
});

describe("zdjęcia obiektu", () => {
  it("zapisuje plik z prefiksem obiektu i wiąże go z obiektem", async () => {
    // prefiks porządkuje pliki w magazynie i wiąże je z właścicielem
    await target(uploadPropertyPhoto(form({ file: jpg() })));

    expect(filesSaved).toEqual(["p3"]);
    expect(photosCreated[0]).toMatchObject({ propertyId: 3, path: "/uploads/p3-abc.jpg" });
  });

  it("brak pliku w formularzu nie tworzy wpisu", async () => {
    const to = await target(uploadPropertyPhoto(form({})));

    expect(to).toContain("Wybierz plik");
    expect(photosCreated).toEqual([]);
  });

  it("odrzucony plik (zły typ, za duży) wraca komunikatem z magazynu", async () => {
    // walidacja rozmiaru i typu jest w warstwie zapisu — akcja ma tylko
    // pokazać właścicielowi, dlaczego się nie udało
    saveError = new Error("Zdjęcie może mieć maks. 8 MB.");

    const to = await target(uploadPropertyPhoto(form({ file: jpg() })));

    expect(to).toContain("8 MB");
    expect(photosCreated).toEqual([]);
  });

  it("zdjęcie typu pokoju wiąże się z typem, nie z obiektem", async () => {
    await target(uploadUnitTypePhoto(form({ unitTypeId: "7", file: jpg() })));

    expect(photosCreated[0]).toMatchObject({ unitTypeId: 7 });
    expect(photosCreated[0]).not.toHaveProperty("propertyId");
  });

  it("cudzy typ pokoju nie dostaje zdjęcia", async () => {
    unitType!.propertyId = 999;

    expect(await target(uploadUnitTypePhoto(form({ unitTypeId: "7", file: jpg() })))).toBe(
      "/admin/pokoje"
    );
    expect(filesSaved).toEqual([]);
  });
});

describe("deletePhoto", () => {
  it("kasuje plik z magazynu przed wpisem w bazie", async () => {
    // odwrotna kolejność przy awarii zostawia plik bez wpisu, czyli śmieć,
    // którego nikt już nie znajdzie
    await target(deletePhoto(form({ id: "71" })));

    expect(filesDeleted).toEqual(["/uploads/p3-abc.jpg"]);
    expect(photosDeleted).toEqual([71]);
  });

  it("zdjęcie typu pokoju też jest rozpoznawane jako własne", async () => {
    photo = { id: 71, path: "/uploads/p3-x.jpg", propertyId: null, unitType: { propertyId: 3 } };

    await target(deletePhoto(form({ id: "71", back: "pokoje" })));

    expect(photosDeleted).toEqual([71]);
  });

  it("wraca tam, skąd przyszło żądanie", async () => {
    expect(await target(deletePhoto(form({ id: "71", back: "pokoje" })))).toBe("/admin/pokoje");
    expect(await target(deletePhoto(form({ id: "71" })))).toBe("/admin/obiekt");
  });

  it("cudze zdjęcie jest nietykalne — ani plik, ani wpis", async () => {
    photo = { id: 71, path: "/uploads/p9-x.jpg", propertyId: 999, unitType: null };

    await target(deletePhoto(form({ id: "71" })));

    expect(filesDeleted).toEqual([]);
    expect(photosDeleted).toEqual([]);
  });

  it("nieistniejące zdjęcie nie wywraca akcji", async () => {
    photo = null;

    await target(deletePhoto(form({ id: "999" })));

    expect(photosDeleted).toEqual([]);
  });
});

describe("addIcalFeed", () => {
  const VALID = {
    unitId: "101",
    url: "https://ical.booking.com/kalendarz.ics",
    name: "Booking.com",
    channel: "BOOKING",
  };

  it("dodaje feed i od razu go synchronizuje, pokazując liczbę terminów", async () => {
    syncResults = [{ ok: true, imported: 4 }];

    const to = await target(addIcalFeed(form(VALID)));

    expect(feedsCreated[0]).toMatchObject({ unitId: 101, channel: "BOOKING" });
    expect(syncedFeeds).toEqual([61]);
    expect(to).toBe("/admin/kanaly?synced=4");
  });

  it("adres przechodzi przez zaporę SSRF PRZED zapisem", async () => {
    // bez tego wpis w bazie zostawałby nawet dla adresu wewnętrznego,
    // a cron próbowałby go pobierać przy każdym przebiegu
    assertUrlError = new Error("Adres wskazuje zasób wewnętrzny.");

    const to = await target(addIcalFeed(form({ ...VALID, url: "http://169.254.169.254/meta" })));

    expect(to).toContain("zasób wewnętrzny");
    expect(feedsCreated).toEqual([]);
    expect(urlsChecked).toEqual(["http://169.254.169.254/meta"]);
  });

  it("adres musi być HTTP(S)", async () => {
    for (const url of ["ftp://serwer/kalendarz.ics", "webcal://x/y.ics", "kalendarz.ics", ""]) {
      const to = await target(addIcalFeed(form({ ...VALID, url })));
      expect(to, `url=${url}`).toContain("adres URL kalendarza");
    }
    expect(feedsCreated).toEqual([]);
  });

  it("nieznany kanał jest odrzucany", async () => {
    expect(await target(addIcalFeed(form({ ...VALID, channel: "TRIVAGO" })))).toContain(
      "Wybierz kanał"
    );
    expect(feedsCreated).toEqual([]);
  });

  it("nieudana pierwsza synchronizacja zostawia feed, ale mówi o błędzie", async () => {
    // adres może być poprawny, a kanał chwilowo niedostępny — kasowanie
    // wpisu kazałoby właścicielowi wklejać go od nowa
    syncResults = [{ ok: false, imported: 0, error: "HTTP 503" }];

    const to = await target(addIcalFeed(form(VALID)));

    expect(feedsCreated).toHaveLength(1);
    expect(to).toContain("synchronizacja nie powiodła się");
    expect(to).toContain("HTTP 503");
  });

  it("cudza jednostka nie dostaje feedu", async () => {
    unit!.unitType.propertyId = 999;

    expect(await target(addIcalFeed(form(VALID)))).toBe("/admin/kanaly");
    expect(feedsCreated).toEqual([]);
  });
});

describe("deleteIcalFeed", () => {
  it("usuwa feed razem z blokadami, które z niego pochodziły", async () => {
    // blokady bez feedu zostałyby na zawsze, bo nic ich już nie odświeży
    await target(deleteIcalFeed(form({ id: "61" })));

    expect(blocksDeletedMany).toEqual([{ feedId: 61 }]);
    expect(feedsDeleted).toEqual([61]);
  });

  it("cudzy feed jest nietykalny", async () => {
    feed!.unit.unitType.propertyId = 999;

    await target(deleteIcalFeed(form({ id: "61" })));

    expect(feedsDeleted).toEqual([]);
    expect(blocksDeletedMany).toEqual([]);
  });
});

describe("syncOneIcalFeed", () => {
  it("synchronizuje wskazany feed i pokazuje liczbę terminów", async () => {
    syncResults = [{ ok: true, imported: 7 }];

    expect(await target(syncOneIcalFeed(form({ id: "61" })))).toBe("/admin/kanaly?synced=7");
    expect(syncedFeeds).toEqual([61]);
  });

  it("błąd wraca z nazwą feedu, żeby było wiadomo który", async () => {
    syncResults = [{ ok: false, imported: 0, error: "To nie jest plik iCal." }];

    const to = await target(syncOneIcalFeed(form({ id: "61" })));

    expect(to).toContain("Booking.com");
    expect(to).toContain("To nie jest plik iCal.");
  });

  it("cudzy feed nie da się zsynchronizować", async () => {
    feed!.unit.unitType.propertyId = 999;

    expect(await target(syncOneIcalFeed(form({ id: "61" })))).toBe("/admin/kanaly");
    expect(syncedFeeds).toEqual([]);
  });
});

describe("syncAllIcalFeeds", () => {
  it("sumuje zaimportowane terminy ze wszystkich feedów obiektu", async () => {
    syncResults = [
      { ok: true, imported: 3 },
      { ok: true, imported: 4 },
    ];

    expect(await target(syncAllIcalFeeds())).toBe("/admin/kanaly?synced=7");
    expect(syncedFeeds).toEqual([61, 62]);
  });

  it("awaria jednego feedu nie przerywa pozostałych, a błędy lądują razem", async () => {
    syncResults = [
      { ok: false, imported: 0, error: "HTTP 500" },
      { ok: true, imported: 4 },
    ];

    const to = await target(syncAllIcalFeeds());

    expect(syncedFeeds).toEqual([61, 62]); // drugi mimo błędu pierwszego
    expect(to).toContain("Booking.com");
    expect(to).toContain("HTTP 500");
  });

  it("wszystkie błędy są wypisane razem, nie tylko pierwszy", async () => {
    syncResults = [
      { ok: false, imported: 0, error: "HTTP 500" },
      { ok: false, imported: 0, error: "timeout" },
    ];

    const to = await target(syncAllIcalFeeds());

    expect(to).toContain("HTTP 500");
    expect(to).toContain("timeout");
  });

  it("brak feedów to zero terminów, bez błędu", async () => {
    feeds = [];

    expect(await target(syncAllIcalFeeds())).toBe("/admin/kanaly?synced=0");
  });
});

describe("deleteInvoice", () => {
  it("usuwa własną fakturę i wraca tam, skąd przyszło żądanie", async () => {
    expect(await target(deleteInvoice(form({ id: "81", back: "/admin/rezerwacje/55" })))).toBe(
      "/admin/rezerwacje/55"
    );
    expect(invoicesDeleted).toEqual([81]);
  });

  it("bez wskazanego powrotu wraca na listę faktur", async () => {
    expect(await target(deleteInvoice(form({ id: "81" })))).toBe("/admin/faktury");
  });

  it("faktura z cudzego obiektu jest nietykalna", async () => {
    invoice!.propertyId = 999;

    await target(deleteInvoice(form({ id: "81" })));

    expect(invoicesDeleted).toEqual([]);
  });

  it("nieistniejąca faktura nie wywraca akcji", async () => {
    invoice = null;

    await target(deleteInvoice(form({ id: "999" })));

    expect(invoicesDeleted).toEqual([]);
  });
});
