import type { FileSystemTree } from '@webcontainer/api';

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
          "lucide-react": "^0.446.0"
        },
        devDependencies: {
          "@eslint/js": "^9.9.0",
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
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
  'tailwind.config.js': {
      file: {
          contents: `
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
          `
      }
  },
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
              "noFallthroughCasesInSwitch": true
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
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
      `
    }
  },
  'index.css': {
    file: {
      contents: `
@tailwind base;
@tailwind components;
@tailwind utilities;
      `
    }
  },
  'vite-env.d.ts': {
      file: {
          contents: '/// <reference types="vite/client" />'
      }
  }
};

export const TEMPLATES: Record<string, FileSystemTree> = {
  'landing-page': {
    ...commonFiles,
    src: {
      directory: {
        ...commonSrc,
        'App.tsx': {
          file: {
            contents: `
import React from 'react';
import { ArrowRight, CheckCircle, Zap, Shield } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-red-600">Landify</h1>
          <nav>
            <ul className="flex space-x-6 text-gray-600">
              <li className="hover:text-red-600 cursor-pointer">Features</li>
              <li className="hover:text-red-600 cursor-pointer">Pricing</li>
              <li className="hover:text-red-600 cursor-pointer">About</li>
            </ul>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <div className="bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="text-center">
              <h2 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                <span className="block">Build your next idea</span>
                <span className="block text-red-600">faster than ever</span>
              </h2>
              <p className="mt-4 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
                The ultimate starter kit for your next React project. Includes Tailwind CSS, Lucide icons, and a beautiful landing page layout.
              </p>
              <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
                <div className="rounded-md shadow">
                  <a href="#" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-red-600 hover:bg-red-700 md:py-4 md:text-lg md:px-10">
                    Get Started
                  </a>
                </div>
                <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
                  <a href="#" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-red-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10">
                    Learn More
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-12 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:text-center">
              <h2 className="text-base text-red-600 font-semibold tracking-wide uppercase">Features</h2>
              <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                Everything you need
              </p>
            </div>

            <div className="mt-10">
              <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
                <div className="relative">
                  <dt>
                    <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-red-500 text-white">
                      <Zap className="h-6 w-6" />
                    </div>
                    <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Lightning Fast</p>
                  </dt>
                  <dd className="mt-2 ml-16 text-base text-gray-500">
                    Built with Vite for ultra-fast hot module replacement and build times.
                  </dd>
                </div>

                <div className="relative">
                  <dt>
                    <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-red-500 text-white">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Production Ready</p>
                  </dt>
                  <dd className="mt-2 ml-16 text-base text-gray-500">
                    Optimized for production with best practices and type safety.
                  </dd>
                </div>

                <div className="relative">
                  <dt>
                    <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-red-500 text-white">
                      <Shield className="h-6 w-6" />
                    </div>
                    <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Secure by Design</p>
                  </dt>
                  <dd className="mt-2 ml-16 text-base text-gray-500">
                    Follows security best practices to keep your application safe.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
            `
          }
        }
      }
    }
  },
  'dashboard': {
    ...commonFiles,
    src: {
      directory: {
        ...commonSrc,
        'App.tsx': {
          file: {
            contents: `
import React, { useState } from 'react';
import { Home, BarChart2, Users, Settings, Bell, Search, Menu, User } from 'lucide-react';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className={\`bg-gray-800 text-white w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform \${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-200 ease-in-out z-20\`}>
        <div className="flex items-center space-x-2 px-4">
          <BarChart2 className="w-8 h-8 text-red-500" />
          <span className="text-2xl font-extrabold">DashBoard</span>
        </div>

        <nav className="space-y-1">
          <a href="#" className="flex items-center space-x-2 py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700 bg-gray-700 text-white">
            <Home className="w-5 h-5" />
            <span>Dashboard</span>
          </a>
          <a href="#" className="flex items-center space-x-2 py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700 text-gray-400 hover:text-white">
            <Users className="w-5 h-5" />
            <span>Users</span>
          </a>
          <a href="#" className="flex items-center space-x-2 py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700 text-gray-400 hover:text-white">
            <BarChart2 className="w-5 h-5" />
            <span>Analytics</span>
          </a>
          <a href="#" className="flex items-center space-x-2 py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700 text-gray-400 hover:text-white">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex justify-between items-center py-4 px-6 bg-white shadow-sm">
          <div className="flex items-center">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 focus:outline-none md:hidden">
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative mx-4 lg:mx-0 hidden md:block">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                <Search className="h-5 w-5 text-gray-500" />
              </span>
              <input className="form-input w-32 sm:w-64 rounded-md pl-10 pr-4 py-2 border border-gray-300 focus:border-red-500" type="text" placeholder="Search" />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="text-gray-500 hover:text-red-500">
              <Bell className="w-6 h-6" />
            </button>
            <button className="flex items-center space-x-2 text-gray-700 hover:text-red-500">
              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                <User className="w-5 h-5 text-gray-600" />
              </div>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
          <h1 className="text-3xl font-semibold text-gray-800 mb-6">Dashboard Overview</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-red-100 text-red-500">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="ml-4">
                    <p className="mb-2 text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-lg font-semibold text-gray-700">1,234</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 h-64">
             <h3 className="text-lg font-semibold text-gray-700 mb-4">Recent Activity</h3>
             <div className="border-t border-gray-200 pt-4">
               <p className="text-gray-500">Graph or list placeholder...</p>
             </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
            `
          }
        }
      }
    }
  }
};
