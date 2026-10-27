import type { Instrumentation } from "next";

/**
 * Every server error, as one structured line in the Vercel logs: which route, what kind of
 * render, and the digest the error page shows, so a person's report can be matched to it.
 * Headers and bodies are left out: they carry cookies and manuscript text.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      source: "academiasync",
      message: error.message.slice(0, 500),
      digest,
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: "renderSource" in context ? context.renderSource : undefined,
      stack: error.stack?.split("\n").slice(0, 6).join("\n"),
    }),
  );
};
