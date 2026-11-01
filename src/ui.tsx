import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { duePresets, formatDay } from "./logic";

export type Line = { key: string; text: string; indent: number; done?: boolean; folded?: boolean };

export function linesFromText(text: string): Line[] {
  const rows = text.split("\n").map((row) => {
    const indent = Math.min(6, Math.floor((row.match(/^ */)?.[0].length ?? 0) / 2));
    return { key: crypto.randomUUID(), text: row.trim(), indent };
  });
  return rows.some((row) => row.text) ? rows : [{ key: crypto.randomUUID(), text: "", indent: 0 }];
}

export function BulletList({
  lines,
  onChange,
  placeholder,
  label,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  placeholder: string;
  label: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function change(next: Line[], focus: number) {
    onChange(next.length > 0 ? next : [{ key: crypto.randomUUID(), text: "", indent: 0 }]);
    window.setTimeout(() => refs.current[focus]?.focus(), 0);
  }

  function onKey(event: ReactKeyboardEvent<HTMLInputElement>, index: number) {
    const line = lines[index];
    if (event.key === "Tab") {
      event.preventDefault();
      const indent = Math.max(0, Math.min(6, line.indent + (event.shiftKey ? -1 : 1)));
      onChange(lines.map((item, itemIndex) => (itemIndex === index ? { ...item, indent } : item)));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const next = [...lines];
      next.splice(index + 1, 0, { key: crypto.randomUUID(), text: "", indent: line.indent });
      change(next, index + 1);
      return;
    }
    if (event.key === "Backspace" && line.text === "" && lines.length > 1) {
      event.preventDefault();
      change(lines.filter((_, itemIndex) => itemIndex !== index), Math.max(0, index - 1));
    }
  }

  const hidden = new Set<number>();
  lines.forEach((line, index) => {
    if (!line.folded) return;
    for (let cursor = index + 1; cursor < lines.length && lines[cursor].indent > line.indent; cursor += 1) hidden.add(cursor);
  });

  return (
    <div className="bullets" role="group" aria-label={label}>
      {lines.map((line, index) =>
        hidden.has(index) ? null : (
          <div className="bullet-row" key={line.key} style={{ paddingLeft: line.indent * 22 }}>
            <button
              type="button"
              className="bullet-mark"
              aria-label={line.folded ? "Open this line" : "Fold lines under this one"}
              onClick={() => onChange(lines.map((item, itemIndex) => (itemIndex === index ? { ...item, folded: !item.folded } : item)))}
            >
              {line.folded ? "▸" : "•"}
            </button>
            <input
              ref={(node) => {
                refs.current[index] = node;
              }}
              value={line.text}
              placeholder={index === 0 ? placeholder : ""}
              aria-label={`${label} ${index + 1}`}
              onChange={(event) =>
                onChange(lines.map((item, itemIndex) => (itemIndex === index ? { ...item, text: event.target.value } : item)))
              }
              onKeyDown={(event) => onKey(event, index)}
            />
          </div>
        ),
      )}
    </div>
  );
}

export function DueChips({
  dueOn,
  today,
  index,
  onChoose,
}: {
  dueOn: string | null;
  today: string;
  index: number;
  onChoose: (dueOn: string | null) => void;
}) {
  const presets = duePresets(today);
  const custom = dueOn !== null && !presets.some((preset) => preset.date === dueOn);

  function onArrows(event: ReactKeyboardEvent<HTMLDivElement>) {
    const order = [...presets.map((preset) => preset.date), null];
    const current = order.findIndex((date) => date === dueOn);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = order[(current + step + order.length) % order.length];
      onChoose(next);
    }
  }

  return (
    <div className="chips due-chips" role="group" aria-label={`Due date for task ${index + 1}`} tabIndex={0} onKeyDown={onArrows}>
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={dueOn === preset.date ? "chip selected" : "chip"}
          aria-pressed={dueOn === preset.date}
          aria-label={`${preset.label}, ${formatDay(preset.date, today)}, for task ${index + 1}`}
          tabIndex={-1}
          onClick={() => onChoose(preset.date)}
        >
          {preset.label}
        </button>
      ))}
      <label className={custom ? "chip selected" : "chip"}>
        Pick a date
        <input
          className="sr-only"
          type="date"
          tabIndex={-1}
          value={custom ? dueOn ?? "" : ""}
          aria-label={`Pick a date for task ${index + 1}`}
          onChange={(event) => onChoose(event.target.value || null)}
        />
      </label>
      <button
        type="button"
        className={dueOn === null ? "chip selected" : "chip"}
        aria-pressed={dueOn === null}
        aria-label={`No date for task ${index + 1}`}
        tabIndex={-1}
        onClick={() => onChoose(null)}
      >
        No date
      </button>
    </div>
  );
}

export function BarChart({ rows, title }: { rows: { label: string; count: number }[]; title: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="card chart-card">
      <h2>{title}</h2>
      <div className="vbars tall" role="img" aria-label={title}>
        {rows.map((row) => (
          <div className="vbar" key={row.label}>
            <span className="vbar-count">{row.count}</span>
            <div className="vbar-track">
              <div className={row.count === 0 ? "vbar-fill empty" : "vbar-fill"} style={{ height: `${(row.count / max) * 100}%` }} />
            </div>
            <span className="vbar-label">{row.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
