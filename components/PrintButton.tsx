"use client";

export default function PrintButton({ label = "🖨 Drukuj" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary print:hidden"
    >
      {label}
    </button>
  );
}
