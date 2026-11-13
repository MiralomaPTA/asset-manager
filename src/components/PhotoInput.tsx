"use client";

import { useId, useRef, useState } from "react";
import { preparePhoto } from "@/lib/photo-client";
import { CameraIcon, XIcon } from "@/components/Icons";

/**
 * A photo field that takes a picture or picks one from the library. The
 * chosen photo is shrunk in the browser and put back into the same input,
 * so the form sends the small version.
 */
export function PhotoInput({ name, label, current, hint }: { name: string; label: string; current?: string; hint?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    setError(null);
    if (!file || !input.current) return;
    setBusy(true);
    try {
      const small = await preparePhoto(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      input.current.files = dt.files;
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(small);
      });
    } catch (e) {
      input.current.value = "";
      setPreview(null);
      setError(e instanceof Error ? e.message : "Couldn't use that photo.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    if (input.current) input.current.value = "";
    setPreview(null);
  }

  const shown = preview ?? current;
  return (
    <div className="flex flex-col gap-2">
      <span className="label mb-0">{label}</span>
      {hint && <p className="hint -mt-1">{hint}</p>}
      <div className="flex items-center gap-2.5">
        {shown && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or our own photo route */}
            <img src={shown} alt="Chosen photo" className="h-[84px] w-[84px] rounded-xl border border-line object-cover" />
            {preview && (
              <button type="button" onClick={clear} aria-label="Remove this photo" className="absolute -top-2 -right-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-muted">
                <XIcon size={14} />
              </button>
            )}
          </div>
        )}
        <label
          htmlFor={id}
          className="flex h-[84px] w-[84px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-[#9a9da4] bg-white text-[13px] font-bold text-brand"
        >
          <CameraIcon size={24} />
          {busy ? "…" : shown ? "Replace" : "Add"}
        </label>
        <input ref={input} id={id} name={name} type="file" accept="image/*,.heic,.heif" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      </div>
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
    </div>
  );
}
