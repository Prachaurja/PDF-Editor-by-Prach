import { useDocument } from "./store/useDocument";
import TitleBar from "./components/Ribbon/TitleBar";
import Ribbon from "./components/Ribbon/Ribbon";
import ThumbnailRail from "./components/Sidebar/ThumbnailRail";
import PageCanvas from "./components/Viewer/PageCanvas";
import CommentsPanel from "./components/Annotate/CommentsPanel";
import Dropzone from "./components/Dropzone";
import StatusBar from "./components/StatusBar";
import SplitBanner from "./components/SplitBanner";
import Toast from "./components/Toast";

export default function App() {
  const { doc, loading, ribbonTab } = useDocument();

  return (
    <div className="app">
      <TitleBar />
      {doc && <Ribbon />}
      <SplitBanner />
      <div className="workspace">
        {doc ? (
          <>
            {/* The left rail is the page navigator on every tab EXCEPT Pages,
                where the ribbon's page strip is the preview — so there is
                never two sets of thumbnails on screen at once. */}
            {ribbonTab !== "pages" && <ThumbnailRail />}
            <PageCanvas />
            <CommentsPanel />
          </>
        ) : loading ? (
          <div className="dropzone">
            <div style={{ textAlign: "center" }}>
              <span className="spinner" />
              <p style={{ marginTop: 12, color: "var(--ink-soft)" }}>
                Loading document...
              </p>
            </div>
          </div>
        ) : (
          <Dropzone />
        )}
      </div>
      <StatusBar />
      <Toast />
    </div>
  );
}