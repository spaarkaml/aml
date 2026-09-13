import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagramBody } from "./DiagramBody";
import { toSvg } from "./format";
import type { Diagram } from "./model";

/**
 * A diagram as a complete `.svg` file (WP-7.1).
 *
 * `renderToStaticMarkup` over the same components the editor mounts, so what is written to
 * the Folio is by construction the picture that was on screen. React is already a dependency;
 * this adds nothing.
 */
export function diagramToSvg(diagram: Diagram): string {
  return toSvg(diagram, renderToStaticMarkup(createElement(DiagramBody, { diagram })));
}
