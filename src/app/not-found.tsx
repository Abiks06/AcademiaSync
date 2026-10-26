import { NotFoundView } from "@/components/app/not-found-view";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <NotFoundView href="/" label="Go to the home page" />
    </main>
  );
}
