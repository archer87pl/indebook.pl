// Wątek czatu gość <-> obiekt (server component — odświeżanie przez reload).
type Msg = { id: number; sender: string; body: string; createdAt: Date };

export default function ChatThread({
  messages,
  viewer,
}: {
  messages: Msg[];
  viewer: "GUEST" | "OWNER";
}) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-slate-400">Brak wiadomości — napisz pierwszą.</p>
    );
  }
  return (
    <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
      {messages.map((m) => {
        const own = m.sender === viewer;
        return (
          <div key={m.id} className={`max-w-[78%] ${own ? "ml-auto text-right" : ""}`}>
            <div
              className={`px-3 py-2 text-left text-[12.5px] leading-relaxed ${
                own
                  ? "rounded-[12px_12px_4px_12px] bg-brand-900 text-[#eaf6ef]"
                  : "rounded-[12px_12px_12px_4px] bg-slate-100 text-slate-900"
              }`}
            >
              <p className="whitespace-pre-line break-words">{m.body}</p>
            </div>
            <p className="mt-1 text-[10.5px] text-slate-400">
              {own ? "Ty" : m.sender === "OWNER" ? "Obiekt" : "Gość"} ·{" "}
              {m.createdAt.toLocaleString("pl-PL", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
