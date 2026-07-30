import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";

const ImageLightbox = lazy(() =>
  import("./ImageLightbox").then((m) => ({ default: m.ImageLightbox })),
);

type Props = ComponentProps<typeof ImageLightbox>;

export function LazyImageLightbox(props: Props) {
  return (
    <Suspense fallback={null}>
      <ImageLightbox {...props} />
    </Suspense>
  );
}
