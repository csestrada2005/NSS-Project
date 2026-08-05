import type { FileSystemTree } from '@webcontainer/api';
import { SHADCN_FILES, SHADCN_DEPENDENCIES } from './utils/shadcnDefaults';

const commonFiles = {
  'package.json': {
    file: {
      contents: JSON.stringify({
        name: "vite-react-starter",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          lint: "eslint .",
          preview: "vite preview"
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          "react-router-dom": "^6.26.2",
          ...SHADCN_DEPENDENCIES
        },
        devDependencies: {
          "@eslint/js": "^9.9.0",
          "@types/node": "^22.5.5",
          "@types/react": "^18.3.3",
          "@types/react-dom": "^18.3.0",
          "@vitejs/plugin-react": "^4.3.1",
          autoprefixer: "^10.4.20",
          eslint: "^9.9.0",
          "eslint-plugin-react-hooks": "^5.1.0-rc.0",
          "eslint-plugin-react-refresh": "^0.4.9",
          globals: "^15.9.0",
          postcss: "^8.4.47",
          tailwindcss: "^3.4.13",
          typescript: "^5.5.3",
          "typescript-eslint": "^8.0.1",
          vite: "^5.4.1"
        }
      }, null, 2)
    }
  },
  'vite.config.ts': {
    file: {
      contents: `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
  }
})
      `
    }
  },
  'postcss.config.js': {
      file: {
          contents: `
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
          `
      }
  },
  'tailwind.config.js': SHADCN_FILES['tailwind.config.js'],
  'components.json': SHADCN_FILES['components.json'],
  'index.html': {
    file: {
      contents: `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
      `
    }
  },
  'tsconfig.json': {
      file: {
          contents: JSON.stringify({
            "files": [],
            "references": [
              { "path": "./tsconfig.app.json" },
              { "path": "./tsconfig.node.json" }
            ]
          }, null, 2)
      }
  },
  'tsconfig.app.json': {
      file: {
          contents: JSON.stringify({
            "compilerOptions": {
              "target": "ES2020",
              "useDefineForClassFields": true,
              "lib": ["ES2020", "DOM", "DOM.Iterable"],
              "module": "ESNext",
              "skipLibCheck": true,
              "moduleResolution": "bundler",
              "allowImportingTsExtensions": true,
              "resolveJsonModule": true,
              "isolatedModules": true,
              "noEmit": true,
              "jsx": "react-jsx",
              "strict": true,
              "noUnusedLocals": true,
              "noUnusedParameters": true,
              "noFallthroughCasesInSwitch": true,
              "baseUrl": ".",
              "paths": {
                "@/*": ["./src/*"]
              }
            },
            "include": ["src"]
          }, null, 2)
      }
  },
  'tsconfig.node.json': {
      file: {
          contents: JSON.stringify({
            "compilerOptions": {
              "target": "ES2022",
              "lib": ["ES2023"],
              "module": "ESNext",
              "skipLibCheck": true,
              "moduleResolution": "bundler",
              "allowImportingTsExtensions": true,
              "isolatedModules": true,
              "moduleDetection": "force",
              "noEmit": true,
              "strict": true,
              "noUnusedLocals": true,
              "noUnusedParameters": true,
              "noFallthroughCasesInSwitch": true
            },
            "include": ["vite.config.ts"]
          }, null, 2)
      }
  }
};

const commonSrc = {
  'main.tsx': {
    file: {
      contents: `
import { StrictMode, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ErrorBoundary del preview (P0-4). Sin él, un error de render deja la pantalla
// en blanco sin pista de qué falló. Aquí se muestra un fallback neutro y se
// reporta al Studio (window.parent) el error con su componentStack real, misma
// convención plana que el resto de mensajes del preview (type + campos planos).
interface PreviewErrorBoundaryState {
  error: Error | null
  componentName: string
}

class PreviewErrorBoundary extends Component<{ children: ReactNode }, PreviewErrorBoundaryState> {
  state: PreviewErrorBoundaryState = { error: null, componentName: '' }

  static getDerivedStateFromError(error: Error): Partial<PreviewErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentStack = info.componentStack || ''
    // Primera línea del componentStack: "    in ContactSection (created by App)"
    // (o "    at ContactSection" en versiones nuevas de React).
    const match = componentStack.match(/(?:in|at)\\s+([A-Za-z0-9_$]+)/)
    const componentName = match ? match[1] : 'un componente'
    this.setState({ componentName })
    try {
      window.parent.postMessage({
        type: 'preview-runtime-error',
        message: error.message,
        stack: error.stack || null,
        componentStack,
        componentName,
        source: 'error-boundary',
      }, '*')
    } catch {
      /* window.parent inaccesible: no romper el fallback por el reporte */
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '24px',
            textAlign: 'center',
            background: '#0a0a0f',
            color: '#e5e7eb',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 600 }}>
            Something went wrong in {this.state.componentName}
          </div>
          <div style={{ fontSize: '13px', color: '#9ca3af', maxWidth: '480px' }}>
            {this.state.error.message}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreviewErrorBoundary>
      <App />
    </PreviewErrorBoundary>
  </StrictMode>,
)
      `
    }
  },
  'App.tsx': {
    file: {
      contents: `
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Layout from "./components/layout/Layout";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
      `
    }
  },
  'index.css': SHADCN_FILES['src/index.css'],
  'vite-env.d.ts': {
      file: {
          contents: '/// <reference types="vite/client" />'
      }
  },
  'lib': {
      directory: {
          'utils.ts': SHADCN_FILES['src/lib/utils.ts']
      }
  },
  'pages': {
      directory: {
          'Index.tsx': {
              file: {
                  contents: `
import React from 'react';

const Index = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
      <h1 className="text-4xl font-bold mb-4">Welcome to Your New App</h1>
      <p className="text-xl text-gray-500 mb-8">
        This is a starter template with React, Tailwind, and Shadcn UI.
      </p>
      <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
        Get Started
      </button>
    </div>
  );
};

export default Index;
                  `
              }
          },
          'NotFound.tsx': {
              file: {
                  contents: `
import React from "react";
import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-4">Oops! Page not found</p>
        <Link to="/" className="text-blue-500 hover:text-blue-700 underline">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
                  `
              }
          }
      }
  },
  'components': {
      directory: {
          'ui': {
              directory: {
                  '.gitkeep': {
                      file: { contents: '' }
                  }
              }
          },
          'layout': {
              directory: {
                  'Layout.tsx': {
                      file: {
                          contents: `
import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

const Layout = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow w-full">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
                          `
                      }
                  },
                  'Header.tsx': {
                      file: {
                          contents: `
import React from 'react';
import { Link } from 'react-router-dom';

const Header = () => {
  return (
    <header className="border-b bg-white">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link to="/" className="text-xl font-bold">App Name</Link>
        <nav>
          <ul className="flex space-x-4">
            <li><Link to="/" className="hover:underline">Home</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
                          `
                      }
                  },
                  'Footer.tsx': {
                      file: {
                          contents: `
import React from 'react';

const Footer = () => {
  return (
    <footer className="border-t bg-gray-50 mt-auto">
      <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Your Company. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
                          `
                      }
                  }
              }
          }
      }
  },
  'hooks': {
      directory: {
          '.gitkeep': {
              file: { contents: '' }
          }
      }
  }
};

export const TEMPLATES: Record<string, FileSystemTree> = {
  'landing-page': {
    ...commonFiles,
    src: {
      directory: {
        ...commonSrc
      }
    }
  },
  'dashboard': {
    ...commonFiles,
    src: {
      directory: {
        ...commonSrc
      }
    }
  }
};
