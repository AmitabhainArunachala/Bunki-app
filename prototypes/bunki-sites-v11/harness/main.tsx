import { createRoot } from "react-dom/client";
import "../app/globals.css";
import "../app/phase2.css";
import { BunkiPhase2 } from "../app/components/bunki-phase2";

const root = document.getElementById("root");
if (root) createRoot(root).render(<BunkiPhase2 />);
