import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wysyłka e-maili do gościa i właściciela. Bez klucza Resend wiadomość ma
// wylądować w konsoli i NIE udawać wysłanej; z kluczem — polecieć do API,
// a każdy wynik (sukces, HTTP błąd, wyjątek sieci) zostawić ślad w dzienniku.
// Awaria poczty nie może wywrócić rezerwacji, w której trakcie jest wołana.

let settings: Record<string, string> = {};
const events: { kind: string; level?: string; message: string; meta?: string }[] = [];

vi.mock("./settings", () => ({
  getSetting: async (key: string) => settings[key] ?? "",
}));
vi.mock("./log", () => ({
  logEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
}));

const { sendMail } = await import("./mailer");

const MAIL = {
  to: "gosc@example.com",
  subject: "Potwierdzenie rezerwacji HO-ABC123",
  body: "Dziękujemy za rezerwację.\nSzczegóły: https://rezflow.pl/r/HO-ABC123",
};

function resendOk() {
  return vi.fn(async () => new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
}

beforeEach(() => {
  settings = {};
  events.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("sendMail bez klucza Resend", () => {
  it("nie dzwoni nigdzie i nie zapisuje zdarzenia „wysłano”", async () => {
    // Cichy tryb deweloperski: wpis w dzienniku sugerowałby, że list poszedł
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendMail(MAIL);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("wypisuje treść na konsolę, żeby dało się ją odczytać lokalnie", async () => {
    await sendMail(MAIL);

    const printed = (console.log as unknown as { mock: { calls: string[][] } }).mock.calls
      .flat()
      .join("\n");
    expect(printed).toContain("gosc@example.com");
    expect(printed).toContain("Potwierdzenie rezerwacji HO-ABC123");
    expect(printed).toContain("Dziękujemy za rezerwację.");
  });
});

describe("sendMail z kluczem Resend", () => {
  beforeEach(() => {
    settings = { RESEND_API_KEY: "re_test_key" };
  });

  it("wysyła do API Resend z kluczem w nagłówku i obiema wersjami treści", async () => {
    const fetchMock = resendOk();
    vi.stubGlobal("fetch", fetchMock);

    await sendMail(MAIL);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");

    const payload = JSON.parse(init.body as string);
    expect(payload.to).toEqual(["gosc@example.com"]);
    expect(payload.subject).toBe(MAIL.subject);
    expect(payload.text).toBe(MAIL.body);
    expect(payload.html).toContain("<");
  });

  it("nadawca z panelu wygrywa z wartością domyślną", async () => {
    settings.EMAIL_FROM = "RezFlow <rezerwacje@willa.pl>";
    const fetchMock = resendOk();
    vi.stubGlobal("fetch", fetchMock);

    await sendMail(MAIL);

    const payload = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    );
    expect(payload.from).toBe("RezFlow <rezerwacje@willa.pl>");
  });

  it("bez ustawionego nadawcy leci adres zapasowy Resend", async () => {
    const fetchMock = resendOk();
    vi.stubGlobal("fetch", fetchMock);

    await sendMail(MAIL);

    const payload = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    );
    expect(payload.from).toContain("onboarding@resend.dev");
  });

  it("udana wysyłka zostawia wpis INFO z adresem odbiorcy", async () => {
    vi.stubGlobal("fetch", resendOk());

    await sendMail(MAIL);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "MAIL", message: expect.stringContaining("Wysłano") });
    expect(events[0].level).toBeUndefined(); // domyślnie INFO
    expect(events[0].meta).toContain("gosc@example.com");
  });

  it("odmowa API kończy się wpisem ERROR, a nie wyjątkiem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("domena nie zweryfikowana", { status: 403 }))
    );

    await expect(sendMail(MAIL)).resolves.toBeUndefined();

    expect(events[0]).toMatchObject({ kind: "MAIL", level: "ERROR" });
    expect(events[0].message).toContain("403");
    expect(events[0].meta).toContain("domena nie zweryfikowana");
  });

  it("padnięta sieć też nie przewraca operacji biznesowej", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ETIMEDOUT");
      })
    );

    await expect(sendMail(MAIL)).resolves.toBeUndefined();

    expect(events[0]).toMatchObject({ kind: "MAIL", level: "ERROR" });
    expect(events[0].meta).toContain("ETIMEDOUT");
  });
});

describe("wersja HTML", () => {
  beforeEach(() => {
    settings = { RESEND_API_KEY: "re_test_key" };
  });

  async function htmlOf(mail: Parameters<typeof sendMail>[0]): Promise<string> {
    const fetchMock = resendOk();
    vi.stubGlobal("fetch", fetchMock);
    await sendMail(mail);
    return JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    ).html;
  }

  it("znaki HTML z treści są ekranowane, a nie wstrzykiwane", async () => {
    // Imię gościa trafia do treści z formularza — bez ekranowania byłby to
    // wektor wstrzyknięcia znaczników do skrzynki właściciela
    const html = await htmlOf({
      to: "a@example.com",
      subject: "Wiadomość",
      body: 'Gość <script>alert("x")</script> pyta o parking',
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("pierwszy link z treści staje się przyciskiem", async () => {
    const html = await htmlOf(MAIL);
    expect(html).toContain("https://rezflow.pl/r/HO-ABC123");
  });

  it("jawne CTA ma pierwszeństwo przed linkiem z treści", async () => {
    const html = await htmlOf({
      ...MAIL,
      cta: { label: "Zamelduj się online", url: "https://rezflow.pl/meldunek/XYZ" },
    });

    expect(html).toContain("Zamelduj się online");
    expect(html).toContain("https://rezflow.pl/meldunek/XYZ");
  });

  it("stopka z nazwą obiektu trafia do szablonu", async () => {
    const html = await htmlOf({ ...MAIL, footer: "Willa Pod Dębem · Zakopane" });
    expect(html).toContain("Willa Pod Dębem");
  });
});
