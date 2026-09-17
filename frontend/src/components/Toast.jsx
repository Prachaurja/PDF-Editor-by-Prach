import { useEffect } from "react";
import { useDocument } from "../store/useDocument";

export default function Toast() {
  const { toast, dismissToast } = useDocument();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismissToast(), 2200);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div className="toast" key={toast.id}>
      <span className="toast-check">&#10003;</span>
      {toast.message}
    </div>
  );
}
