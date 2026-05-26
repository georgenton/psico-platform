// author/app.jsx — Root of the Author Studio prototype.
// Mounts a DesignCanvas with 4 artboards: Dashboard, Book Structure,
// Editor (Substack split), Editor (Notion-style). Each artboard hosts a
// full instance of its screen so the user can pan or focus any of them.

function AuthorApp() {
  return (
    <DesignCanvas>
      <DCSection id="overview" title="Author Studio" subtitle="Dashboard del autor y manejo del catálogo">
        <DCArtboard id="dashboard" label="Dashboard del autor" width={1200} height={780}>
          <window.Dashboard/>
        </DCArtboard>
        <DCArtboard id="structure" label="Estructura del libro" width={1200} height={780}>
          <window.BookStructure/>
        </DCArtboard>
      </DCSection>

      <DCSection id="editor" title="Editor de lección" subtitle="Dos variaciones — split (Substack) y WYSIWYG (Notion)">
        <DCArtboard
          id="editor-substack"
          label="Variación A · Substack split (recomendada)"
          width={1400}
          height={820}
        >
          <window.EditorSubstack/>
        </DCArtboard>
        <DCArtboard
          id="editor-notion"
          label="Variación B · Notion-style WYSIWYG"
          width={1180}
          height={820}
        >
          <window.EditorNotion/>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

window.AuthorApp = AuthorApp;
