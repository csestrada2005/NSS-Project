export interface InjectionPattern {
  id: string;
  triggerDescription: string;
  dependencies: string[];
  codeContext: string;
  rules: [string, string, string];
  maxTokenEstimate: number;
  incompatibleWith: string[];
}

export const PATTERN_DATA: InjectionPattern[] = [
  {
    "id": "supabase-react-auth-context",
    "triggerDescription": "Inject this pattern when setting up a global authentication state manager using Supabase and React Context.",
    "dependencies": [
      "@supabase/supabase-js",
      "react"
    ],
    "codeContext": "import { createContext, useContext, useState, useEffect, ReactNode } from 'react';\nimport { createClient, User, Session } from '@supabase/supabase-js';\n\nexport const supabase = createClient(\n  import.meta.env.VITE_SUPABASE_URL as string,\n  import.meta.env.VITE_SUPABASE_ANON_KEY as string,\n  { auth: { persistSession: true, autoRefreshToken: true } }\n);\n\ninterface AuthState {\n  isLoggedIn: boolean;\n  user: User | null;\n  session: Session | null;\n  loading: boolean;\n  signOut: () => Promise<void>;\n}\n\nconst AuthContext = createContext<AuthState>({} as AuthState);\n\nexport const AuthProvider = ({ children }: { children: ReactNode }) => {\n  const [user, setUser] = useState<User | null>(null);\n  const [session, setSession] = useState<Session | null>(null);\n  const [loading, setLoading] = useState(true);\n\n  useEffect(() => {\n    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {\n      setSession(session);\n      setUser(session?.user ?? null);\n      setLoading(false);\n    });\n\n    supabase.auth.getSession().then(({ data: { session } }) => {\n      setSession(session);\n      setUser(session?.user ?? null);\n      setLoading(false);\n    });\n\n    return () => subscription.unsubscribe();\n  }, []);\n\n  const signOut = async () => await supabase.auth.signOut();\n\n  return (\n    <AuthContext.Provider value={{ isLoggedIn: !!session, user, session, loading, signOut }}>\n      {children}\n    </AuthContext.Provider>\n  );\n};\n\nexport const useAuth = () => useContext(AuthContext);",
    "rules": [
      "Extract the Supabase createClient initialization outside of the React component lifecycle to prevent client recreation on every re-render.",
      "Register the supabase.auth.onAuthStateChange listener immediately before calling supabase.auth.getSession() within the useEffect to guarantee no auth events are missed during initialization.",
      "Invoke subscription.unsubscribe() in the useEffect cleanup function to detach the listener when the provider unmounts."
    ],
    "maxTokenEstimate": 350,
    "incompatibleWith": [
      "firebase-auth-flow",
      "next-auth-flow"
    ]
  },
  {
    "id": "shopify-storefront-cart-flow",
    "triggerDescription": "Inject this pattern when building a headless e-commerce storefront that requires fetching products and managing a persistent shopping cart via the Shopify Storefront GraphQL API.",
    "dependencies": [
      "react",
      "@tanstack/react-query"
    ],
    "codeContext": "import { createContext, useContext, useState, useEffect, ReactNode } from 'react';\nimport { useQuery } from '@tanstack/react-query';\n\nexport interface Product { id: string; title: string; price: number; }\ninterface CartItem { product: Product; quantity: number; lineId?: string; }\n\nconst STORE_URL = `https://${import.meta.env.VITE_SHOPIFY_DOMAIN}/api/2024-01/graphql.json`;\n\nasync function shopifyFetch<T>(query: string, variables = {}): Promise<T> {\n  const res = await fetch(STORE_URL, {\n    method: 'POST',\n    headers: {\n      'Content-Type': 'application/json',\n      'X-Shopify-Storefront-Access-Token': import.meta.env.VITE_SHOPIFY_TOKEN\n    },\n    body: JSON.stringify({ query, variables }),\n  });\n  if (!res.ok) throw new Error('Shopify API Error');\n  return (await res.json()).data;\n}\n\nexport function useProducts() {\n  return useQuery({\n    queryKey: ['products'],\n    queryFn: async () => {\n      const data = await shopifyFetch<any>(`query { products(first: 50) { edges { node { id title } } } }`);\n      return data.products.edges.map((e: any) => e.node as Product);\n    },\n    staleTime: 300000,\n  });\n}\n\ninterface CartContextType {\n  items: CartItem[];\n  addItem: (p: Product) => Promise<void>;\n  cartId: string | null;\n}\nconst CartContext = createContext<CartContextType | undefined>(undefined);\n\nexport function CartProvider({ children }: { children: ReactNode }) {\n  const [items, setItems] = useState<CartItem[]>([]);\n  const [cartId, setCartId] = useState<string | null>(localStorage.getItem('cartId'));\n\n  useEffect(() => {\n    cartId ? localStorage.setItem('cartId', cartId) : localStorage.removeItem('cartId');\n  }, [cartId]);\n\n  const addItem = async (product: Product) => {\n    if (!cartId) {\n      const res = await shopifyFetch<any>(`mutation { cartCreate { cart { id } } }`);\n      setCartId(res.cartCreate.cart.id);\n    }\n    setItems(prev => [...prev, { product, quantity: 1 }]);\n  };\n\n  return <CartContext.Provider value={{ items, addItem, cartId }}>{children}</CartContext.Provider>;\n}\n\nexport const useCart = () => {\n  const ctx = useContext(CartContext);\n  if (!ctx) throw new Error('useCart must be used within a CartProvider');\n  return ctx;\n};",
    "rules": [
      "Wrap context access inside a custom hook (useCart) and immediately throw an error if the context is undefined to guarantee type safety and prevent usage outside the Provider.",
      "Synchronize the cart ID state with localStorage inside a useEffect hook to persist the active e-commerce session across browser reloads.",
      "Fetch storefront products using the useQuery hook from @tanstack/react-query with a defined staleTime to cache GraphQL responses and minimize redundant network requests."
    ],
    "maxTokenEstimate": 450,
    "incompatibleWith": [
      "woocommerce-cart-sync",
      "stripe-direct-checkout"
    ]
  },
  {
    "id": "react-spa-provider-routing",
    "triggerDescription": "When setting up the root architecture of a React Single Page Application requiring global query state, UI provider wrapping, and client-side routing.",
    "dependencies": [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query"
    ],
    "codeContext": "import { createRoot } from 'react-dom/client';\nimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';\nimport { BrowserRouter, Routes, Route } from 'react-router-dom';\n\nconst queryClient = new QueryClient({\n  defaultOptions: {\n    queries: {\n      staleTime: 1000 * 60 * 5,\n      retry: 1,\n      refetchOnWindowFocus: false,\n    },\n  },\n});\n\nconst AppUIProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;\nconst DefaultRoute = () => <div>Default</div>;\nconst CatchAllRoute = () => <div>Not Found</div>;\n\nconst App = () => (\n  <QueryClientProvider client={queryClient}>\n    <AppUIProvider>\n      <BrowserRouter>\n        <Routes>\n          <Route path=\"/\" element={<DefaultRoute />} />\n          <Route path=\"*\" element={<CatchAllRoute />} />\n        </Routes>\n      </BrowserRouter>\n    </AppUIProvider>\n  </QueryClientProvider>\n);\n\nconst rootElement = document.getElementById('root');\nif (rootElement) {\n  createRoot(rootElement).render(<App />);\n}",
    "rules": [
      "Instantiate the QueryClient instance strictly outside of the React component tree to prevent recreation of the client on every re-render.",
      "Wrap the BrowserRouter component strictly inside global state providers (like QueryClientProvider) so that routed components can consume global contexts.",
      "Define the catch-all wildcard route (path=\"*\") strictly as the final child of the Routes component to safely handle unmatched URLs."
    ],
    "maxTokenEstimate": 180,
    "incompatibleWith": [
      "nextjs-app-router",
      "remix-file-routing"
    ]
  },
  {
    "id": "secure-ai-sse-stream",
    "triggerDescription": "When building a React hook to securely call an AI backend service and consume a Server-Sent Events (SSE) stream for real-time text generation.",
    "dependencies": [
      "react",
      "@supabase/supabase-js"
    ],
    "codeContext": "import { useState } from 'react';\nimport { SupabaseClient } from '@supabase/supabase-js';\n\ntype Role = 'user' | 'assistant';\ntype Message = { role: Role; content: string };\n\nexport const useSecureAiStream = (supabase: SupabaseClient, endpointUrl: string) => {\n  const [messages, setMessages] = useState<Message[]>([]);\n  const [streamingContent, setStreamingContent] = useState('');\n\n  const sendMessage = async (userContent: string) => {\n    setMessages((prev) => [...prev, { role: 'user', content: userContent }]);\n    setStreamingContent('');\n\n    const { data: sessionData } = await supabase.auth.getSession();\n    const token = sessionData.session?.access_token || '';\n\n    const response = await fetch(endpointUrl, {\n      method: 'POST',\n      headers: {\n        'Content-Type': 'application/json',\n        'Authorization': `Bearer ${token}`,\n      },\n      body: JSON.stringify({ content: userContent }),\n    });\n\n    if (!response.body) throw new Error('No response body');\n\n    const reader = response.body.getReader();\n    const decoder = new TextDecoder();\n    let accumulated = '';\n\n    while (true) {\n      const { done, value } = await reader.read();\n      if (done) break;\n\n      const chunk = decoder.decode(value, { stream: true });\n      const lines = chunk.split('\\n');\n\n      for (const line of lines) {\n        if (line.startsWith('data: ') && !line.includes('[DONE]')) {\n          try {\n            const parsed = JSON.parse(line.slice(6));\n            const textChunk = parsed.content || '';\n            accumulated += textChunk;\n            setStreamingContent(accumulated);\n          } catch (e) {\n            // Ignore partial JSON chunks until complete\n          }\n        }\n      }\n    }\n\n    setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }]);\n    setStreamingContent('');\n  };\n\n  return { messages, streamingContent, sendMessage };\n};",
    "rules": [
      "Retrieve the session access token using supabase.auth.getSession() immediately prior to the fetch call to prevent authenticating with expired credentials.",
      "Attach the retrieved access token to the fetch request using the 'Authorization: Bearer' header pattern to securely identify the client to the backend.",
      "Process the response.body.getReader() stream chunk-by-chunk using a TextDecoder instantiated with { stream: true } to correctly assemble multi-byte characters across network payloads."
    ],
    "maxTokenEstimate": 380,
    "incompatibleWith": [
      "apollo-graphql-client",
      "swr-data-fetching"
    ]
  },
  {
    "id": "supabase-pgvector-rag-storage",
    "triggerDescription": "Inject this pattern when building a RAG system that requires semantic document storage, chunking with metadata, and similarity-based retrieval using Supabase and pgvector.",
    "dependencies": [
      "@supabase/supabase-js",
      "langchain",
      "@langchain/openai",
      "@langchain/community"
    ],
    "codeContext": "import { createClient, SupabaseClient } from '@supabase/supabase-js';\nimport { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';\nimport { Embeddings } from '@langchain/core/embeddings';\nimport { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';\n\ntype VectorDocument = { id: string; content: string; metadata: Record<string, any>; similarity?: number };\n\nexport class RAGManager {\n  private client: SupabaseClient;\n  private vectorStore: SupabaseVectorStore;\n\n  constructor(url: string, key: string, embeddings: Embeddings, tableName: string) {\n    this.client = createClient(url, key);\n    this.vectorStore = new SupabaseVectorStore(embeddings, {\n      client: this.client,\n      tableName: tableName,\n      queryName: 'match_documents',\n    });\n  }\n\n  async ingest(text: string, metadata: Record<string, any>): Promise<void> {\n    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });\n    const docs = await splitter.createDocuments([text], [metadata]);\n    await this.vectorStore.addDocuments(docs);\n  }\n\n  async search(query: string, filter: Record<string, any>, limit: number = 5): Promise<VectorDocument[]> {\n    const results = await this.client.rpc('match_documents', {\n      query_embedding: await this.vectorStore.embeddings.embedQuery(query),\n      match_threshold: 0.5,\n      match_count: limit,\n      filter_metadata: filter\n    });\n    return results.data || [];\n  }\n}",
    "rules": [
      "Always use the @> containment operator in the PostgreSQL RPC function to filter JSONB metadata, ensuring efficient index usage during similarity scans.",
      "Initialize the RecursiveCharacterTextSplitter with an explicit chunkOverlap to preserve semantic context across chunk boundaries during the ingest phase.",
      "Pair the SupabaseVectorStore with a custom PostgreSQL RPC function (match_documents) to allow for complex server-side metadata filtering that standard LangChain vector store abstractions often abstract away."
    ],
    "maxTokenEstimate": 420,
    "incompatibleWith": [
      "firebase-firestore-search",
      "local-storage-vector-cache"
    ]
  },
  {
    "id": "high-fidelity-motion-system",
    "triggerDescription": "Inject this pattern when building immersive, performance-optimized creative websites requiring scroll-synchronized reveals and high-performance animation hooks.",
    "dependencies": [
      "framer-motion",
      "react"
    ],
    "codeContext": "import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';\nimport { motion, useReducedMotion } from 'framer-motion';\n\ntype EaseArray = [number, number, number, number];\nconst EASE_PREMIUM: EaseArray = [0.16, 1, 0.3, 1];\n\ninterface RevealProps {\n  children: ReactNode;\n  threshold?: number;\n  delay?: number;\n}\n\nexport const useScrollState = (threshold = 20) => {\n  const [state, setState] = useState({ isScrolled: false, progress: 0 });\n  const rafRef = useRef<number | null>(null);\n\n  const update = useCallback(() => {\n    const y = window.scrollY;\n    const height = document.documentElement.scrollHeight - window.innerHeight;\n    setState({\n      isScrolled: y > threshold,\n      progress: height > 0 ? Math.min(y / height, 1) : 0\n    });\n    rafRef.current = null;\n  }, [threshold]);\n\n  useEffect(() => {\n    const handle = () => {\n      if (rafRef.current === null) rafRef.current = requestAnimationFrame(update);\n    };\n    window.addEventListener('scroll', handle, { passive: true });\n    update();\n    return () => {\n      window.removeEventListener('scroll', handle);\n      if (rafRef.current) cancelAnimationFrame(rafRef.current);\n    };\n  }, [update]);\n  return state;\n};\n\nexport const MotionReveal = ({ children, delay = 0 }: RevealProps) => {\n  const reduced = useReducedMotion();\n  return (\n    <motion.div\n      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}\n      whileInView={{ opacity: 1, y: 0 }}\n      viewport={{ once: true, margin: '-40px' }}\n      transition={{ duration: 0.6, delay, ease: EASE_PREMIUM }}\n    >\n      {children}\n    </motion.div>\n  );\n};",
    "rules": [
      "Throttle all window scroll events using requestAnimationFrame and a ref-based guard inside useScrollState to prevent layout thrashing and main-thread blocking.",
      "Implement useReducedMotion within the MotionReveal component to conditionally disable Y-axis translations for users with accessibility preferences.",
      "Utilize the whileInView prop with viewport.once: true to trigger entrance animations exactly once as elements enter the visible bounds of the document."
    ],
    "maxTokenEstimate": 450,
    "incompatibleWith": [
      "standard-css-animations",
      "gsap-scroll-trigger-legacy"
    ]
  },
  {
    "id": "headless-provider-abstraction",
    "triggerDescription": "Implement this pattern when integrating a headless third-party API requiring GraphQL data fetching, external-to-internal entity mapping, and remote state synchronization with local storage.",
    "dependencies": [
      "react",
      "@tanstack/react-query"
    ],
    "codeContext": "import { createContext, useContext, useState, useEffect, ReactNode } from 'react';\nimport { useQuery } from '@tanstack/react-query';\n\nconst API_URL = import.meta.env.VITE_API_URL;\n\nexport async function apiRequest<T>(query: string, variables = {}): Promise<T> {\n  const res = await fetch(API_URL, {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ query, variables }),\n  });\n  if (!res.ok) throw new Error('HTTP Error');\n  return res.json();\n}\n\ntype ExternalEntity = { node: { id: string; name: string } };\ntype InternalEntity = { id: string; displayName: string };\n\nconst mapEntity = (ext: ExternalEntity): InternalEntity => ({\n  id: ext.node.id,\n  displayName: ext.node.name,\n});\n\nexport function useEntities() {\n  return useQuery({\n    queryKey: ['entities'],\n    queryFn: async () => {\n      const data = await apiRequest<{ data: { items: { edges: ExternalEntity[] } } }>('QUERY');\n      return data.data.items.edges.map(mapEntity);\n    },\n  });\n}\n\ntype StateContextType = {\n  items: InternalEntity[];\n  addItem: (item: InternalEntity) => Promise<void>;\n  remoteId: string | null;\n};\n\nconst StateContext = createContext<StateContextType | undefined>(undefined);\n\nexport const StateProvider = ({ children }: { children: ReactNode }) => {\n  const [items, setItems] = useState<InternalEntity[]>([]);\n  const [remoteId, setRemoteId] = useState<string | null>(localStorage.getItem('remoteId'));\n\n  useEffect(() => {\n    if (remoteId) localStorage.setItem('remoteId', remoteId);\n    else localStorage.removeItem('remoteId');\n  }, [remoteId]);\n\n  const addItem = async (item: InternalEntity) => {\n    const res = await apiRequest<{ data: { id: string } }>('MUTATION', { id: item.id });\n    if (!remoteId && res.data.id) setRemoteId(res.data.id);\n    setItems((prev) => [...prev, item]);\n  };\n\n  return (\n    <StateContext.Provider value={{ items, addItem, remoteId }}>\n      {children}\n    </StateContext.Provider>\n  );\n};\n\nexport const useStateContext = () => {\n  const ctx = useContext(StateContext);\n  if (!ctx) throw new Error('useStateContext must be used within StateProvider');\n  return ctx;\n};",
    "rules": [
      "Always isolate the external provider's data structure from the application by mapping it to an internal interface (e.g., using a mapEntity function) immediately after fetching.",
      "Always synchronize persistent remote identifiers with localStorage inside a useEffect hook that uses the identifier as its sole dependency to guarantee reference retention across browser reloads.",
      "Always throw a descriptive Error inside the custom context consumer hook (useStateContext) if the context evaluates to undefined to enforce provider boundary constraints."
    ],
    "maxTokenEstimate": 480,
    "incompatibleWith": [
      "apollo-graphql-client",
      "redux-global-store"
    ]
  },
  {
    "id": "scroll-reveal-interaction",
    "triggerDescription": "Inject this pattern when the user needs to progressively reveal layout elements on scroll with staggered delays while respecting native accessibility motion preferences.",
    "dependencies": [
      "react"
    ],
    "codeContext": "import { useEffect, useRef, useState, forwardRef, type ReactNode } from 'react';\n\ninterface RevealProps {\n  children: ReactNode;\n  delayMs?: number;\n  distancePx?: number;\n  durationMs?: number;\n  threshold?: number;\n}\n\nexport const Reveal = forwardRef<HTMLDivElement, RevealProps>((\n  { children, delayMs = 0, distancePx = 14, durationMs = 620, threshold = 0.12 },\n  _ref\n) => {\n  const innerRef = useRef<HTMLDivElement>(null);\n  const [isVisible, setIsVisible] = useState(false);\n\n  const prefersReduced = typeof window !== 'undefined' &&\n    window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n\n  useEffect(() => {\n    if (prefersReduced) { setIsVisible(true); return; }\n    const el = innerRef.current;\n    if (!el) return;\n\n    const observer = new IntersectionObserver(([entry]) => {\n      if (entry.isIntersecting) {\n        setIsVisible(true);\n        observer.disconnect();\n      }\n    }, { threshold });\n\n    observer.observe(el);\n    return () => observer.disconnect();\n  }, [prefersReduced, threshold]);\n\n  return (\n    <div\n      ref={innerRef}\n      style={{\n        opacity: isVisible ? 1 : 0,\n        transform: isVisible ? 'translateY(0)' : `translateY(${distancePx}px)`,\n        transition: prefersReduced ? 'none' : `opacity ${durationMs}ms cubic-bezier(.22,1,.36,1) ${delayMs}ms, transform ${durationMs}ms cubic-bezier(.22,1,.36,1) ${delayMs}ms`\n      }}\n    >\n      {children}\n    </div>\n  );\n});\nReveal.displayName = 'Reveal';",
    "rules": [
      "Evaluate window.matchMedia('(prefers-reduced-motion: reduce)').matches synchronously before initializing the IntersectionObserver to respect accessibility preferences and immediately set component visibility to true.",
      "Disconnect the IntersectionObserver immediately inside the observer callback when entry.isIntersecting evaluates to true to prevent redundant React state updates and unmount memory leaks.",
      "Apply transformation and opacity transitions strictly via inline styles to ensure the delayMs and durationMs React props are atomically bound to the render cycle without relying on external CSS classes."
    ],
    "maxTokenEstimate": 250,
    "incompatibleWith": [
      "framer-motion-reveal",
      "gsap-scroll-trigger"
    ]
  },
  {
    "id": "supabase-ecommerce-subscription",
    "triggerDescription": "Inject this pattern when scaffolding a full-stack e-commerce application that requires persistent local cart state with mutually exclusive subscriptions, alongside Supabase authentication.",
    "dependencies": [
      "@supabase/supabase-js",
      "zustand",
      "react"
    ],
    "codeContext": "import { useEffect, useState } from 'react';\nimport { User, Session, createClient } from '@supabase/supabase-js';\nimport { create } from 'zustand';\nimport { persist } from 'zustand/middleware';\n\nexport const supabaseClient = createClient(\n  import.meta.env.VITE_SUPABASE_URL as string,\n  import.meta.env.VITE_SUPABASE_ANON_KEY as string\n);\n\nexport function useStoreAuth() {\n  const [authState, setAuthState] = useState<{ user: User | null; session: Session | null }>({\n    user: null,\n    session: null\n  });\n\n  useEffect(() => {\n    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_, session) => {\n      setAuthState({ user: session?.user ?? null, session });\n    });\n\n    supabaseClient.auth.getSession().then(({ data: { session } }) => {\n      setAuthState({ user: session?.user ?? null, session });\n    });\n\n    return () => subscription.unsubscribe();\n  }, []);\n\n  return authState;\n}\n\nexport interface EntityItem {\n  id: string;\n  price: number;\n  quantity: number;\n  isSubscription?: boolean;\n}\n\nexport interface StoreState {\n  items: EntityItem[];\n  addItem: (item: Omit<EntityItem, 'quantity'>) => void;\n  getSubtotal: () => number;\n}\n\nexport const useEntityStore = create<StoreState>()(\n  persist(\n    (set, get) => ({\n      items: [],\n      addItem: (item) => set((state) => {\n        if (item.isSubscription) {\n          const nonSubItems = state.items.filter((i) => !i.isSubscription);\n          return { items: [...nonSubItems, { ...item, quantity: 1 }] };\n        }\n        const existing = state.items.find((i) => i.id === item.id);\n        if (existing) {\n          return { items: state.items.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i) };\n        }\n        return { items: [...state.items, { ...item, quantity: 1 }] };\n      }),\n      getSubtotal: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),\n    }),\n    { name: 'entity-storage' }\n  )\n);",
    "rules": [
      "Always setup the Supabase auth listener via onAuthStateChange BEFORE calling getSession() to avoid race conditions and ensure the initial session state is captured reliably.",
      "Always return a cleanup function from the auth useEffect that calls subscription.unsubscribe() on the auth listener to prevent memory leaks during component unmounts.",
      "Always replace any existing subscription items in the Zustand store when adding a new subscription item (via isSubscription check), ensuring only one mutually exclusive subscription exists in the cart array at a time."
    ],
    "maxTokenEstimate": 380,
    "incompatibleWith": [
      "redux-cart-flow",
      "firebase-auth-flow",
      "context-only-cart"
    ]
  },
  {
    "id": "hybrid-domain-routing",
    "triggerDescription": "Inject this pattern when an application needs to serve multiple distinct business verticals or sub-apps with independent layouts and seamless page transitions under a single unified SPA.",
    "dependencies": [
      "react-router-dom",
      "framer-motion",
      "react"
    ],
    "codeContext": "import React, { cloneElement } from 'react';\nimport { BrowserRouter, Routes, Route, useLocation, useOutlet } from 'react-router-dom';\nimport { AnimatePresence, motion } from 'framer-motion';\n\nexport const AnimatedOutlet = () => {\n  const location = useLocation();\n  const outlet = useOutlet();\n  return (\n    <AnimatePresence mode=\"wait\">\n      <motion.div\n        key={location.pathname}\n        initial={{ opacity: 0 }}\n        animate={{ opacity: 1 }}\n        exit={{ opacity: 0 }}\n      >\n        {outlet && cloneElement(outlet, { key: location.pathname })}\n      </motion.div>\n    </AnimatePresence>\n  );\n};\n\nexport const DomainALayout = () => (\n  <div className=\"layout-a\">\n    <AnimatedOutlet />\n  </div>\n);\n\nexport const DomainBLayout = () => (\n  <div className=\"layout-b\">\n    <AnimatedOutlet />\n  </div>\n);\n\nexport const HybridRoutes = () => {\n  const location = useLocation();\n  const topKey = '/' + (location.pathname.split('/')[1] || '');\n\n  return (\n    <AnimatePresence mode=\"wait\">\n      <Routes location={location} key={topKey}>\n        <Route path=\"/\" element={<div>Root</div>} />\n        <Route element={<DomainALayout />}>\n          <Route path=\"/app-a\" element={<div>A Index</div>} />\n          <Route path=\"/app-a/sub\" element={<div>A Sub</div>} />\n        </Route>\n        <Route element={<DomainBLayout />}>\n          <Route path=\"/app-b\" element={<div>B Index</div>} />\n          <Route path=\"/app-b/sub\" element={<div>B Sub</div>} />\n        </Route>\n      </Routes>\n    </AnimatePresence>\n  );\n};\n\nexport const App = () => (\n  <BrowserRouter>\n    <HybridRoutes />\n  </BrowserRouter>\n);",
    "rules": [
      "Always derive the top-level Routes component's key prop using the first path segment (e.g., location.pathname.split('/')[1]) to force layout-level unmount/remount transitions when switching between distinct hybrid domains.",
      "Always wrap the nested route rendering logic in an AnimatedOutlet that clones the useOutlet() result with a key set to location.pathname to prevent stale component rendering during exit animations.",
      "Always wrap both the top-level Routes and nested motion.div components in AnimatePresence with mode='wait' to ensure the outgoing layout or page fully animates out before the incoming one mounts."
    ],
    "maxTokenEstimate": 250,
    "incompatibleWith": [
      "standard-single-layout-router"
    ]
  },
  {
    "id": "serverless-ai-integration-flow",
    "triggerDescription": "When integrating a third-party LLM API that requires secure credential management, structured JSON outputs, and resilient frontend error handling with fallbacks.",
    "dependencies": [
      "react"
    ],
    "codeContext": "import { useState } from 'react';\n\nexport interface AIRequest { prompt: string; }\nexport interface AIResponse { result: string; confidence: number; }\n\nexport async function fetchFromAI(req: AIRequest, apiKey: string): Promise<AIResponse> {\n  const res = await fetch('https://api.provider.ai/v1/completions', {\n    method: 'POST',\n    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },\n    body: JSON.stringify({\n      messages: [{ role: 'user', content: req.prompt }],\n      response_format: { type: 'json_object' }\n    })\n  });\n  if (!res.ok) throw new Error(`API Error: ${res.status}`);\n  const data = await res.json();\n  return JSON.parse(data.choices[0].message.content) as AIResponse;\n}\n\nasync function invokeAIEndpoint(payload: AIRequest): Promise<AIResponse> {\n  const res = await fetch('/api/invoke-ai', {\n    method: 'POST',\n    body: JSON.stringify(payload)\n  });\n  if (!res.ok) throw new Error('Network error');\n  return res.json();\n}\n\nexport function useAIFeature() {\n  const [loading, setLoading] = useState(false);\n  const [data, setData] = useState<AIResponse | null>(null);\n\n  const execute = async (payload: AIRequest, fallbackData: AIResponse) => {\n    setLoading(true);\n    try {\n      const result = await invokeAIEndpoint(payload);\n      setData(result);\n    } catch (error) {\n      console.error('AI Request failed, using fallback:', error);\n      setData(fallbackData);\n    } finally {\n      setLoading(false);\n    }\n  };\n\n  return { execute, loading, data };\n}",
    "rules": [
      "Isolate the third-party fetch call inside a backend or edge function to securely pass the Authorization header without exposing the API key to the client.",
      "Enforce structured data returns by explicitly defining a response_format parameter in the fetch body payload to guarantee the LLM returns parsable JSON.",
      "Implement a deterministic fallback data mechanism in the frontend catch block to ensure the UI gracefully degrades and remains functional when the AI API times out or fails."
    ],
    "maxTokenEstimate": 280,
    "incompatibleWith": [
      "client-side-direct-llm-call"
    ]
  },
  {
    "id": "saas-protected-dashboard-shell",
    "triggerDescription": "Inject this pattern when initializing the foundational routing and authentication shell for a secure dashboard or CRM application.",
    "dependencies": [
      "react",
      "react-router-dom",
      "@supabase/supabase-js"
    ],
    "codeContext": "import React, { createContext, useContext, useEffect, useState } from 'react';\nimport { Outlet, Navigate, BrowserRouter, Routes, Route } from 'react-router-dom';\nimport { createClient, Session } from '@supabase/supabase-js';\n\nconst supabase = createClient(\n  import.meta.env.VITE_SUPABASE_URL as string,\n  import.meta.env.VITE_SUPABASE_ANON_KEY as string\n);\n\ntype AuthContextType = { session: Session | null; loading: boolean };\nconst AuthContext = createContext<AuthContextType>({ session: null, loading: true });\n\nexport const AuthProvider = ({ children }: { children: React.ReactNode }) => {\n  const [session, setSession] = useState<Session | null>(null);\n  const [loading, setLoading] = useState(true);\n\n  useEffect(() => {\n    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {\n      setSession(session);\n      setLoading(false);\n    });\n\n    supabase.auth.getSession().then(({ data }) => {\n      setSession(data.session);\n      setLoading(false);\n    });\n\n    return () => subscription.unsubscribe();\n  }, []);\n\n  return (\n    <AuthContext.Provider value={{ session, loading }}>\n      {children}\n    </AuthContext.Provider>\n  );\n};\n\nexport const useAuth = () => useContext(AuthContext);\n\nexport const ProtectedLayout = () => {\n  const { session, loading } = useAuth();\n\n  if (loading) return <div>Loading...</div>;\n  if (!session) return <Navigate to=\"/login\" replace />;\n\n  return (\n    <div>\n      <nav>Sidebar</nav>\n      <main><Outlet /></main>\n    </div>\n  );\n};\n\nexport const AppShell = () => (\n  <BrowserRouter>\n    <AuthProvider>\n      <Routes>\n        <Route path=\"/login\" element={<div>Login</div>} />\n        <Route element={<ProtectedLayout />}>\n          <Route path=\"/\" element={<div>Dashboard</div>} />\n          <Route path=\"/entities\" element={<div>Entities</div>} />\n        </Route>\n      </Routes>\n    </AuthProvider>\n  </BrowserRouter>\n);",
    "rules": [
      "Register the onAuthStateChange listener before calling getSession() inside the useEffect to ensure no auth state transitions are missed during the initial mount race condition.",
      "Implement route protection using a layout component (ProtectedLayout) that explicitly checks the loading state before evaluating the session state to prevent premature redirects to public routes.",
      "Manage the cleanup of the auth state listener by returning subscription.unsubscribe() within the useEffect cleanup function to prevent memory leaks during component unmounts."
    ],
    "maxTokenEstimate": 380,
    "incompatibleWith": [
      "generic-unprotected-landing",
      "stateless-widget-embed"
    ]
  },
  {
    "id": "react-context-rbac",
    "triggerDescription": "Inject this pattern when the application requires rendering components or restricting routes conditionally based on user roles fetched from an auth provider.",
    "dependencies": [
      "react",
      "react-router-dom"
    ],
    "codeContext": "import { createContext, useContext, useState, ReactNode } from 'react';\nimport { Navigate, Outlet } from 'react-router-dom';\n\nexport type AppRole = 'role_a' | 'role_b' | 'default';\nexport type AppResource = 'feature_x' | 'feature_y' | 'feature_z';\n\ninterface AccessContextType {\n  role: AppRole;\n  setRole: (role: AppRole) => void;\n  hasAccess: (resource: AppResource) => boolean;\n}\n\nconst ACCESS_MAP: Record<AppRole, AppResource[]> = {\n  role_a: ['feature_x', 'feature_y', 'feature_z'],\n  role_b: ['feature_x'],\n  default: [],\n};\n\nconst AccessContext = createContext<AccessContextType>({\n  role: 'default',\n  setRole: () => {},\n  hasAccess: () => false,\n});\n\nexport const AccessProvider = ({ children }: { children: ReactNode }) => {\n  const [role, setRole] = useState<AppRole>('default');\n\n  const hasAccess = (resource: AppResource): boolean =>\n    ACCESS_MAP[role]?.includes(resource) ?? false;\n\n  return (\n    <AccessContext.Provider value={{ role, setRole, hasAccess }}>\n      {children}\n    </AccessContext.Provider>\n  );\n};\n\nexport const useAccess = () => useContext(AccessContext);\n\nexport const ProtectedRoute = ({\n  resource,\n  children,\n  fallback,\n}: {\n  resource: AppResource;\n  children: ReactNode;\n  fallback: ReactNode;\n}) => {\n  const { hasAccess } = useAccess();\n  return hasAccess(resource) ? <>{children}</> : <>{fallback}</>;\n};\n\nexport const RoleProtectedLayout = ({ resource, redirectTo = '/login' }: { resource: AppResource; redirectTo?: string }) => {\n  const { hasAccess } = useAccess();\n  if (!hasAccess(resource)) return <Navigate to={redirectTo} replace />;\n  return <Outlet />;\n};",
    "rules": [
      "Define the ACCESS_MAP as a static constant outside the provider component to prevent reallocation on every render and guarantee a single source of truth.",
      "Safeguard the hasAccess function using optional chaining and nullish coalescing (ACCESS_MAP[role]?.includes(resource) ?? false) to default to access denial on unmapped roles.",
      "Use RoleProtectedLayout with React Router's Outlet for route-level protection and ProtectedRoute for component-level conditional rendering \u2014 never mix the two approaches for the same resource."
    ],
    "maxTokenEstimate": 290,
    "incompatibleWith": [
      "redux-rbac-sync"
    ]
  },
  {
    "id": "integrated-conversational-ai-agent",
    "triggerDescription": "Inject this pattern when the application requires an interactive, context-aware AI chat interface that maintains local conversation history and integrates dynamically injected application state.",
    "dependencies": [
      "react"
    ],
    "codeContext": "import { useState, useRef, useEffect, useCallback } from 'react';\n\ninterface Message { role: 'agent' | 'user'; text: string; }\n\nexport const AgentChat = ({ endpoint, fetchContext }: { endpoint: string; fetchContext: () => string }) => {\n  const [messages, setMessages] = useState<Message[]>([]);\n  const [input, setInput] = useState('');\n  const [isLoading, setIsLoading] = useState(false);\n  const scrollRef = useRef<HTMLDivElement>(null);\n\n  useEffect(() => {\n    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;\n  }, [messages]);\n\n  const sendMessage = useCallback(async (text: string) => {\n    if (!text.trim() || isLoading) return;\n    setMessages(prev => [...prev, { role: 'user', text }]);\n    setInput('');\n    setIsLoading(true);\n\n    const apiMessages = [...messages.map(m => ({\n      role: m.role === 'agent' ? 'assistant' : 'user',\n      content: m.text\n    })), { role: 'user', content: text }];\n\n    try {\n      const res = await fetch(endpoint, {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ messages: apiMessages, context: fetchContext() }),\n      });\n      const data = await res.json();\n      setMessages(prev => [...prev, { role: 'agent', text: data.reply }]);\n    } catch {\n      setMessages(prev => [...prev, { role: 'agent', text: 'Error processing request' }]);\n    } finally {\n      setIsLoading(false);\n    }\n  }, [messages, isLoading, endpoint, fetchContext]);\n\n  return (\n    <div>\n      <div ref={scrollRef} style={{ overflowY: 'auto', height: '300px' }}>\n        {messages.map((m, i) => <div key={i}>{m.text}</div>)}\n      </div>\n      <input value={input} onChange={e => setInput(e.target.value)} disabled={isLoading} />\n      <button onClick={() => sendMessage(input)} disabled={isLoading}>Send</button>\n    </div>\n  );\n};",
    "rules": [
      "Manage scroll positioning via a useEffect hook dependent on the messages array, updating scrollRef.current.scrollTop to match scrollRef.current.scrollHeight to keep the newest messages visible.",
      "Map internal application message roles ('agent' | 'user') to standardized LLM API roles ('assistant' | 'user') immediately before constructing the fetch payload.",
      "Block the sendMessage execution early if the input text is empty (after trimming) or if the isLoading state is true to prevent duplicate or empty network requests."
    ],
    "maxTokenEstimate": 380,
    "incompatibleWith": [
      "stateless-chat-prompt",
      "global-window-chat-widget"
    ]
  },
  {
    "id": "compound-component-architecture",
    "triggerDescription": "Use this pattern when building complex UI elements that require shared state across multiple sub-components without prop drilling.",
    "dependencies": [
      "react"
    ],
    "codeContext": "import React, { createContext, useContext, useMemo, useState } from 'react';\n\ninterface StateContextType {\n  isOpen: boolean;\n  toggle: () => void;\n}\n\nconst StateContext = createContext<StateContextType | undefined>(undefined);\n\nexport function useComponentState() {\n  const context = useContext(StateContext);\n  if (!context) throw new Error('Must be used within RootComponent');\n  return context;\n}\n\nexport interface RootProps extends React.HTMLAttributes<HTMLDivElement> {\n  initialOpen?: boolean;\n}\n\nexport const RootComponent: React.FC<RootProps> = ({ initialOpen = false, children, ...props }) => {\n  const [isOpen, setIsOpen] = useState(initialOpen);\n  const value = useMemo(() => ({ isOpen, toggle: () => setIsOpen(p => !p) }), [isOpen]);\n\n  return (\n    <StateContext.Provider value={value}>\n      <div {...props}>{children}</div>\n    </StateContext.Provider>\n  );\n};\n\nexport const TriggerComponent = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(\n  ({ onClick, ...props }, ref) => {\n    const { toggle } = useComponentState();\n    return <button ref={ref} onClick={(e) => { toggle(); onClick?.(e); }} {...props} />;\n  }\n);\nTriggerComponent.displayName = 'TriggerComponent';\n\nexport const ContentComponent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(\n  ({ ...props }, ref) => {\n    const { isOpen } = useComponentState();\n    if (!isOpen) return null;\n    return <div ref={ref} {...props} />;\n  }\n);\nContentComponent.displayName = 'ContentComponent';",
    "rules": [
      "Always enforce boundary checks in the custom hook by throwing an Error if the context resolves to undefined to strictly prevent usage of sub-components outside the RootComponent provider.",
      "Always wrap the Context.Provider value payload in a useMemo hook referencing exact state dependencies to prevent unnecessary re-renders of all leaf consumers when the parent component updates.",
      "Always wrap leaf UI elements in React.forwardRef and explicitly assign the displayName property to ensure standard DOM node accessibility and preserve React DevTools traceability."
    ],
    "maxTokenEstimate": 250,
    "incompatibleWith": [
      "monolithic-render-functions",
      "prop-drilling-architecture"
    ]
  },
  {
    "id": "supabase-tanstack-query-setup",
    "triggerDescription": "Inject this pattern when the application requires integrating a Supabase backend with TanStack Query for asynchronous state management and caching.",
    "dependencies": [
      "@supabase/supabase-js",
      "@tanstack/react-query"
    ],
    "codeContext": "import { createClient } from '@supabase/supabase-js';\nimport { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';\nimport React from 'react';\n\nconst SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';\nconst SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';\n\nexport const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {\n  auth: {\n    storage: typeof window !== 'undefined' ? window.localStorage : undefined,\n    persistSession: true,\n    autoRefreshToken: true,\n  }\n});\n\nexport const queryClient = new QueryClient({\n  defaultOptions: {\n    queries: {\n      staleTime: 1000 * 60 * 5,\n      retry: 1,\n      refetchOnWindowFocus: false,\n    },\n  },\n});\n\nexport const AppProvider = ({ children }: { children: React.ReactNode }) => {\n  return (\n    <QueryClientProvider client={queryClient}>\n      {children}\n    </QueryClientProvider>\n  );\n};\n\nexport type Entity = { id: string; created_at: string; data: string };\n\nexport const useEntities = () => {\n  return useQuery({\n    queryKey: ['entities'],\n    queryFn: async (): Promise<Entity[]> => {\n      const { data, error } = await supabase\n        .from('entities')\n        .select('*');\n\n      if (error) {\n        throw new Error(error.message);\n      }\n\n      return data as Entity[];\n    }\n  });\n};",
    "rules": [
      "Instantiate the Supabase client and the QueryClient outside of any React component to prevent memory leaks and cache loss during re-renders.",
      "Wrap the root application component with QueryClientProvider, passing the globally instantiated queryClient object.",
      "Throw an explicit standard Error inside the TanStack queryFn whenever the awaited Supabase response returns an error object, ensuring React Query correctly catches and propagates the error state."
    ],
    "maxTokenEstimate": 240,
    "incompatibleWith": [
      "apollo-graphql-setup",
      "swr-fetch-pattern",
      "redux-thunk-async"
    ]
  },
  {
    "id": "supabase-entity-crm-pattern",
    "triggerDescription": "Inject this pattern when building an admin panel or CRM interface that requires fetching, filtering, updating status, and exporting a list of database entities.",
    "dependencies": [
      "react",
      "@supabase/supabase-js"
    ],
    "codeContext": "import { useEffect, useState, useCallback } from 'react';\nimport { createClient } from '@supabase/supabase-js';\n\nconst supabase = createClient(\n  import.meta.env.VITE_SUPABASE_URL as string,\n  import.meta.env.VITE_SUPABASE_ANON_KEY as string\n);\n\nexport interface Entity {\n  id: string;\n  status: string;\n  created_at: string;\n  [key: string]: any;\n}\n\nexport const useEntityManager = (table: string, initialFilter = '') => {\n  const [entities, setEntities] = useState<Entity[]>([]);\n  const [filter, setFilter] = useState(initialFilter);\n  const [loading, setLoading] = useState(true);\n\n  const load = useCallback(async () => {\n    setLoading(true);\n    let query = supabase.from(table).select('*').order('created_at', { ascending: false });\n    if (filter) query = query.eq('status', filter);\n    const { data, error } = await query;\n    if (error) throw new Error(error.message);\n    setEntities(data ?? []);\n    setLoading(false);\n  }, [filter, table]);\n\n  useEffect(() => { load(); }, [load]);\n\n  const updateStatus = async (id: string, newStatus: string) => {\n    const { error } = await supabase.from(table).update({ status: newStatus }).eq('id', id);\n    if (error) throw new Error(error.message);\n    await load();\n  };\n\n  const exportCSV = () => {\n    if (!entities.length) return;\n    const headers = Object.keys(entities[0]);\n    const rows = entities.map(ent =>\n      headers.map(h => `\"${String(ent[h] || '').replace(/\"/g, '\"\"')}\"`).join(',')\n    );\n    const blob = new Blob([[headers.join(','), ...rows].join('\\n')], { type: 'text/csv' });\n    const url = URL.createObjectURL(blob);\n    const a = document.createElement('a');\n    a.href = url; a.download = `${table}-export.csv`; a.click();\n    URL.revokeObjectURL(url);\n  };\n\n  return { entities, filter, setFilter, loading, updateStatus, exportCSV };\n};",
    "rules": [
      "Wrap the load function in useCallback with [filter, table] as dependencies and place it as the sole dependency of the useEffect to trigger a targeted database re-fetch whenever filter criteria change without creating stale closures.",
      "Always await the Supabase update mutation and subsequently invoke the local load function to ensure the UI strictly reflects the updated remote database state rather than applying optimistic local mutations.",
      "Always sanitize entity values during CSV generation by casting to String and globally replacing double quotes with escaped double quotes ('\"\"') to prevent layout breaks from user-generated content."
    ],
    "maxTokenEstimate": 420,
    "incompatibleWith": [
      "redux-entity-management",
      "tanstack-query-optimistic-update"
    ]
  },
  {
    "id": "rhf-zod-validation",
    "triggerDescription": "Inject this pattern when the user needs a TypeScript form with schema-driven validation, field-level error display, and the ability to surface server-side errors back into specific form fields after a failed API call.",
    "dependencies": [
      "react-hook-form",
      "@hookform/resolvers",
      "zod"
    ],
    "codeContext": "import { useForm } from 'react-hook-form';\nimport { zodResolver } from '@hookform/resolvers/zod';\nimport { z } from 'zod';\n\nconst EntitySchema = z.object({\n  name: z.string().min(1, { message: 'Name is required' }),\n  email: z\n    .string()\n    .min(1, { message: 'Email is required' })\n    .email({ message: 'Must be a valid email' }),\n  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),\n});\n\ntype EntityFormValues = z.infer<typeof EntitySchema>;\n\nexport function useEntityForm() {\n  const form = useForm<EntityFormValues>({\n    resolver: zodResolver(EntitySchema),\n    mode: 'onChange',\n    defaultValues: { name: '', email: '', password: '' },\n  });\n\n  const onSubmit = form.handleSubmit(async (data: EntityFormValues) => {\n    try {\n      const response = await fetch('/api/entities', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify(data),\n      });\n      if (!response.ok) {\n        const body = await response.json();\n        if (response.status === 409) {\n          form.setError('email', { type: 'server', message: body.error ?? 'Email already in use' });\n        } else {\n          form.setError('root', { type: 'server', message: body.error ?? 'An unexpected error occurred' });\n        }\n        return;\n      }\n    } catch {\n      form.setError('root', { type: 'server', message: 'Network error' });\n    }\n  });\n\n  return { form, onSubmit };\n}\n\nexport function EntityForm() {\n  const { form, onSubmit } = useEntityForm();\n  const { formState: { errors, isSubmitting } } = form;\n\n  return (\n    <form onSubmit={onSubmit}>\n      <input {...form.register('email')} />\n      {errors.email && <span>{errors.email.message}</span>}\n      {errors.root && <span>{errors.root.message}</span>}\n      <button type=\"submit\" disabled={isSubmitting}>Submit</button>\n    </form>\n  );\n}",
    "rules": [
      "Declare `type EntityFormValues = z.infer<typeof EntitySchema>` and pass it as the generic to `useForm<EntityFormValues>` so TypeScript enforces that form.register, form.setError, and form.getValues all accept only keys that exist in the schema.",
      "Call `form.setError('email', { type: 'server', message: '...' })` inside the async submit handler after a non-OK response to inject server-returned errors into the field-level errors.email.message without re-running Zod validation.",
      "Pass `mode: 'onChange'` to useForm so that after setError fires on a field, the next valid keystroke in that field clears the error via reValidateMode (which defaults to 'onChange') without requiring a full re-submit."
    ],
    "maxTokenEstimate": 410,
    "incompatibleWith": []
  },
  {
    "id": "stripe-checkout-webhook",
    "triggerDescription": "Inject this pattern when the user needs to create a server-side Stripe Checkout session, redirect the client to the hosted payment page, and verify incoming webhook events with signature validation on a raw request body before any JSON parsing middleware runs.",
    "dependencies": [
      "stripe",
      "express",
      "express-async-handler"
    ],
    "codeContext": "import express, { Router, Request, Response } from 'express';\nimport asyncHandler from 'express-async-handler';\nimport Stripe from 'stripe';\n\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {\n  apiVersion: '2024-12-18.acacia',\n});\n\nexport const checkoutRouter = Router();\n\ncheckoutRouter.post(\n  '/create-session',\n  express.json(),\n  asyncHandler(async (req: Request, res: Response) => {\n    const { priceId, userId } = req.body as { priceId: string; userId: string };\n    const session = await stripe.checkout.sessions.create({\n      mode: 'subscription',\n      line_items: [{ price: priceId, quantity: 1 }],\n      success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,\n      cancel_url: `${process.env.APP_URL}/cancel`,\n      metadata: { userId },\n    });\n    res.json({ url: session.url });\n  }),\n);\n\nexport const webhookRouter = Router();\n\nwebhookRouter.post(\n  '/webhook',\n  express.raw({ type: 'application/json' }),\n  asyncHandler(async (req: Request, res: Response) => {\n    const sig = req.headers['stripe-signature'] as string;\n    let event: Stripe.Event;\n    try {\n      event = stripe.webhooks.constructEvent(\n        req.body as Buffer,\n        sig,\n        process.env.STRIPE_WEBHOOK_SECRET!,\n      );\n    } catch (err: unknown) {\n      const message = err instanceof Error ? err.message : 'Unknown error';\n      res.status(400).send(`Webhook Error: ${message}`);\n      return;\n    }\n    if (event.type === 'checkout.session.completed') {\n      const session = event.data.object as Stripe.Checkout.Session;\n      await handleCheckoutComplete(session);\n    }\n    res.sendStatus(204);\n  }),\n);\n\nasync function handleCheckoutComplete(session: Stripe.Checkout.Session) {\n  const userId = session.metadata?.userId;\n  if (!userId) throw new Error('Missing userId in session metadata');\n}",
    "rules": [
      "Register `express.raw({ type: 'application/json' })` as inline middleware directly on the webhook POST route before any global express.json() call, because stripe.webhooks.constructEvent requires a raw Buffer body \u2014 if express.json() runs first it parses the body to an object and the HMAC signature check throws a 'No signatures found matching' error.",
      "Call `stripe.webhooks.constructEvent(req.body as Buffer, req.headers['stripe-signature'] as string, process.env.STRIPE_WEBHOOK_SECRET!)` inside a try/catch and return a 400 response on failure, not a 500, so Stripe's dashboard marks the delivery as a client error and stops retrying.",
      "Return `res.sendStatus(204)` (not 200 with a body) after all event handling completes so that Stripe considers the delivery acknowledged, and ensure the response is sent even when the event type is not handled by the switch/if block."
    ],
    "maxTokenEstimate": 390,
    "incompatibleWith": []
  },
  {
    "id": "supabase-realtime-subscription",
    "triggerDescription": "Inject this pattern when the user needs a React hook that subscribes to live Postgres table changes via Supabase Realtime, receives typed INSERT/UPDATE/DELETE payloads, and deterministically removes the channel subscription when the component unmounts or the filter changes.",
    "dependencies": [
      "@supabase/supabase-js"
    ],
    "codeContext": "import { useEffect, useRef, useState, useCallback } from 'react';\nimport { createClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';\n\nconst supabase = createClient(\n  import.meta.env.VITE_SUPABASE_URL as string,\n  import.meta.env.VITE_SUPABASE_ANON_KEY as string\n);\n\ntype SubscriptionStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';\n\ninterface UseEntityRealtimeOptions<T extends Record<string, unknown>> {\n  table: string;\n  filter?: string;\n  onInsert?: (record: T) => void;\n  onUpdate?: (record: T) => void;\n  onDelete?: (record: T) => void;\n}\n\nexport function useEntityRealtime<T extends Record<string, unknown>>({\n  table,\n  filter,\n  onInsert,\n  onUpdate,\n  onDelete,\n}: UseEntityRealtimeOptions<T>) {\n  const [status, setStatus] = useState<SubscriptionStatus | null>(null);\n  const onInsertRef = useRef(onInsert);\n  const onUpdateRef = useRef(onUpdate);\n  const onDeleteRef = useRef(onDelete);\n\n  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);\n  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);\n  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);\n\n  useEffect(() => {\n    const channelId = `realtime:${table}:${filter ?? 'all'}`;\n    let channel: RealtimeChannel;\n\n    channel = supabase\n      .channel(channelId)\n      .on<T>(\n        'postgres_changes',\n        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },\n        (payload: RealtimePostgresChangesPayload<T>) => {\n          if (payload.eventType === 'INSERT') onInsertRef.current?.(payload.new as T);\n          if (payload.eventType === 'UPDATE') onUpdateRef.current?.(payload.new as T);\n          if (payload.eventType === 'DELETE') onDeleteRef.current?.(payload.old as T);\n        },\n      )\n      .subscribe((s: SubscriptionStatus) => setStatus(s));\n\n    return () => { supabase.removeChannel(channel); };\n  }, [table, filter]);\n\n  return { status };\n}",
    "rules": [
      "Store callback props (onInsert, onUpdate, onDelete) in refs via useEffect and read from those refs inside the subscription handler \u2014 never include the callbacks in the useEffect dependency array, because inline-defined callbacks change reference on every parent render and would cause the channel to resubscribe on every render cycle.",
      "Call `supabase.removeChannel(channel)` \u2014 not `channel.unsubscribe()` \u2014 inside the useEffect cleanup function so that Supabase's internal channel registry is updated and the WebSocket heartbeat for that channel stops, preventing memory leaks on repeated mount/unmount.",
      "Pass the callback to `.subscribe((status) => setStatus(status))` to capture 'SUBSCRIBED', 'TIMED_OUT', and 'CHANNEL_ERROR' statuses so callers can display connection state and conditionally render retry UI."
    ],
    "maxTokenEstimate": 400,
    "incompatibleWith": []
  },
  {
    "id": "tanstack-query-optimistic-update",
    "triggerDescription": "Inject this pattern when the user needs a TanStack Query mutation that instantly updates the UI before the server responds, rolls back to the previous cache state if the server returns an error, and then invalidates the query to sync authoritative data after the mutation settles.",
    "dependencies": [
      "@tanstack/react-query"
    ],
    "codeContext": "import {\n  useMutation,\n  useQueryClient,\n  type QueryClient,\n} from '@tanstack/react-query';\n\ntype Entity = { id: string; name: string; updatedAt: string };\ntype UpdateEntityInput = { id: string; name: string };\ntype UpdateEntityContext = { previousEntities: Entity[] | undefined };\n\nconst ENTITY_QUERY_KEY = ['entities'] as const;\n\nasync function updateEntityApi(input: UpdateEntityInput): Promise<Entity> {\n  const res = await fetch(`/api/entities/${input.id}`, {\n    method: 'PATCH',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ name: input.name }),\n  });\n  if (!res.ok) throw new Error(await res.text());\n  return res.json() as Promise<Entity>;\n}\n\nexport function useUpdateEntity() {\n  const queryClient: QueryClient = useQueryClient();\n\n  return useMutation<Entity, Error, UpdateEntityInput, UpdateEntityContext>({\n    mutationFn: updateEntityApi,\n\n    onMutate: async (input: UpdateEntityInput): Promise<UpdateEntityContext> => {\n      await queryClient.cancelQueries({ queryKey: ENTITY_QUERY_KEY });\n      const previousEntities = queryClient.getQueryData<Entity[]>(ENTITY_QUERY_KEY);\n      queryClient.setQueryData<Entity[]>(ENTITY_QUERY_KEY, (old = []) =>\n        old.map((e) => (e.id === input.id ? { ...e, name: input.name } : e)),\n      );\n      return { previousEntities };\n    },\n\n    onError: (_err: Error, _input: UpdateEntityInput, context: UpdateEntityContext | undefined) => {\n      if (context?.previousEntities !== undefined) {\n        queryClient.setQueryData<Entity[]>(ENTITY_QUERY_KEY, context.previousEntities);\n      }\n    },\n\n    onSettled: () => {\n      queryClient.invalidateQueries({ queryKey: ENTITY_QUERY_KEY });\n    },\n  });\n}",
    "rules": [
      "Call `await queryClient.cancelQueries({ queryKey: ENTITY_QUERY_KEY })` as the first statement inside onMutate to abort any in-flight fetches for that query key before applying the optimistic update, preventing a stale server response from overwriting the optimistic state after setQueryData runs.",
      "Declare the useMutation generic as `useMutation<Entity, Error, UpdateEntityInput, UpdateEntityContext>` so TypeScript enforces that context in onError and onSettled is typed as UpdateEntityContext | undefined, preventing unchecked property access on the rollback object.",
      "Call `queryClient.invalidateQueries({ queryKey: ENTITY_QUERY_KEY })` inside onSettled (not onSuccess), because onSettled fires on both success and error, ensuring the cache is always re-synced with the server even when the optimistic update was already rolled back by onError."
    ],
    "maxTokenEstimate": 380,
    "incompatibleWith": []
  },
  {
    "id": "multistep-form-session-persist",
    "triggerDescription": "Inject this pattern when the user needs a multi-step form where each step validates only its own fields before advancing, the accumulated form state survives a browser refresh via sessionStorage, and the entire form data is collected into one typed object for final submission.",
    "dependencies": [
      "react-hook-form",
      "@hookform/resolvers",
      "zod"
    ],
    "codeContext": "import { useState, useEffect, useRef } from 'react';\nimport { useForm, UseFormReturn } from 'react-hook-form';\nimport { zodResolver } from '@hookform/resolvers/zod';\nimport { z } from 'zod';\n\nconst Step0Schema = z.object({ name: z.string().min(1, 'Name is required') });\nconst Step1Schema = z.object({ email: z.string().email('Invalid email') });\nconst Step2Schema = z.object({ plan: z.enum(['free', 'pro']) });\n\nconst EntitySchema = Step0Schema.merge(Step1Schema).merge(Step2Schema);\ntype EntityFormData = z.infer<typeof EntitySchema>;\n\nconst STEP_SCHEMAS = [Step0Schema, Step1Schema, Step2Schema];\ntype StepIndex = 0 | 1 | 2;\nconst STORAGE_KEY = 'entity-form-draft';\n\nconst STEP_FIELDS: Record<StepIndex, (keyof EntityFormData)[]> = {\n  0: ['name'],\n  1: ['email'],\n  2: ['plan'],\n};\n\nexport function useEntityMultiStepForm(onComplete: (data: EntityFormData) => void) {\n  const [step, setStep] = useState<StepIndex>(0);\n  const stepRef = useRef(step);\n  useEffect(() => { stepRef.current = step; }, [step]);\n\n  const persisted = typeof window !== 'undefined'\n    ? JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')\n    : null;\n\n  const form = useForm<EntityFormData>({\n    resolver: zodResolver(EntitySchema),\n    defaultValues: persisted ?? { name: '', email: '', plan: 'free' },\n    mode: 'onTouched',\n  });\n\n  useEffect(() => {\n    const subscription = form.watch((values) => {\n      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values));\n    });\n    return () => subscription.unsubscribe();\n  }, [form]);\n\n  const next = async () => {\n    const currentStep = stepRef.current;\n    const fields = STEP_FIELDS[currentStep];\n    const valid = await form.trigger(fields, { shouldFocus: true });\n    if (!valid) return;\n    if (currentStep === 2) {\n      const data = form.getValues() as EntityFormData;\n      sessionStorage.removeItem(STORAGE_KEY);\n      onComplete(data);\n      return;\n    }\n    setStep((s) => (s + 1) as StepIndex);\n  };\n\n  const back = () => setStep((s) => Math.max(0, s - 1) as StepIndex);\n\n  return { form, step, next, back };\n}",
    "rules": [
      "Use `zodResolver(EntitySchema)` with the full merged schema on useForm initialization and rely exclusively on `form.trigger(STEP_FIELDS[step], { shouldFocus: true })` for per-step validation \u2014 do not swap the resolver between steps, as useForm does not reinitialize after mount and changing the resolver prop has no effect.",
      "Subscribe to `form.watch((values) => sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values)))` inside a useEffect and call `subscription.unsubscribe()` in the cleanup function so every field change is persisted to sessionStorage without creating memory leaks across re-renders.",
      "Call `await form.trigger(STEP_FIELDS[step])` inside the next function to validate only the fields belonging to the current step before advancing, so errors from later steps never surface prematurely and { shouldFocus: true } auto-scrolls to the first invalid field."
    ],
    "maxTokenEstimate": 450,
    "incompatibleWith": []
  }
];

export const PATTERN_REGISTRY: Map<string, InjectionPattern> = new Map(
  PATTERN_DATA.map(pattern => [pattern.id, pattern])
);

export const PATTERN_SUMMARY: string = PATTERN_DATA
  .map(pattern => `[${pattern.id}]: ${pattern.triggerDescription}`)
  .join('\n');
