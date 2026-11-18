/**
 * 404 Not Found Page
 *
 * Rendered when a route or view does not match any registered navigation targets.
 * Matches the application error design language with full backward compatibility.
 */

import { NotFoundPage } from "./errors/NotFoundPage.jsx";

export function NotFound(props) {
  return <NotFoundPage {...props} />;
}

// Backward compatibility export
export { NotFound as NotFoundPage };
