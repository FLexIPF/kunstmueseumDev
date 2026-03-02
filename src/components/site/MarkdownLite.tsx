export function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/g).map((b) => b.trim()).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {blocks.map((b, i) => (
        <p key={i} style={{ margin: 0, color: "var(--muted)", lineHeight: 1.65 }}>
          {b.split("\n").map((line, j) => (
            <span key={j}>
              {line}
              {j < b.split("\n").length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

