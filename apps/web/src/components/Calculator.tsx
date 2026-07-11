"use client";

import { useRef, useState } from "react";

// On-screen four-function calculator with memory, shown only in Quant sections
// (matches the ETS on-screen calculator, not a scientific one). Draggable.
export function Calculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const [memory, setMemory] = useState(0);

  const [pos, setPos] = useState({ x: 40, y: 120 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const inputDigit = (d: string) => {
    if (fresh) {
      setDisplay(d === "." ? "0." : d);
      setFresh(false);
    } else {
      if (d === "." && display.includes(".")) return;
      setDisplay(display + d);
    }
  };

  const apply = (a: number, b: number, o: string): number => {
    switch (o) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? NaN : a / b;
      default: return b;
    }
  };

  const chooseOp = (o: string) => {
    const cur = parseFloat(display);
    if (acc !== null && op && !fresh) {
      const r = apply(acc, cur, op);
      setAcc(r);
      setDisplay(String(r));
    } else {
      setAcc(cur);
    }
    setOp(o);
    setFresh(true);
  };

  const equals = () => {
    if (acc === null || !op) return;
    const r = apply(acc, parseFloat(display), op);
    setDisplay(Number.isNaN(r) ? "Error" : String(r));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const clear = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const unary = (fn: (n: number) => number) => {
    const r = fn(parseFloat(display));
    setDisplay(Number.isNaN(r) ? "Error" : String(r));
    setFresh(true);
  };

  const btn =
    "h-10 rounded border border-testline bg-white text-sm hover:bg-neutral-100 active:bg-neutral-200";

  return (
    <div
      className="fixed z-50 w-56 select-none rounded-lg border border-neutral-400 bg-neutral-200 p-2 shadow-xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="mb-2 flex cursor-move items-center justify-between rounded bg-neutral-700 px-2 py-1 text-xs text-white"
        onMouseDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          const move = (ev: MouseEvent) => {
            if (drag.current) setPos({ x: ev.clientX - drag.current.dx, y: ev.clientY - drag.current.dy });
          };
          const up = () => {
            drag.current = null;
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }}
      >
        <span>Calculator</span>
        <button onClick={onClose} className="px-1 font-bold" aria-label="close calculator">
          ×
        </button>
      </div>

      <div className="mb-2 rounded border border-testline bg-white px-2 py-2 text-right font-mono text-lg">
        {display}
      </div>

      <div className="grid grid-cols-4 gap-1">
        <button className={btn} onClick={() => setMemory(memory + parseFloat(display))}>M+</button>
        <button className={btn} onClick={() => setMemory(memory - parseFloat(display))}>M-</button>
        <button className={btn} onClick={() => { setDisplay(String(memory)); setFresh(true); }}>MR</button>
        <button className={btn} onClick={() => setMemory(0)}>MC</button>

        {["7", "8", "9"].map((d) => (
          <button key={d} className={btn} onClick={() => inputDigit(d)}>{d}</button>
        ))}
        <button className={btn} onClick={() => chooseOp("/")}>÷</button>

        {["4", "5", "6"].map((d) => (
          <button key={d} className={btn} onClick={() => inputDigit(d)}>{d}</button>
        ))}
        <button className={btn} onClick={() => chooseOp("*")}>×</button>

        {["1", "2", "3"].map((d) => (
          <button key={d} className={btn} onClick={() => inputDigit(d)}>{d}</button>
        ))}
        <button className={btn} onClick={() => chooseOp("-")}>−</button>

        <button className={btn} onClick={() => inputDigit("0")}>0</button>
        <button className={btn} onClick={() => inputDigit(".")}>.</button>
        <button className={btn} onClick={() => unary((n) => Math.sqrt(n))}>√</button>
        <button className={btn} onClick={() => chooseOp("+")}>+</button>

        <button className={btn} onClick={() => unary((n) => -n)}>±</button>
        <button className={`${btn} col-span-2`} onClick={clear}>C</button>
        <button className={`${btn} bg-testblue text-white hover:bg-testblue`} onClick={equals}>=</button>
      </div>
    </div>
  );
}
