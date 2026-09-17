import { useRef, useState } from "react";
import { useDocument } from "../store/useDocument";

export default function Dropzone() {
  const { load, error } = useDocument();
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  function onFiles(files) {
    const file = files?.[0];
    if (file) load(file);
  }

  return (
    <div className="dropzone">
      <div
        className={`drop-card ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <h1>Open a PDF to get started</h1>
        <p>Drag a file here, or choose one from your computer.</p>
        <button className="pick" onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <div className="hint">PDF files up to 100 MB</div>
        {error && <div className="error-line">{error}</div>}
      </div>
    </div>
  );
}
