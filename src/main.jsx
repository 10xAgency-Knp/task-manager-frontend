/**
 * Application Entry Point
 *
 * Mounts the React root element to the DOM tree with React Router DOM v6,
 * activating the future startTransition flag for smooth concurrent rendering.
 */

import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./styles/app.css";
import { router } from "./routes/router.jsx";

const rootContainer = document.getElementById("root");
const reactRoot = createRoot(rootContainer);

reactRoot.render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
