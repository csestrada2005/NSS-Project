# Graph Report - NSS-Project  (2026-09-17)

## Corpus Check
- 299 files · ~463,251 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 4, .css 3, .graphify-bak 1)

## Summary
- 4169 nodes · 10238 edges · 196 communities (129 shown, 67 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 376 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1e37705f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- react-dom.development.js
- tailwindcss.js
- remove
- mergeLanes
- ref_node_assert_strict
- constructor
- diffHydratedProperties
- react-router.development.js
- completeWork
- has
- L
- decl
- package.json
- push
- t
- tailwindcss-browser.js
- error
- describeNativeComponentFrame
- react-router-dom.development.js
- AIOrchestrator.ts
- .parseUserCommand
- updateWorkInProgressHook
- push
- ProjectMemoryService
- dependencies
- planGate.test.js
- supabaseData.ts
- StudioEngine.tsx
- beginWork
- popHydrationState
- e
- compilerPerfHarness.mjs
- ref_services_supabaseservice
- ChildReconciler
- migrationDirNormalization.test.js
- PreviewOverlay.tsx
- uo
- react.development.js
- devDependencies
- commitRootImpl
- updateDehydratedSuspenseComponent
- AppSidebar.tsx
- ref_contexts_languagecontext
- server.js
- App.tsx
- DesignBriefService
- every
- ddlProposalState.js
- planGuard.test.js
- rlsPolicyGuard.js
- wo
- .getInstance
- MigrationRunner.ts
- Ms
- O
- replace
- deterministicRestore.test.js
- PropertyPanel.tsx
- rl
- compilerOptions
- importGraph.js
- U
- compilerOptions
- classifierHarness.mjs
- ProjectMemoryService.ts
- platformService
- resolveDispatcher
- QUEUE.md — Cola de Wyrd Forge
- ddlGuard.js
- templates.ts
- ast.ts
- captureCommitPhaseError
- types.ts
- StaffFinance.tsx
- error
- handleTimeout
- ChatInterface.tsx
- resolver.ts
- yo
- graphify reference: extra exports and benchmark
- sonner
- getComponentNameFromType
- 🔴 Ares Project
- add
- Forecast.tsx
- react
- danglingRefs.js
- components.json
- DDLApprovalButton.tsx
- Performance.tsx
- What You Must Do When Invoked
- @webcontainer/api
- graphify reference: add a URL and watch a folder
- scripts
- checkKeyStringCoercion
- DealsPage.tsx
- graphify reference: commit hook and native CLAUDE.md integration
- laneRouting.js
- ddlProposedGate.e2e.test.ts
- MetricsPage.tsx
- AdminDashboard.tsx
- fakeFetch.ts
- describeUnknownElementTypeFrameInDEV
- FileExplorer.tsx
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- BrowserCompiler.ts
- useProjectFiles.ts
- table.tsx
- forge_snapshots
- ref_lib_utils
- graphify reference: transcribe video and audio
- context.ts
- .claude/CLAUDE.md
- unsplash.test.js
- bootstrapProject.test.js
- extraction-spec.md
- keys
- NOT_TARGETED_STILL_IMPORTED
- data/index.ts
- MAX_CHARS_PER_BATCH
- MAX_FILES_PER_BATCH
- PROMPT_ROW_EXCLUDED_PREFIXES
- PROMPT_ROW_LIMIT
- SOURCE_EXTENSIONS
- UserApprovalPanel.tsx
- ProjectHubPage.tsx
- MODULE_EXTENSIONS
- vitest
- meta_connections
- deduct_credits
- rlsPolicyGuard.d.ts
- @supabase/supabase-js
- deduct_credits
- forge_credit_transactions
- applyEdits.js
- ddlProposalState.d.ts
- button.tsx
- danglingRefs.d.ts
- ddlGuard.d.ts
- migrationIntent.d.ts
- Component
- pt
- applyEdits.d.ts
- ddlVerdict.d.ts
- groupCompileErrors.d.ts
- importGraph.d.ts
- tsconfig.json
- jsxOrdinal.d.ts
- laneRouting.d.ts
- planGuard.d.ts
- planTrim.d.ts
- previewClient.ts
- schemaContext.ts
- ref_https_esm_sh_supabase_supabase_js_2
- DELETE_WITHOUT_WHERE
- DROP
- DROP_COLUMN
- TRUNCATE
- APPLIED
- EXECUTABLE
- FAILED
- OUTCOME_APPLIED
- OUTCOME_FAILED
- OUTCOME_SKIPPED
- OUTCOME_UNVERIFIED
- SKIPPED
- SUPERSEDED
- APPLIED
- FAILED
- UNVERIFIED
- EDGE_FUNCTIONS_DIR
- PLAN_LANE_ONLY_TYPES
- MIGRATIONS_SEGMENT
- MIGRATION_INTENT_RISK
- MIGRATION_INTENT_TYPE
- TELEMETRY_FAILED_PREFIX
- MIGRATIONS_DIR
- ORPHAN_SCOPE_PREFIX
- GATED_ACTION
- INITIAL_BUILD_REQUIRED_PATHS
- PROTECTED_TRIM_PATHS
- TRIM_MAX_STEPS
- ROLE_COLUMN_NAMES
- commitPlacement
- lucide-react

## God Nodes (most connected - your core abstractions)
1. `error()` - 118 edges
2. `react` - 88 edges
3. `push()` - 70 edges
4. `add()` - 69 edges
5. `lucide-react` - 66 edges
6. `replace()` - 56 edges
7. `has()` - 51 edges
8. `AIOrchestrator` - 43 edges
9. `uo()` - 43 edges
10. `remove()` - 42 edges

## Surprising Connections (you probably didn't know these)
- `Step 2 - Detect files` --references--> `document()`  [INFERRED]
  .claude/skills/graphify/SKILL.md → public/vendor/tailwindcss.js
- `0. CERRADO — Guard RLS "no actuó" tras G-4: REENCUADRADO, no era regresión de G-3 (2026-09-17)` --references--> `rlsPolicyWarnings()`  [INFERRED]
  QUEUE.md → src/utils/rlsPolicyGuard.js
- `buildNoMemoryIntent()` --calls--> `promptNeedsServer()`  [EXTRACTED]
  server/noMemoryFallbackNeedsServer.test.js → src/utils/serverLogicSignals.js
- `orchestratorBridge()` --calls--> `resolveMigrationTargets()`  [EXTRACTED]
  server/projectMemoryMigrationPaths.test.js → src/utils/migrationPath.js
- `gateActive()` --calls--> `touchesMigrations()`  [EXTRACTED]
  server/migrationContentGate.test.js → src/utils/migrationGate.js

## Import Cycles
- None detected.

## Communities (196 total, 67 thin omitted)

### Community 0 - "react-dom.development.js"
Cohesion: 0.01
Nodes (228): addEventBubbleListener(), addEventBubbleListenerWithPassiveFlag(), addEventCaptureListener(), addEventCaptureListenerWithPassiveFlag(), addTrappedEventListener(), callCallback(), canHydrateInstance(), canHydrateSuspenseInstance() (+220 more)

### Community 1 - "tailwindcss.js"
Cohesion: 0.02
Nodes (109): Aa(), Ap(), applyVariantOffset(), av(), ba(), be(), blueGray(), Bs() (+101 more)

### Community 2 - "remove"
Cohesion: 0.11
Nodes (27): _3(), al(), before(), check(), eC(), error(), fromOffset(), Go() (+19 more)

### Community 3 - "mergeLanes"
Cohesion: 0.06
Nodes (63): addFiberToLanesMap(), attemptContinuousHydration$1(), attemptHydrationAtCurrentPriority$1(), attemptSynchronousHydration$1(), batchedUpdates$1(), captureCommitPhaseErrorOnRoot(), checkForNestedUpdates(), checkIfSnapshotChanged() (+55 more)

### Community 4 - "ref_node_assert_strict"
Cohesion: 0.04
Nodes (49): esbuild, ref_node_assert_strict, ref_node_fs, ref_node_path, ref_node_test, ref_node_url, asHaikuJson(), asHaikuText() (+41 more)

### Community 5 - "constructor"
Cohesion: 0.07
Nodes (34): Ar(), constructor(), createTokenizer(), _deleteIfExpired(), _emitEvictions(), _entriesAscending(), entriesDescending(), _getItemValue() (+26 more)

### Community 6 - "diffHydratedProperties"
Cohesion: 0.06
Nodes (63): assertValidProps(), checkControlledValueProps(), checkSelectPropTypes(), detachTracker(), diffHydratedProperties(), diffProperties(), finalizeInitialChildren(), getCurrentFiberOwnerNameInDevOrNull() (+55 more)

### Community 7 - "react-router.development.js"
Cohesion: 0.06
Nodes (47): Await(), AwaitErrorBoundary, createMemoryRouter(), createRoutesFromChildren(), DataRoutes(), DefaultErrorComponent(), _extends(), getDataRouterConsoleError() (+39 more)

### Community 8 - "completeWork"
Cohesion: 0.05
Nodes (62): bubbleProperties(), commitUpdate(), completeDehydratedSuspenseBoundary(), completeWork(), createElement(), createInstance(), createTextInstance(), createTextNode() (+54 more)

### Community 9 - "has"
Cohesion: 0.04
Nodes (76): attachPingListener(), attachRetryListener(), attachSuspenseRetryListeners(), checkClassInstance(), enqueueCapturedUpdate(), errorHydratingContainer(), findChildHostInstancesForFiberShallowly(), findHostInstancesForFiberShallowly() (+68 more)

### Community 10 - "L"
Cohesion: 0.18
Nodes (15): br(), _f(), GS(), gw(), kf(), L(), oe(), Ps() (+7 more)

### Community 11 - "decl"
Cohesion: 0.06
Nodes (52): after(), atrule(), beforeAfter(), block(), body(), calcBefore(), cleanBrackets(), comma() (+44 more)

### Community 12 - "package.json"
Cohesion: 0.05
Nodes (39): name, private, type, version, autoprefixer, @babel/generator, @babel/types, clsx (+31 more)

### Community 13 - "push"
Cohesion: 0.03
Nodes (90): accumulateEnterLeaveListenersForEvent(), accumulateEnterLeaveTwoPhaseListeners(), accumulateOrCreateContinuousQueuedReplayableEvent(), accumulateSinglePhaseListeners(), accumulateTwoPhaseListeners(), assertIsMounted(), attemptExplicitHydrationTarget(), attemptSynchronousHydration() (+82 more)

### Community 14 - "t"
Cohesion: 0.08
Nodes (56): ae(), append(), As(), bb(), Bi(), bo(), d(), Df() (+48 more)

### Community 15 - "tailwindcss-browser.js"
Cohesion: 0.07
Nodes (48): At(), Bn(), dl(), Dn(), dr(), end(), Eo(), error() (+40 more)

### Community 16 - "error"
Cohesion: 0.06
Nodes (61): attemptReplayContinuousQueuedEvent(), attemptReplayContinuousQueuedEventInMap(), checkAttributeStringCoercion(), checkCSSPropertyStringCoercion(), checkFormFieldValueStringCoercion(), checkForUnmatchedText(), checkHtmlStringCoercion(), checkKeyStringCoercion() (+53 more)

### Community 17 - "describeNativeComponentFrame"
Cohesion: 0.19
Nodes (14): createCapturedValueAtFiber(), describeBuiltInComponentFrame(), describeClassComponentFrame(), describeFiber(), describeFunctionComponentFrame(), describeNativeComponentFrame(), describeUnknownElementTypeFrameInDEV(), disabledLog() (+6 more)

### Community 18 - "react-router-dom.development.js"
Cohesion: 0.08
Nodes (36): createBrowserRouter(), createHashRouter(), createSearchParams(), Deferred, deserializeErrors(), _extends(), flushSyncSafe(), getDataRouterConsoleError() (+28 more)

### Community 19 - "AIOrchestrator.ts"
Cohesion: 0.06
Nodes (39): getPageImportFiles(), isEditableSrcPath(), KNOWN_DEP_VERSIONS, LLMResponse, ModifiedFile, NODE_BUILTINS, OrchestratorResult, packageNameFromSpecifier() (+31 more)

### Community 20 - ".parseUserCommand"
Cohesion: 0.13
Nodes (6): AIOrchestrator, generateBlueprintFromFiles(), selectRelevantFiles(), trackAICall(), Intent, isAbortError()

### Community 21 - "updateWorkInProgressHook"
Cohesion: 0.06
Nodes (45): areHookInputsEqual(), basicStateReducer(), createFunctionComponentUpdateQueue(), getWorkInProgressRoot(), includesBlockingLane(), includesOnlyNonUrgentLanes(), isSubsetOfLanes(), markSkippedUpdateLanes() (+37 more)

### Community 22 - "push"
Cohesion: 0.06
Nodes (81): a3(), Af(), Ah(), ao(), applyParallelOffset(), arbitraryProperty(), _b(), B3() (+73 more)

### Community 24 - "dependencies"
Cohesion: 0.05
Nodes (42): dependencies, @anthropic-ai/sdk, @babel/generator, @babel/parser, @babel/standalone, @babel/traverse, @babel/types, class-variance-authority (+34 more)

### Community 25 - "planGate.test.js"
Cohesion: 0.36
Nodes (7): first(), deleteStep(), step(), GATED_ACTION, isDeleteStep(), planRejectedTelemetry(), shouldGatePlan()

### Community 26 - "supabaseData.ts"
Cohesion: 0.05
Nodes (3): DealWithContact, PaymentWithProject, ProjectWithClient

### Community 27 - "StudioEngine.tsx"
Cohesion: 0.07
Nodes (28): jszip, react-resizable-panels, @xterm/addon-fit, @xterm/xterm, ref_xterm_xterm_css_xterm_css, CommandBubble(), CommandBubbleProps, CommandModal() (+20 more)

### Community 28 - "beginWork"
Cohesion: 0.06
Nodes (92): adoptClassInstance(), applyDerivedStateFromProps(), attemptEarlyBailoutIfNoScheduledUpdate(), bailoutHooks(), bailoutOnAlreadyFinishedWork(), beginWork(), cacheContext(), callComponentWillMount() (+84 more)

### Community 29 - "popHydrationState"
Cohesion: 0.09
Nodes (32): createFiberFromHostInstanceForDeletion(), deleteHydratableInstance(), didNotFindHydratableInstance(), didNotFindHydratableInstanceWithinContainer(), didNotFindHydratableInstanceWithinSuspenseInstance(), didNotFindHydratableTextInstance(), didNotFindHydratableTextInstanceWithinContainer(), didNotFindHydratableTextInstanceWithinSuspenseInstance() (+24 more)

### Community 30 - "e"
Cohesion: 0.08
Nodes (37): async(), Bt(), Ei(), catch(), cloneDiv(), colorStops(), content(), css() (+29 more)

### Community 31 - "compilerPerfHarness.mjs"
Cohesion: 0.06
Nodes (54): @babel/parser, @babel/traverse, ref_fs, ref_node_os, ALIAS, ALIAS_EXTRA_SOLO_HARNESS, bytesLabel(), checkIconsPresent() (+46 more)

### Community 32 - "ref_services_supabaseservice"
Cohesion: 0.05
Nodes (43): @monaco-editor/react, ref_services_platformservice, ref_services_projectdbservice, ref_services_supabaseservice, CWV, LighthousePanel(), LighthousePanelProps, scoreColor() (+35 more)

### Community 33 - "ChildReconciler"
Cohesion: 0.14
Nodes (40): checkDepsAreArrayDev(), ChildReconciler(), createChild(), deleteChild(), deleteRemainingChildren(), mapRemainingChildren(), placeChild(), placeSingleChild() (+32 more)

### Community 34 - "migrationDirNormalization.test.js"
Cohesion: 0.15
Nodes (24): NOW, orchestrate(), persistedPaths(), ROOT, T, count(), NOW, orchestratorBridge() (+16 more)

### Community 35 - "PreviewOverlay.tsx"
Cohesion: 0.19
Nodes (12): react-moveable, ElementEditPopover(), ElementEditPopoverProps, DEFAULT_LAYOUT_CONTEXT, ElementInfo, getTranslateFromClass(), PreviewOverlay(), PreviewOverlayProps (+4 more)

### Community 36 - "uo"
Cohesion: 0.13
Nodes (36): An(), Ce(), co(), #e(), Ee(), functional(), jo(), keysInNamespaces() (+28 more)

### Community 37 - "react.development.js"
Cohesion: 0.08
Nodes (24): cloneAndReplaceKey(), countChildren(), createContext(), createFactoryWithValidation(), escape(), escapeUserProvidedKey(), forEachChildren(), getElementKey() (+16 more)

### Community 38 - "devDependencies"
Cohesion: 0.06
Nodes (32): devDependencies, autoprefixer, esbuild, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+24 more)

### Community 39 - "commitRootImpl"
Cohesion: 0.09
Nodes (32): commitPassiveMountEffects(), commitPassiveMountEffects_begin(), commitPassiveUnmountEffects(), commitRoot(), commitRootImpl(), discreteUpdates(), dispatchContinuousEvent(), dispatchDiscreteEvent() (+24 more)

### Community 40 - "updateDehydratedSuspenseComponent"
Cohesion: 0.10
Nodes (26): addSubtreeSuspenseContext(), createCapturedValue(), createFiberFromOffscreen(), getRemainingWorkInPrimaryTree(), getSuspendedCache(), getSuspenseInstanceFallbackErrorDetails(), isSuspenseInstanceFallback(), laneToLanes() (+18 more)

### Community 41 - "AppSidebar.tsx"
Cohesion: 0.08
Nodes (17): ref_components_admin_userapprovalpanel, date-fns, ref_hooks_usenotifications, ref_services_notificationservice, AppSidebarProps, NavItem, navItems, Page (+9 more)

### Community 42 - "ref_contexts_languagecontext"
Cohesion: 0.09
Nodes (17): ref_contexts_languagecontext, navItems, EmptyStateProps, PAGE_NAMES, TopbarProps, ClientDashboard(), formatCurrency(), PAYMENT_STATUS_COLORS (+9 more)

### Community 43 - "server.js"
Cohesion: 0.05
Nodes (39): @anthropic-ai/sdk, ref_crypto, ref_dns_promises, ref_dotenv_config, express, stripe, ref_url, app (+31 more)

### Community 44 - "App.tsx"
Cohesion: 0.05
Nodes (42): ref_components_appsidebar, ref_components_forge_creditbalance, ref_components_forge_newprojectmodal, ref_components_forge_shareprojectmodal, ref_components_topbar, ref_contexts_authcontext, ref_contexts_viewmodecontext, ref_hooks_useprojectaccess (+34 more)

### Community 45 - "DesignBriefService"
Cohesion: 0.09
Nodes (11): parseFontsFromDesignMd(), reinjectBrandBriefIfDropped(), BrandColor, DesignBrief, DesignBriefService, PoolImage, REQUIRED_BRAND_VARS, SiteFacts (+3 more)

### Community 46 - "every"
Cohesion: 0.08
Nodes (37): A4(), ab(), Bu(), C4(), Cb(), Db(), dr(), E4() (+29 more)

### Community 47 - "ddlProposalState.js"
Cohesion: 0.14
Nodes (28): messages(), proposes(), resolves(), states(), APPLIED, buildOutcomeMessage(), ddlOutcomeMark(), ddlProposedMark() (+20 more)

### Community 48 - "planGuard.test.js"
Cohesion: 0.15
Nodes (22): completePlan(), step(), orders(), paths(), section(), step(), buildPlanRepairNote(), INITIAL_BUILD_REQUIRED_PATHS (+14 more)

### Community 49 - "rlsPolicyGuard.js"
Cohesion: 0.14
Nodes (28): 0. CERRADO — Guard RLS "no actuó" tras G-4: REENCUADRADO, no era regresión de G-3 (2026-09-17), applyGuard(), addMissingRls(), ALLOWED_PUBLIC_COMMANDS, alterTableAnchorsInSql(), createTableAnchorsInSql(), displayIdentifier(), evaluateRlsPolicies() (+20 more)

### Community 50 - "wo"
Cohesion: 0.17
Nodes (16): ar(), Be(), bo(), compound(), compoundsWith(), Do(), F(), fromAst() (+8 more)

### Community 51 - ".getInstance"
Cohesion: 0.05
Nodes (16): SUPABASE_ANON_KEY, SUPABASE_URL, Collaborator, CollaboratorService, InviteEntry, AnalyticsConnection, GADailyRow, MetaConnection (+8 more)

### Community 52 - "MigrationRunner.ts"
Cohesion: 0.14
Nodes (22): err(), BASE, SRC, asColumns(), columnKey(), describeError(), MigrationOutcome, MigrationResult (+14 more)

### Community 53 - "Ms"
Cohesion: 0.10
Nodes (25): ai(), Aw(), cf(), co(), Di(), Dw(), Ew(), ff() (+17 more)

### Community 54 - "O"
Cohesion: 0.15
Nodes (33): add(), Br(), Ci(), f(), clearNamespace(), entries(), Fn(), Fo() (+25 more)

### Community 55 - "replace"
Cohesion: 0.06
Nodes (41): addToError(), d3(), Dn(), et(), Fo(), G3(), Gh(), h3() (+33 more)

### Community 56 - "deterministicRestore.test.js"
Cohesion: 0.11
Nodes (23): batchFor(), EXPORT_MISMATCH, filesAfterPlan(), originalFiles(), RESOLVE_ERRORS, CompileErrorDetail, pickRepairModel(), Verifier (+15 more)

### Community 57 - "PropertyPanel.tsx"
Cohesion: 0.11
Nodes (19): BRAND_VAR_ORDER, BrandVar, FONT_SIZES, FONT_WEIGHTS, hasToken(), isAlign(), isFontSize(), isFontWeight() (+11 more)

### Community 58 - "rl"
Cohesion: 0.14
Nodes (18): addKeyframes(), G(), getKeyframes(), It(), lt(), Me(), mi(), Nt() (+10 more)

### Community 59 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 60 - "importGraph.js"
Cohesion: 0.11
Nodes (24): runDeleteSteps(), asMap(), DeleteVerdict, DeleteVerdictInput, deleteVerdict(), deletionTargetsTelemetry(), expandDeletionTargets(), NOT_TARGETED_STILL_IMPORTED (+16 more)

### Community 61 - "U"
Cohesion: 0.13
Nodes (30): ae(), l(), ao(), Bi(), Cn(), compare(), dt(), En() (+22 more)

### Community 62 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 63 - "classifierHarness.mjs"
Cohesion: 0.12
Nodes (20): CHAT_HISTORY, classifyOutcome(), DELAY_MS, ENTRY_TS, HERE, loadClassifier(), main(), majorityOf() (+12 more)

### Community 64 - "ProjectMemoryService.ts"
Cohesion: 0.13
Nodes (13): buildNoMemoryIntent(), DEFAULT_INTENT, IntentClassifier, PATTERN_SUMMARY, ActionRecord, CodeConventions, ComponentEntry, memoryCache (+5 more)

### Community 65 - "platformService"
Cohesion: 0.20
Nodes (5): DeployManager(), DeployManagerProps, DeployStage, STAGE_MESSAGES, platformService

### Community 66 - "resolveDispatcher"
Cohesion: 0.13
Nodes (15): resolveDispatcher(), useCallback(), useDebugValue(), useDeferredValue(), useEffect(), useId(), useImperativeHandle(), useInsertionEffect() (+7 more)

### Community 67 - "QUEUE.md — Cola de Wyrd Forge"
Cohesion: 0.18
Nodes (10): 1. HECHO — G-3 (2026-09-15), 2. HECHO — G-4 (2026-09-17), 3. Guard de código bajo `src/`, 4. Hueco conceptual RLS ↔ Edge Function, 5. BUCKET Producto y UX, 6. BUCKET Calidad del modelo, APARCADO hasta después de lanzar, Decisión de arquitectura permanente (+2 more)

### Community 68 - "ddlGuard.js"
Cohesion: 0.21
Nodes (18): kinds(), targets(), DELETE_WITHOUT_WHERE, destructiveTargets(), DROP, DROP_COLUMN, findDestructiveDDL(), isDestructiveDDL() (+10 more)

### Community 69 - "templates.ts"
Cohesion: 0.14
Nodes (14): commonFiles, commonSrc, TEMPLATES, MOTION_DIR, SEO_FILE, bridgeTokens(), COLOR_PROPS, file() (+6 more)

### Community 70 - "ast.ts"
Cohesion: 0.11
Nodes (21): @babel/standalone, @xyflow/react, ref_xyflow_react_dist_style_css, StateGraph(), StateGraphProps, InspectorPanel(), InspectorPanelProps, PropertyPanelProps (+13 more)

### Community 71 - "captureCommitPhaseError"
Cohesion: 0.04
Nodes (88): captureCommitPhaseError(), clearContainer(), clearSuspenseBoundary(), clearSuspenseBoundaryFromContainer(), commitAttachRef(), commitBeforeMutationEffects_complete(), commitBeforeMutationEffectsOnFiber(), commitDeletionEffects() (+80 more)

### Community 72 - "types.ts"
Cohesion: 0.20
Nodes (9): AdminKPIs, Contact, DashboardKPIs, DataInterface, Deal, DealStatus, Payment, Project (+1 more)

### Community 73 - "StaffFinance.tsx"
Cohesion: 0.05
Nodes (61): ref_components_emptystate, ref_components_pagination, ref_components_ui_badge, ref_components_ui_button, ref_components_ui_input, ref_hooks_usepagination, ref_services_data_supabasedata, ref_types (+53 more)

### Community 74 - "error"
Cohesion: 0.21
Nodes (13): act(), enqueueTask(), error(), flushActQueue(), forwardRef(), isValidElementType(), lazy(), lazyInitializer() (+5 more)

### Community 75 - "handleTimeout"
Cohesion: 0.20
Nodes (18): advanceTimers(), cancelHostTimeout(), compare(), flushWork(), handleTimeout(), markTaskErrored(), peek(), pop() (+10 more)

### Community 76 - "ChatInterface.tsx"
Cohesion: 0.23
Nodes (12): react-markdown, getPlainEnglish(), isLastDone(), isLastError(), ProgressLine, actionVerb(), BuildProgress(), ChatInterface() (+4 more)

### Community 77 - "resolver.ts"
Cohesion: 0.27
Nodes (7): PatternInjector, InjectionPattern, PATTERN_DATA, PATTERN_REGISTRY, formatPattern(), resolvePatterns(), ResolverResult

### Community 78 - "yo"
Cohesion: 0.22
Nodes (11): kind(), Pn(), Qr(), qt(), So(), wt(), xo(), yo() (+3 more)

### Community 79 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 80 - "sonner"
Cohesion: 0.07
Nodes (22): ref_components_ui_card, ref_components_ui_label, ref_components_ui_switch, ref_components_ui_table, ref_components_ui_tabs, ref_services_collaboratorservice, sonner, PendingInvite (+14 more)

### Community 81 - "getComponentNameFromType"
Cohesion: 0.22
Nodes (14): cloneElementWithValidation(), createElementWithValidation(), getComponentNameFromType(), getContextName(), getCurrentComponentErrorInfo(), getDeclarationErrorAddendum(), getWrappedName(), isArray() (+6 more)

### Community 82 - "🔴 Ares Project"
Cohesion: 0.22
Nodes (8): 📦 Architecture, 🔴 Ares Project, 🛠 Features, 🧠 Intelligence, 🚀 Mission, ⚡ Powered by WebContainers, ✨ The "Killer Feature": True Visual Editing, 🎨 Visual & Interactive

### Community 83 - "add"
Cohesion: 0.07
Nodes (50): add(), o(), u(), already(), bm(), w(), c(), checkForWarning() (+42 more)

### Community 84 - "Forecast.tsx"
Cohesion: 0.14
Nodes (13): Deal, fmtCurrency(), fmtDate(), Forecast(), ForecastData, labels, MONTH_NAMES_EN, MONTH_NAMES_ES (+5 more)

### Community 85 - "react"
Cohesion: 0.07
Nodes (22): react, ref_react_dom_client, CreditBalance(), AuthContext, AuthContextType, AuthProvider(), clearProfileCache(), readProfileCache() (+14 more)

### Community 86 - "danglingRefs.js"
Cohesion: 0.14
Nodes (21): APP_HALF_UNWIRED, APP_UNWIRED, asMap(), blankOut(), boundNames(), danglingImportOf(), danglingRefsTelemetry(), exportedSymbols() (+13 more)

### Community 87 - "components.json"
Cohesion: 0.14
Nodes (13): aliases, components, utils, rsc, $schema, style, tailwind, baseColor (+5 more)

### Community 88 - "DDLApprovalButton.tsx"
Cohesion: 0.20
Nodes (11): ref_services_migrationrunner, ref_utils_ddlguard_js, ref_utils_ddlproposalstate_js, DDLApprovalButton(), fileName(), Props, fileName(), FlaggedStatement (+3 more)

### Community 89 - "Performance.tsx"
Cohesion: 0.19
Nodes (11): defaultDateRange(), fmtDate(), labels, Milestone, milestoneBadgeClass, milestoneBadgeLabel, NpsRow, npsScoreBadgeClass() (+3 more)

### Community 90 - "What You Must Do When Invoked"
Cohesion: 0.05
Nodes (39): CLAUDE.md — Wyrd Forge (NSS-Project), Comandos, Fixtures, graphify, Límites duros, Protocolo de sesión — "1 sesión = 1 cirugía completa", Qué es esto, Reglas de comunicación (permanentes) (+31 more)

### Community 91 - "@webcontainer/api"
Cohesion: 0.17
Nodes (9): @octokit/rest, @webcontainer/api, HistoryDrawer(), HistoryDrawerProps, RestoreMeta, Snapshot, TRIGGER_COLORS, TRIGGER_LABELS (+1 more)

### Community 92 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 93 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, embed:patterns, lint, preview, seed:patterns, start (+3 more)

### Community 94 - "checkKeyStringCoercion"
Cohesion: 0.24
Nodes (11): checkKeyStringCoercion(), cloneElement(), createElement(), defineKeyPropWarningGetter(), defineRefPropWarningGetter(), hasValidKey(), hasValidRef(), testStringCoercion() (+3 more)

### Community 95 - "DealsPage.tsx"
Cohesion: 0.18
Nodes (12): ClientProfile, CollaboratorEntry, DealHistoryPanel(), DealRevision, DealsPage(), DealWithContact, fmtCurrency(), stageBadgeClass (+4 more)

### Community 96 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 97 - "laneRouting.js"
Cohesion: 0.38
Nodes (9): canEnterFastLane(), hasNoRequiredPatterns(), hasOutOfUniverseWork(), isPlanLaneOnly(), isSelectableSrcFile(), isSimpleEditIntent(), PLAN_LANE_ONLY_TYPES, promptMentionsEdgeFunction() (+1 more)

### Community 98 - "ddlProposedGate.e2e.test.ts"
Cohesion: 0.26
Nodes (11): ref_utils_ddlproposalstate, claudeTextResponse(), extractSystemText(), installRig(), jsonResponse(), MIGRATION_STEP, NO_MIGRATION_STEP, parseBody() (+3 more)

### Community 99 - "MetricsPage.tsx"
Cohesion: 0.09
Nodes (25): recharts, ref_services_data_analyticsservice, ref_services_data_metaadsservice, AnalyticsRow, formatDate(), TrafficCharts(), TrafficChartsProps, defaultDateRange() (+17 more)

### Community 100 - "AdminDashboard.tsx"
Cohesion: 0.20
Nodes (10): AdminDashboard(), CreditStats, DEFAULT_KPIS, ForgeStats, formatCurrency(), PlatformUsage, PlatformUsageRow, ROLE_LABELS (+2 more)

### Community 101 - "fakeFetch.ts"
Cohesion: 0.18
Nodes (14): ref_services_aiorchestrator, ref_services_architect, claudeTextResponse(), COMPILE_FIXTURE, EMBED_SEARCH_FIXTURE, extractSystemText(), FakeFetchControl, installFakeFetch() (+6 more)

### Community 102 - "describeUnknownElementTypeFrameInDEV"
Cohesion: 0.24
Nodes (10): checkPropTypes(), describeBuiltInComponentFrame(), describeFunctionComponentFrame(), describeNativeComponentFrame(), describeUnknownElementTypeFrameInDEV(), disabledLog(), disableLogs(), reenableLogs() (+2 more)

### Community 103 - "FileExplorer.tsx"
Cohesion: 0.24
Nodes (7): buildTree(), FileExplorer(), FileExplorerProps, TreeNode, TreeNodeProps, CodePanel(), CodePanelProps

### Community 104 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 106 - "BrowserCompiler.ts"
Cohesion: 0.16
Nodes (18): backoffMs(), classifyCompileResult(), CompileDecision, CompileOptions, CompilePayload, compileRequest(), CompileResult, CompileVerdict (+10 more)

### Community 107 - "useProjectFiles.ts"
Cohesion: 0.39
Nodes (5): persistContent(), useProjectFiles(), UseProjectFilesReturn, normalizeBrandVars(), stripDataOid()

### Community 108 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 109 - "forge_snapshots"
Cohesion: 0.16
Nodes (14): cap_forge_snapshots, cap_forge_snapshots(), cap_snapshots_trigger, forge_projects, forge_snapshots, forge_snapshots_project_created_idx, forge_snapshots_project_id_idx, profiles (+6 more)

### Community 110 - "ref_lib_utils"
Cohesion: 0.10
Nodes (16): ref_lib_utils, @radix-ui/react-progress, @radix-ui/react-switch, @radix-ui/react-tabs, Card, CardContent, CardDescription, CardFooter (+8 more)

### Community 112 - "context.ts"
Cohesion: 0.36
Nodes (7): fileSystemTreeToMap(), flattenFileTree(), flattenFileTreeRecursive(), flattenTreeToMap(), generateBlueprintRecursive(), generateProjectBlueprint(), mapToFileSystemTree()

### Community 114 - "unsplash.test.js"
Cohesion: 0.39
Nodes (4): searchOneKeyword(), searchUnsplash(), triggerUnsplashDownloads(), withUtmParams()

### Community 115 - "bootstrapProject.test.js"
Cohesion: 0.39
Nodes (5): bootstrapProject(), EXEC_SQL_DDL, RLS_TRIGGER_DDL, sendManagementQuery(), NORMALIZE_LINE

### Community 117 - "keys"
Cohesion: 0.29
Nodes (5): constructor(), go(), ho(), keys(), tt()

### Community 119 - "data/index.ts"
Cohesion: 0.24
Nodes (6): USE_MOCK_DATA, src_data, fetchItems(), fetchProfile(), Item, Profile

### Community 125 - "UserApprovalPanel.tsx"
Cohesion: 0.40
Nodes (5): getInitials(), PendingProfile, ROLE_BADGE, UserApprovalPanel(), UserApprovalPanelProps

### Community 126 - "ProjectHubPage.tsx"
Cohesion: 0.12
Nodes (16): ref_components_settings_aihistorypanel, ref_components_settings_analytics_lighthousepanel, ref_components_settings_analytics_toppagestable, ref_components_settings_analytics_trafficcharts, ref_components_settings_db_databaseoverview, ref_components_settings_db_schemaviewer, ref_components_settings_db_sqleditor, ref_components_settings_db_usersmanager (+8 more)

### Community 128 - "vitest"
Cohesion: 0.22
Nodes (7): el(), ref_testing_library_jest_dom_vitest, @testing-library/react, @testing-library/user-event, vitest, Pagination(), PaginationProps

### Community 130 - "meta_connections"
Cohesion: 0.67
Nodes (3): meta_connections, meta_connections_user_id_idx, profiles

### Community 132 - "rlsPolicyGuard.d.ts"
Cohesion: 0.33
Nodes (5): RlsDangerousCommand, RlsFinding, RlsFindingReason, RlsMigrationInput, RlsVerdict

### Community 133 - "@supabase/supabase-js"
Cohesion: 0.11
Nodes (16): dotenv, ref_path, @supabase/supabase-js, @tailwindcss/vite, vite, @vitejs/plugin-react, ref_vitest_config, generateEmbedding() (+8 more)

### Community 136 - "applyEdits.js"
Cohesion: 0.57
Nodes (5): block(), applyEditsFromResponse(), applySearchReplace(), countOccurrences(), parseSearchReplaceBlocks()

### Community 140 - "ddlProposalState.d.ts"
Cohesion: 0.40
Nodes (4): DdlProposal, ProposalOutcome, ProposalSourceMessage, ProposalState

### Community 143 - "button.tsx"
Cohesion: 0.18
Nodes (11): class-variance-authority, @radix-ui/react-label, @radix-ui/react-slot, Badge(), BadgeProps, badgeVariants, Button, ButtonProps (+3 more)

### Community 147 - "danglingRefs.d.ts"
Cohesion: 0.50
Nodes (3): DanglingRef, FileMap, SyntheticDanglingError

### Community 148 - "ddlGuard.d.ts"
Cohesion: 0.50
Nodes (3): DestructiveFinding, DestructiveKind, SqlStatement

### Community 149 - "migrationIntent.d.ts"
Cohesion: 0.50
Nodes (3): IntentLogResult, MigrationIntentInput, MigrationIntentParams

### Community 180 - "ref_https_esm_sh_supabase_supabase_js_2"
Cohesion: 0.20
Nodes (6): ref_https_deno_land_std_0_168_0_http_server_ts, ref_https_esm_sh_supabase_supabase_js_2, corsHeaders, corsHeaders, CORS, CORS

### Community 232 - "commitPlacement"
Cohesion: 0.21
Nodes (13): appendChild(), appendChildToContainer(), appendInitialChild(), commitPlacement(), commitReconciliationEffects(), getHostParentFiber(), getHostSibling(), insertBefore() (+5 more)

### Community 243 - "lucide-react"
Cohesion: 0.08
Nodes (18): framer-motion, lucide-react, Login(), DatabaseOverviewProps, KPI, EdgeFunction, EdgeFunctionsPanel(), EdgeFunctionsPanelProps (+10 more)

## Knowledge Gaps
- **695 isolated node(s):** `1. HECHO — G-3 (2026-09-15)`, `3. Guard de código bajo `src/``, `4. Hueco conceptual RLS ↔ Edge Function`, `5. BUCKET Producto y UX`, `6. BUCKET Calidad del modelo` (+690 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1201 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **67 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `value()` connect `add` to `react-dom.development.js`, `tailwindcss.js`, `server.js`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **Why does `@supabase/supabase-js` connect `@supabase/supabase-js` to `.getInstance`, `server.js`, `package.json`, `react`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `package.json`, `button.tsx`, `StudioEngine.tsx`, `ref_services_supabaseservice`, `PreviewOverlay.tsx`, `AppSidebar.tsx`, `ref_contexts_languagecontext`, `App.tsx`, `PropertyPanel.tsx`, `platformService`, `ast.ts`, `StaffFinance.tsx`, `ChatInterface.tsx`, `sonner`, `Forecast.tsx`, `DDLApprovalButton.tsx`, `Performance.tsx`, `@webcontainer/api`, `DealsPage.tsx`, `MetricsPage.tsx`, `AdminDashboard.tsx`, `FileExplorer.tsx`, `useProjectFiles.ts`, `table.tsx`, `ref_lib_utils`, `lucide-react`, `UserApprovalPanel.tsx`, `ProjectHubPage.tsx`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `add()` (e.g. with `u()` and `p()`) actually correct?**
  _`add()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `1. HECHO — G-3 (2026-09-15)`, `3. Guard de código bajo `src/``, `4. Hueco conceptual RLS ↔ Edge Function` to the rest of the system?**
  _695 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `react-dom.development.js` be split into smaller, more focused modules?**
  _Cohesion score 0.010263007432818754 - nodes in this community are weakly interconnected._
- **Should `tailwindcss.js` be split into smaller, more focused modules?**
  _Cohesion score 0.01894026531707691 - nodes in this community are weakly interconnected._