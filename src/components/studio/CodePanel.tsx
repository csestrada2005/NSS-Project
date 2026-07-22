import { FileExplorer } from '../FileExplorer';

// ---------------------------------------------------------------------------
// CodePanel — code editor rendered inside CommandModal.
//
// Extraído desde StudioEngine.tsx a nivel de módulo. Antes se definía inline en
// el cuerpo de StudioEngine, por lo que cada re-render del padre recreaba la
// función con identidad nueva y React desmontaba/remontaba el subárbol,
// haciendo que el <textarea> perdiera el foco en cada tecla. Como componente
// module-level la identidad es estable y el foco se conserva. Lo que antes
// tomaba por closure ahora llega como props explícitas.
// ---------------------------------------------------------------------------

interface CodePanelProps {
  files: Map<string, string>;
  selectedFilePath: string | null;
  selectedFileContent: string;
  onFileSelect: (path: string) => void;
  onCodeEdit: (newContent: string) => void;
  onSaveAndRun: () => void;
  isSaving: boolean;
}

export function CodePanel({
  files,
  selectedFilePath,
  selectedFileContent,
  onFileSelect,
  onCodeEdit,
  onSaveAndRun,
  isSaving,
}: CodePanelProps) {
  return (
    <div className="flex w-full h-full bg-background">
      <div className="w-56 border-r border-border h-full overflow-hidden shrink-0">
        <FileExplorer
          files={files}
          onSelect={onFileSelect}
        />
      </div>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
          <span className="text-sm text-muted-foreground truncate">{selectedFilePath || 'No file selected'}</span>
          <button
            onClick={onSaveAndRun}
            disabled={!selectedFilePath || isSaving}
            className="px-3 py-1 bg-primary hover:bg-primary/90 text-white text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save & Run'}
          </button>
        </div>
        <textarea
          value={selectedFileContent}
          onChange={(e) => onCodeEdit(e.target.value)}
          className="flex-1 w-full bg-background text-foreground p-4 font-mono text-sm resize-none focus:outline-none"
          spellCheck={false}
          disabled={!selectedFilePath}
        />
      </div>
    </div>
  );
}
