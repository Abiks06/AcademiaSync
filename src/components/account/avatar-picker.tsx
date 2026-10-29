"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/app/app-shell";
import { SPRING } from "@/components/motion/tokens";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { setAvatar } from "@/lib/profile/actions";

const SIZE = 320;
const MAX_INPUT = 15 * 1024 * 1024;

/** Crops the picture to a centred square and shrinks it, so uploads are small and always square. */
async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob) throw new Error("encode failed");
  return blob;
}

/**
 * Your picture, with a camera button to change it. Drop an image on it, or choose one.
 * The browser crops it square and uploads it straight to Storage; the server then points
 * the profile at it.
 */
export function AvatarPicker({ userId, name, url, onChange }: { userId: string; name: string; url: string | null; onChange?: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const shown = preview ?? url;

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return toast({ title: "Choose an image", description: "PNG, JPEG or WebP works best.", tone: "error" });
    if (file.size > MAX_INPUT) return toast({ title: "That image is too large", description: "Choose one under 15 MB.", tone: "error" });
    setBusy(true);
    try {
      const blob = await squareImage(file);
      // Safari may hand back PNG when asked for WebP.
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
      const path = `${userId}/${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const local = URL.createObjectURL(blob);
      setPreview(local);
      const { error } = await createClient().storage.from("avatars").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (error) throw error;
      const result = await setAvatar(path);
      if (!result.ok) throw new Error(result.error);
      onChange?.(local);
      toast({ title: "Picture updated", tone: "success" });
      router.refresh();
    } catch (e) {
      setPreview(null);
      const message = e instanceof Error && e.message && !/fetch|network/i.test(e.message) ? e.message : "Check your connection and try again.";
      toast({ title: "Couldn't change your picture", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const result = await setAvatar(null).catch(() => ({ ok: false as const, error: "Check your connection and try again." }));
    setBusy(false);
    if (!result.ok) return toast({ title: "Couldn't remove your picture", description: result.error, tone: "error" });
    setPreview(null);
    onChange?.(null);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <motion.button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        disabled={busy}
        animate={{ scale: over ? 1.08 : 1 }}
        transition={SPRING.snappy}
        className="group relative rounded-full outline-offset-4"
        aria-label="Change your picture"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={shown ?? "none"}
            className="block"
            initial={{ opacity: 0, scale: 0.8, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={SPRING.glide}
          >
            <Avatar name={name || "You"} url={shown} size={72} />
          </motion.span>
        </AnimatePresence>
        <span className={`absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white transition-opacity ${busy || over ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </span>
        {over && <span className="absolute -inset-1.5 rounded-full border-2 border-dashed border-iris" aria-hidden />}
      </motion.button>
      <div className="text-sm">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="font-medium text-iris hover:underline underline-offset-4">
          {shown ? "Change picture" : "Add a picture"}
        </button>
        <p className="mt-0.5 text-xs text-faint">Shown beside your edits and comments. Drop an image here, too.</p>
        {shown && (
          <button type="button" onClick={remove} disabled={busy} className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-danger">
            <Trash2 className="h-3 w-3" aria-hidden /> Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
