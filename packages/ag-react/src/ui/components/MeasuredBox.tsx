/**
 * MeasuredBox — render-prop wrapper that exposes its own measured rect.
 *
 * Solves the width=0 flash: components that need to know their host's
 * measured size have historically rolled `useBoxRect() + width > 0 ? … : …`
 * by hand. MeasuredBox makes that pattern a one-liner.
 *
 * ```tsx
 * <MeasuredBox flexDirection="column" alignItems="center">
 *   {({ width }) => <Banner availableWidth={width} />}
 * </MeasuredBox>
 * ```
 *
 * Internals: the outer `<Box>` always renders (it's the node being
 * measured); `useBoxRect()` reads its size; children are rendered only when
 * `width > 0 && height > 0`. Plain ReactNode children are also deferred
 * until measurement is available.
 *
 * Source: bead km-silvery.measuredbox-primitive.
 */
import React from "react"
import { Box, type BoxProps } from "../../components/Box"
import { useBoxRect, type Rect } from "../../hooks/useLayout"

export type MeasuredBoxRect = Pick<Rect, "width" | "height">

export type MeasuredBoxRenderFn = (rect: MeasuredBoxRect) => React.ReactNode

export interface MeasuredBoxProps extends Omit<BoxProps, "children"> {
  /**
   * Either a render function `({ width, height }) => ReactNode` invoked
   * once measurement is available, or plain ReactNode that is deferred
   * until measurement is available.
   */
  children: MeasuredBoxRenderFn | React.ReactNode
}

export function MeasuredBox({ children, ...boxProps }: MeasuredBoxProps): React.ReactElement {
  return (
    <Box {...boxProps}>
      <MeasuredInner>{children}</MeasuredInner>
    </Box>
  )
}

/**
 * Inner consumer that calls `useBoxRect()` against the parent Box. Lives in
 * its own component because `useBoxRect` reads the *enclosing* node, so it
 * needs to be a child of the Box being measured — not the Box itself.
 *
 * STAGE 1 — failing-test stub: render unconditionally so the test fails at
 * the "no width=0 frame" assertion, not at the import.
 */
function MeasuredInner({
  children,
}: {
  children: MeasuredBoxRenderFn | React.ReactNode
}): React.ReactElement | null {
  const rect = useBoxRect()
  if (typeof children === "function") {
    return <>{(children as MeasuredBoxRenderFn)({ width: rect.width, height: rect.height })}</>
  }
  return <>{children}</>
}
