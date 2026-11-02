"use client";
export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary mt-8 print:hidden">
      Print / Save as PDF
    </button>
  );
}
