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
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {messages.map((m) => {
        const own = m.sender === viewer;
        return (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              own ? "ml-auto bg-brand-700 text-white" : "bg-slate-100 text-slate-800"
            }`}
          >
            <p className="whitespace-pre-line break-words">{m.body}</p>
            <p
              className={`text-[10px] mt-1 ${own ? "text-white/70" : "text-slate-400"}`}
            >
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
