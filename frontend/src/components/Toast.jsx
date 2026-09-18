import { useEffect } from "react";
import { useDocument } from "../store/useDocument";

export default function Toast() {
  const { toast, dismissToast } = useDocument();
  const isError = toast?.kind === "error";

  useEffect(() => {
    if (!toast) return;
    // errors stay longer so the message can actually be read
    const t = setTimeout(() => dismissToast(), isError ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast, dismissToast, isError]);

  if (!toast) return null;

  return (
    <div className={`toast ${isError ? "error" : ""}`} key={toast.id}>
      <span className="toast-check">{isError ? "!" : "\u2713"}</span>
      {toast.message}
    </div>
  );
}