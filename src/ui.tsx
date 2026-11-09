import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "./icons";
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
  multiline = false,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  placeholder: string;
  label: string;
  multiline?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | HTMLTextAreaElement | null>>([]);
  const groupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!multiline) return;
    const fitLines = () => {
      refs.current.forEach((node) => {
        if (!(node instanceof HTMLTextAreaElement)) return;
        node.style.height = "auto";
        node.style.height = `${node.scrollHeight}px`;
      });
    };
    fitLines();
    if (!groupRef.current) return;
    let previousWidth = -1;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === previousWidth) return;
      previousWidth = entry.contentRect.width;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fitLines);
    });
    observer.observe(groupRef.current);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [lines, multiline]);

  function change(next: Line[], focus: number) {
    onChange(next.length > 0 ? next : [{ key: crypto.randomUUID(), text: "", indent: 0 }]);
    window.setTimeout(() => refs.current[focus]?.focus(), 0);
  }

  function onKey(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number) {
    const line = lines[index];
    if (event.key === "Tab") {
      event.preventDefault();
      const indent = Math.max(0, Math.min(6, line.indent + (event.shiftKey ? -1 : 1)));
      onChange(lines.map((item, itemIndex) => (itemIndex === index ? { ...item, indent } : item)));
      return;
    }
    if (event.key === "Enter") {
      if (multiline && event.shiftKey) return;
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
    <div ref={groupRef} className="bullets" role="group" aria-label={label}>
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
            {multiline ? (
              <textarea
                ref={(node) => {
                  refs.current[index] = node;
                }}
                rows={1}
                value={line.text}
                placeholder={index === 0 ? placeholder : ""}
                aria-label={`${label} ${index + 1}`}
                onChange={(event) => {
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                  onChange(lines.map((item, itemIndex) => (itemIndex === index ? { ...item, text: event.target.value } : item)));
                }}
                onKeyDown={(event) => onKey(event, index)}
              />
            ) : (
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
            )}
          </div>
        ),
      )}
    </div>
  );
}

function dueTone(id: string): string {
  if (id === "eod") return "eod";
  if (id === "tomorrow") return "day";
  if (id === "two") return "week";
  if (id === "eow") return "evening";
  return "next";
}

function dueIcon(id: string): "sun" | "clock" | "calendar" | "flag" | "arrow" {
  if (id === "eod") return "sun";
  if (id === "tomorrow") return "clock";
  if (id === "two") return "calendar";
  if (id === "eow") return "flag";
  return "arrow";
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
          className={dueOn === preset.date ? `chip tone-${dueTone(preset.id)} selected` : `chip tone-${dueTone(preset.id)}`}
          aria-pressed={dueOn === preset.date}
          aria-label={`${preset.label}, ${formatDay(preset.date, today)}, for task ${index + 1}`}
          tabIndex={-1}
          onClick={() => onChoose(preset.date)}
        >
          <Icon name={dueIcon(preset.id)} />
          {preset.label}
        </button>
      ))}
      <label className={custom ? "chip tone-progress selected" : "chip tone-progress"}>
        <Icon name="calendar" />
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
        className={dueOn === null ? "chip tone-none selected" : "chip tone-none"}
        aria-pressed={dueOn === null}
        aria-label={`No date for task ${index + 1}`}
        tabIndex={-1}
        onClick={() => onChoose(null)}
      >
        <Icon name="slash" />
        No date
      </button>
    </div>
  );
}

export function BarChart({
  rows,
  title,
  across,
}: {
  rows: { label: string; count: number }[];
  title: string;
  across?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="card chart-card">
      <h2>{title}</h2>
      <div className={across ? "vbars across" : "vbars tall"} role="img" aria-label={title}>
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
