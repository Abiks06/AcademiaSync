"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { FolderKanban, LogOut, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { accentColor, initials } from "./accent";

type ShellProps = {
  user: { name: string; email: string; avatarUrl: string | null };
  projects: { id: string; name: string; accent: string }[];
  children: React.ReactNode;
};

export function AppShell({ user, projects, children }: ShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-bg-elev/50 lg:block">
        <SidebarContent user={user} projects={projects} />
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-bg-elev lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 rounded-lg p-1.5 text-muted hover:bg-iris-soft"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent user={user} projects={projects} onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-lg lg:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-iris-soft">
            <Menu className="h-5 w-5" />
          </button>
          <Logo className="h-6 w-6" />
          <span className="font-semibold">AcademiaSync</span>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  user,
  projects,
  onNavigate,
}: Omit<ShellProps, "children"> & { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col p-4">
      <Link href="/projects" onClick={onNavigate} className="mb-8 flex items-center gap-2 px-2 font-semibold tracking-tight">
        <Logo className="h-7 w-7" />
        AcademiaSync
      </Link>

      <LayoutGroup id="sidebar">
        <nav className="flex flex-col gap-0.5 text-sm">
          <NavItem href="/projects" active={pathname === "/projects"} onClick={onNavigate}>
            <FolderKanban className="h-4 w-4" /> All projects
          </NavItem>

          <p className="mt-6 mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Recent</p>
          {projects.length === 0 && <p className="px-3 text-xs text-faint">Projects you join appear here.</p>}
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <NavItem href={`/projects/${p.id}`} active={pathname.startsWith(`/projects/${p.id}`)} onClick={onNavigate}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accentColor(p.accent) }} />
                <span className="truncate">{p.name}</span>
              </NavItem>
            </motion.div>
          ))}
        </nav>
      </LayoutGroup>

      <div className="mt-auto flex items-center gap-3 rounded-xl border border-line p-2.5">
        <Avatar name={user.name} url={user.avatarUrl} />
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate font-medium text-ink">{user.name}</p>
          <p className="truncate text-faint">{user.email}</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button aria-label="Sign out" title="Sign out" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-iris-soft hover:text-ink">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function NavItem({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-lg border border-line bg-iris-soft"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className="relative flex min-w-0 items-center gap-2.5">{children}</span>
    </Link>
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-iris to-teal text-[11px] font-semibold text-bg"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}
