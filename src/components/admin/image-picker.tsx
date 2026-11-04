"use client";
import { useEffect, useRef, useState } from "react";

const MAX_EDGE = 2000;
const MAX_FILES = 8;
const BODY_BUDGET = 3.8 * 1024 * 1024; // keeps the whole request under the 4 MB server limit

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 900 * 1024) {
    bmp.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/**
 * File input for photos: previews, multi-select, and in-browser resizing (max 2000px, JPEG) so
 * phone photos upload quickly and stay under the hosting request limit. The server re-encodes again.
 */
export function ImagePicker({ name = "file", multiple = true, label = "Photos", required = true }: { name?: string; multiple?: boolean; label?: string; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => {
      setPreviews((p) => {
        p.forEach((u) => URL.revokeObjectURL(u));
        return [];
      });
      setNote(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const all = [...(input.files ?? [])];
    const picked = all.slice(0, multiple ? MAX_FILES : 1);
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews([]);
    setNote(null);
    if (!picked.length) return;
    setBusy(true);
    try {
      const out = await Promise.all(picked.map(shrink));
      let total = 0;
      const kept: File[] = [];
      for (const f of out) {
        if (total + f.size > BODY_BUDGET) break;
        total += f.size;
        kept.push(f);
      }
      const dt = new DataTransfer();
      kept.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      setPreviews(kept.map((f) => URL.createObjectURL(f)));
      const dropped = picked.length - kept.length;
      const extra = all.length > picked.length ? ` Only the first ${picked.length} are used per upload.` : "";
      setNote(`${kept.length} photo${kept.length === 1 ? "" : "s"} ready (${(total / 1024 / 1024).toFixed(1)} MB).${dropped > 0 ? ` ${dropped} left out to keep the upload small — add them in a second upload.` : ""}${extra}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block">
        <span className="field-label">
          {label}
          {required && " *"}
        </span>
        <input ref={ref} type="file" name={name} accept="image/jpeg,image/png,image/webp" multiple={multiple} required={required} onChange={onChange} className="field file:mr-3 file:rounded file:border-0 file:bg-forest-800 file:px-3 file:py-1 file:text-white" />
      </label>
      {busy && <p className="mt-1 text-xs text-muted">Preparing photos…</p>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      {previews.length > 0 && (
        <ul className="mt-2 grid grid-cols-4 gap-1.5">
          {previews.map((u) => (
            <li key={u} className="aspect-square overflow-hidden rounded border border-sand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
