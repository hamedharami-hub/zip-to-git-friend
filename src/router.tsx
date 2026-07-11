import { QueryClient } from "@tanstack/react-query";
import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div
      dir="rtl"
      className="min-h-[60dvh] flex flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <div className="text-4xl">⚠️</div>
      <h1 className="text-xl font-semibold">مشکلی پیش آمد</h1>
      <p className="text-sm text-muted-foreground max-w-md break-words">
        {error?.message || "خطای ناشناخته"}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm"
        >
          تلاش دوباره
        </button>
        <button
          onClick={() => {
            window.location.href = "/";
          }}
          className="rounded-full border px-4 py-2 text-sm"
        >
          صفحه‌ی اصلی
        </button>
      </div>
    </div>
  );
}

function DefaultNotFound() {
  return (
    <div
      dir="rtl"
      className="min-h-[60dvh] flex flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <div className="text-5xl">🧭</div>
      <h1 className="text-xl font-semibold">صفحه پیدا نشد</h1>
      <p className="text-sm text-muted-foreground">آدرس درست نیست یا صفحه حذف شده.</p>
      <a
        href="/"
        className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm mt-2"
      >
        صفحه‌ی اصلی
      </a>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultError,
    defaultNotFoundComponent: DefaultNotFound,
  });

  return router;
};
