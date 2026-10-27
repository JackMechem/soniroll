import { lazy, Suspense, type ComponentType } from "react";

/** Stand-in for `next/dynamic`: React.lazy with the loading component as the fallback. */
export default function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>,
  options: { loading?: ComponentType; ssr?: boolean } = {},
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const loaded = await loader();
    return { default: "default" in loaded ? loaded.default : loaded };
  });
  const Loading = options.loading;
  return function DynamicComponent(props: P) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
