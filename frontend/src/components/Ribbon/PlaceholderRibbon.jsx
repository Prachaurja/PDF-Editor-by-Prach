import { useDocument } from "../../store/useDocument";

/* A "coming next" ribbon tab: shows exactly what will live here (the
 * rendered roadmap), styled like the Convert & export reference card grid. */
export default function PlaceholderRibbon({ config }) {
  const { doc } = useDocument();
  return (
    <div className="ph">
      <div className="ph-head">
        <h2>{config.title}</h2>
        {config.fileHeader && doc && (
          <span className="ph-file">
            {doc.filename} · {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
          </span>
        )}
        <span className="ph-badge">Planned</span>
      </div>
      {config.note && <p className="ph-note">{config.note}</p>}
      <div className={`ph-grid ${config.grid === 2 ? "ph-grid-2" : ""}`}>
        {config.items.map((it) => (
          <div key={it.title} className="ph-card">
            <div className="ph-tile" style={{ background: it.tileBg, color: it.tileColor }}>
              {it.tile}
            </div>
            <div className="ph-info">
              <div className="ph-title">{it.title}</div>
              <div className="ph-sub">{it.sub}</div>
            </div>
            <span className="ph-item-badge">{it.badge}</span>
          </div>
        ))}
      </div>
    </div>
  );
}