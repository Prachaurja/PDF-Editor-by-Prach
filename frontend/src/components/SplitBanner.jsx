import { useDocument } from "../store/useDocument";
import { rawUrl } from "../api/client";

export default function SplitBanner() {
  const { splitResult, clearSplitResult } = useDocument();
  if (!splitResult) return null;

  const { first, second } = splitResult;

  return (
    <div className="split-banner">
      <span>
        Split into two documents: {first.page_count} pages and{" "}
        {second.page_count} pages.
      </span>
      <div className="split-actions">
        <a href={rawUrl(first.file_id)} download="part-1.pdf">
          Download part 1
        </a>
        <a href={rawUrl(second.file_id)} download="part-2.pdf">
          Download part 2
        </a>
        <button onClick={clearSplitResult}>Dismiss</button>
      </div>
    </div>
  );
}
