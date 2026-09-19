# Graph Report - NSS-Project  (2026-09-19)

## Corpus Check
- 300 files · ~463,502 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 5, .css 3, .graphify-bak 1)

## Summary
- 4173 nodes · 10241 edges · 199 communities (129 shown, 70 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 376 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f85a4d83`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- react-dom.development.js
- tailwindcss.js
- AppSidebar.tsx
- mergeLanes
- ref_node_assert_strict
- StudioEngine
- diffHydratedProperties
- react-router.development.js
- completeWork
- has
- every
- remove
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
- has
- .getInstance
- dependencies
- planGate.test.js
- supabaseData.ts
- StudioEngine.tsx
- beginWork
- popHydrationState
- push
- compilerPerfHarness.mjs
- SettingsModal.tsx
- ChildReconciler
- migrationDirNormalization.test.js
- PreviewOverlay.tsx
- ChatInterface.tsx
- react.development.js
- devDependencies
- commitRootImpl
- updateDehydratedSuspenseComponent
- projectDBService
- DDLApprovalButton.tsx
- server.js
- lucide-react
- DesignBriefService
- A4
- ddlProposalState.js
- planGuard.test.js
- rlsPolicyGuard.js
- wo
- SupabaseService
- MigrationRunner.ts
- nl
- get
- replace
- Verifier.ts
- PropertyPanel.tsx
- uo
- compilerOptions
- importGraph.js
- q
- compilerOptions
- classifierHarness.mjs
- @webcontainer/api
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
- DealsPage.tsx
- resolver.ts
- constructor
- graphify reference: extra exports and benchmark
- sonner
- getComponentNameFromType
- 🔴 Ares Project
- add
- Forecast.tsx
- AuthContext.tsx
- danglingRefs.js
- components.json
- e
- Performance.tsx
- What You Must Do When Invoked
- At
- graphify reference: add a URL and watch a folder
- scripts
- checkKeyStringCoercion
- CLAUDE.md — Wyrd Forge (NSS-Project)
- graphify reference: commit hook and native CLAUDE.md integration
- laneRouting.js
- /graphify
- MetricsPage.tsx
- AdminDashboard.tsx
- ddlProposedGate.e2e.test.ts
- describeUnknownElementTypeFrameInDEV
- FileExplorer.tsx
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- BrowserCompiler.ts
- createIntentAccumulator
- useProjectFiles.ts
- forge_snapshots
- ref_lib_utils
- graphify reference: transcribe video and audio
- table.tsx
- graphify
- migrationContentGate.test.js
- bootstrapProject.test.js
- extraction-spec.md
- analyticsService.ts
- NOT_TARGETED_STILL_IMPORTED
- metaAdsService.ts
- MAX_CHARS_PER_BATCH
- MAX_FILES_PER_BATCH
- PROMPT_ROW_EXCLUDED_PREFIXES
- PROMPT_ROW_LIMIT
- SOURCE_EXTENSIONS
- context.ts
- ProjectHubPage.tsx
- MODULE_EXTENSIONS
- _set
- ClientDashboard.tsx
- meta_connections
- deduct_credits
- rlsPolicyGuard.d.ts
- embed-patterns.ts
- deduct_credits
- forge_credit_transactions
- applyEdits.js
- contextService
- ddlProposalState.d.ts
- codegraph
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
- react

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
- `0. CERRADO Y CONFIRMADO EN PRODUCCIÓN — Guard RLS "no actuó" tras G-4: REENCUADRADO, no era regresión de G-3 (2026-09-17)` --references--> `rlsPolicyWarnings()`  [INFERRED]
  QUEUE.md → src/utils/rlsPolicyGuard.js
- `buildNoMemoryIntent()` --calls--> `promptNeedsServer()`  [EXTRACTED]
  server/noMemoryFallbackNeedsServer.test.js → src/utils/serverLogicSignals.js
- `orchestratorBridge()` --calls--> `resolveMigrationTargets()`  [EXTRACTED]
  server/projectMemoryMigrationPaths.test.js → src/utils/migrationPath.js
- `gateActive()` --calls--> `touchesMigrations()`  [EXTRACTED]
  server/migrationContentGate.test.js → src/utils/migrationGate.js

## Import Cycles
- None detected.

## Communities (199 total, 70 thin omitted)

### Community 0 - "react-dom.development.js"
Cohesion: 0.01
Nodes (228): addEventBubbleListener(), addEventBubbleListenerWithPassiveFlag(), addEventCaptureListener(), addEventCaptureListenerWithPassiveFlag(), addTrappedEventListener(), callCallback(), canHydrateInstance(), canHydrateSuspenseInstance() (+220 more)

### Community 1 - "tailwindcss.js"
Cohesion: 0.02
Nodes (104): Aa(), Ap(), applyVariantOffset(), async(), av(), ba(), be(), blueGray() (+96 more)

### Community 2 - "AppSidebar.tsx"
Cohesion: 0.08
Nodes (17): ref_components_admin_userapprovalpanel, date-fns, ref_hooks_usenotifications, ref_services_notificationservice, AppSidebarProps, NavItem, navItems, Page (+9 more)

### Community 3 - "mergeLanes"
Cohesion: 0.06
Nodes (63): addFiberToLanesMap(), attemptContinuousHydration$1(), attemptHydrationAtCurrentPriority$1(), attemptSynchronousHydration$1(), batchedUpdates$1(), captureCommitPhaseErrorOnRoot(), checkForNestedUpdates(), checkIfSnapshotChanged() (+55 more)

### Community 4 - "ref_node_assert_strict"
Cohesion: 0.04
Nodes (48): esbuild, ref_node_assert_strict, ref_node_fs, ref_node_path, ref_node_test, ref_node_url, asHaikuJson(), asHaikuText() (+40 more)

### Community 5 - "StudioEngine"
Cohesion: 0.23
Nodes (5): formatSnapshotDate(), parseOid(), StudioEngine(), truncateLabel(), ProjectMemoryService

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

### Community 10 - "every"
Cohesion: 0.09
Nodes (38): ab(), ae(), As(), Bu(), Cb(), cf(), Db(), Eb() (+30 more)

### Community 11 - "remove"
Cohesion: 0.05
Nodes (61): after(), atrule(), beforeAfter(), block(), body(), calcBefore(), check(), cleanBrackets() (+53 more)

### Community 12 - "package.json"
Cohesion: 0.05
Nodes (39): name, private, type, version, autoprefixer, @babel/generator, @babel/types, clsx (+31 more)

### Community 13 - "push"
Cohesion: 0.03
Nodes (90): accumulateEnterLeaveListenersForEvent(), accumulateEnterLeaveTwoPhaseListeners(), accumulateOrCreateContinuousQueuedReplayableEvent(), accumulateSinglePhaseListeners(), accumulateTwoPhaseListeners(), assertIsMounted(), attemptExplicitHydrationTarget(), attemptSynchronousHydration() (+82 more)

### Community 14 - "t"
Cohesion: 0.07
Nodes (65): o(), u(), Ah(), ai(), append(), applyParallelOffset(), Bi(), bo() (+57 more)

### Community 15 - "tailwindcss-browser.js"
Cohesion: 0.07
Nodes (54): compoundsWith(), constructor(), dl(), Dn(), dr(), end(), error(), et() (+46 more)

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
Nodes (40): isEditableSrcPath(), KNOWN_DEP_VERSIONS, LLMResponse, ModifiedFile, NODE_BUILTINS, OrchestratorResult, packageNameFromSpecifier(), Architect (+32 more)

### Community 20 - ".parseUserCommand"
Cohesion: 0.12
Nodes (6): AIOrchestrator, generateBlueprintFromFiles(), getPageImportFiles(), selectRelevantFiles(), trackAICall(), isAbortError()

### Community 21 - "updateWorkInProgressHook"
Cohesion: 0.06
Nodes (45): areHookInputsEqual(), basicStateReducer(), createFunctionComponentUpdateQueue(), getWorkInProgressRoot(), includesBlockingLane(), includesOnlyNonUrgentLanes(), isSubsetOfLanes(), markSkippedUpdateLanes() (+37 more)

### Community 22 - "has"
Cohesion: 0.05
Nodes (72): _3(), a3(), Af(), al(), arbitraryProperty(), _b(), B3(), before() (+64 more)

### Community 23 - ".getInstance"
Cohesion: 0.13
Nodes (5): ChatPersistenceService, CollaboratorService, DesignContextService, NotificationService, PatternRetriever

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
Cohesion: 0.09
Nodes (22): jszip, react-resizable-panels, @xterm/addon-fit, @xterm/xterm, ref_xterm_xterm_css_xterm_css, CommandBubble(), CommandBubbleProps, CommandModal() (+14 more)

### Community 28 - "beginWork"
Cohesion: 0.06
Nodes (92): adoptClassInstance(), applyDerivedStateFromProps(), attemptEarlyBailoutIfNoScheduledUpdate(), bailoutHooks(), bailoutOnAlreadyFinishedWork(), beginWork(), cacheContext(), callComponentWillMount() (+84 more)

### Community 29 - "popHydrationState"
Cohesion: 0.09
Nodes (32): createFiberFromHostInstanceForDeletion(), deleteHydratableInstance(), didNotFindHydratableInstance(), didNotFindHydratableInstanceWithinContainer(), didNotFindHydratableInstanceWithinSuspenseInstance(), didNotFindHydratableTextInstance(), didNotFindHydratableTextInstanceWithinContainer(), didNotFindHydratableTextInstanceWithinSuspenseInstance() (+24 more)

### Community 30 - "push"
Cohesion: 0.10
Nodes (32): cloneDiv(), colorStops(), content(), css(), e3(), Fr(), getAsyncError(), getIterator() (+24 more)

### Community 31 - "compilerPerfHarness.mjs"
Cohesion: 0.06
Nodes (54): @babel/parser, @babel/traverse, ref_fs, ref_node_os, ALIAS, ALIAS_EXTRA_SOLO_HARNESS, bytesLabel(), checkIconsPresent() (+46 more)

### Community 32 - "SettingsModal.tsx"
Cohesion: 0.05
Nodes (41): @monaco-editor/react, ref_services_platformservice, ref_services_projectdbservice, CWV, LighthousePanel(), LighthousePanelProps, scoreColor(), ScoreGauge() (+33 more)

### Community 33 - "ChildReconciler"
Cohesion: 0.14
Nodes (40): checkDepsAreArrayDev(), ChildReconciler(), createChild(), deleteChild(), deleteRemainingChildren(), mapRemainingChildren(), placeChild(), placeSingleChild() (+32 more)

### Community 34 - "migrationDirNormalization.test.js"
Cohesion: 0.15
Nodes (24): NOW, orchestrate(), persistedPaths(), ROOT, T, count(), NOW, orchestratorBridge() (+16 more)

### Community 35 - "PreviewOverlay.tsx"
Cohesion: 0.21
Nodes (10): react-moveable, ElementEditPopover(), ElementEditPopoverProps, DEFAULT_LAYOUT_CONTEXT, ElementInfo, getTranslateFromClass(), PreviewOverlay(), PreviewOverlayProps (+2 more)

### Community 36 - "ChatInterface.tsx"
Cohesion: 0.23
Nodes (12): react-markdown, getPlainEnglish(), isLastDone(), isLastError(), ProgressLine, actionVerb(), BuildProgress(), ChatInterface() (+4 more)

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

### Community 41 - "projectDBService"
Cohesion: 0.19
Nodes (8): graphify, For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal, Interpreter guard for subcommands, projectDBService

### Community 42 - "DDLApprovalButton.tsx"
Cohesion: 0.20
Nodes (11): ref_services_migrationrunner, ref_utils_ddlguard_js, ref_utils_ddlproposalstate_js, DDLApprovalButton(), fileName(), Props, fileName(), FlaggedStatement (+3 more)

### Community 43 - "server.js"
Cohesion: 0.05
Nodes (40): messages(), value(), @anthropic-ai/sdk, ref_crypto, ref_dns_promises, ref_dotenv_config, express, stripe (+32 more)

### Community 44 - "lucide-react"
Cohesion: 0.04
Nodes (49): ref_components_appsidebar, ref_components_forge_creditbalance, ref_components_forge_newprojectmodal, ref_components_forge_shareprojectmodal, ref_components_topbar, ref_contexts_authcontext, ref_contexts_viewmodecontext, framer-motion (+41 more)

### Community 45 - "DesignBriefService"
Cohesion: 0.09
Nodes (11): parseFontsFromDesignMd(), reinjectBrandBriefIfDropped(), BrandColor, DesignBrief, DesignBriefService, PoolImage, REQUIRED_BRAND_VARS, SiteFacts (+3 more)

### Community 46 - "A4"
Cohesion: 0.15
Nodes (18): A4(), bb(), C4(), E4(), hr(), jb(), k4(), Lu() (+10 more)

### Community 47 - "ddlProposalState.js"
Cohesion: 0.15
Nodes (27): proposes(), resolves(), states(), APPLIED, buildOutcomeMessage(), ddlOutcomeMark(), ddlProposedMark(), EXECUTABLE (+19 more)

### Community 48 - "planGuard.test.js"
Cohesion: 0.15
Nodes (22): completePlan(), step(), orders(), paths(), section(), step(), buildPlanRepairNote(), INITIAL_BUILD_REQUIRED_PATHS (+14 more)

### Community 49 - "rlsPolicyGuard.js"
Cohesion: 0.14
Nodes (28): 0. CERRADO Y CONFIRMADO EN PRODUCCIÓN — Guard RLS "no actuó" tras G-4: REENCUADRADO, no era regresión de G-3 (2026-09-17), applyGuard(), addMissingRls(), ALLOWED_PUBLIC_COMMANDS, alterTableAnchorsInSql(), createTableAnchorsInSql(), displayIdentifier(), evaluateRlsPolicies() (+20 more)

### Community 50 - "wo"
Cohesion: 0.13
Nodes (30): addKeyframes(), Be(), Bi(), bo(), Cn(), compare(), compound(), Do() (+22 more)

### Community 51 - "SupabaseService"
Cohesion: 0.12
Nodes (13): @supabase/supabase-js, SUPABASE_ANON_KEY, SUPABASE_URL, USE_MOCK_DATA, PersistedChatMessage, Collaborator, InviteEntry, CreateNotificationParams (+5 more)

### Community 52 - "MigrationRunner.ts"
Cohesion: 0.15
Nodes (21): BASE, SRC, asColumns(), columnKey(), describeError(), MigrationOutcome, MigrationResult, MigrationRunner (+13 more)

### Community 53 - "nl"
Cohesion: 0.11
Nodes (25): ao(), Aw(), Di(), Dw(), Ew(), G3(), il(), Iw() (+17 more)

### Community 54 - "get"
Cohesion: 0.12
Nodes (34): add(), Br(), Ci(), f(), clearNamespace(), entries(), Fo(), get() (+26 more)

### Community 55 - "replace"
Cohesion: 0.05
Nodes (72): addToError(), Bn(), br(), clone(), cloneAfter(), Dn(), dr(), each() (+64 more)

### Community 56 - "Verifier.ts"
Cohesion: 0.10
Nodes (28): batchFor(), EXPORT_MISMATCH, filesAfterPlan(), originalFiles(), RESOLVE_ERRORS, err(), CompileErrorDetail, HAIKU_REPAIR_CLASSES (+20 more)

### Community 57 - "PropertyPanel.tsx"
Cohesion: 0.11
Nodes (19): BRAND_VAR_ORDER, BrandVar, FONT_SIZES, FONT_WEIGHTS, hasToken(), isAlign(), isFontSize(), isFontWeight() (+11 more)

### Community 58 - "uo"
Cohesion: 0.16
Nodes (26): ao(), Ce(), dt(), Ee(), G(), It(), J(), Jt() (+18 more)

### Community 59 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 60 - "importGraph.js"
Cohesion: 0.11
Nodes (24): runDeleteSteps(), asMap(), DeleteVerdict, DeleteVerdictInput, deleteVerdict(), deletionTargetsTelemetry(), expandDeletionTargets(), NOT_TARGETED_STILL_IMPORTED (+16 more)

### Community 61 - "q"
Cohesion: 0.14
Nodes (21): ae(), l(), Bt(), Ei(), En(), ft(), hi(), l() (+13 more)

### Community 62 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 63 - "classifierHarness.mjs"
Cohesion: 0.12
Nodes (20): CHAT_HISTORY, classifyOutcome(), DELAY_MS, ENTRY_TS, HERE, loadClassifier(), main(), majorityOf() (+12 more)

### Community 64 - "@webcontainer/api"
Cohesion: 0.17
Nodes (9): @octokit/rest, @webcontainer/api, HistoryDrawer(), HistoryDrawerProps, RestoreMeta, Snapshot, TRIGGER_COLORS, TRIGGER_LABELS (+1 more)

### Community 65 - "platformService"
Cohesion: 0.11
Nodes (10): DeployManager(), DeployManagerProps, DeployStage, STAGE_MESSAGES, CreditBalance(), useAuth(), DISPLAY_DIVISOR, formatCredits() (+2 more)

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
Cohesion: 0.10
Nodes (23): @babel/standalone, @xyflow/react, ref_xyflow_react_dist_style_css, StateGraph(), StateGraphProps, InspectorPanel(), InspectorPanelProps, PropertyPanelProps (+15 more)

### Community 71 - "captureCommitPhaseError"
Cohesion: 0.04
Nodes (88): captureCommitPhaseError(), clearContainer(), clearSuspenseBoundary(), clearSuspenseBoundaryFromContainer(), commitAttachRef(), commitBeforeMutationEffects_complete(), commitBeforeMutationEffectsOnFiber(), commitDeletionEffects() (+80 more)

### Community 72 - "types.ts"
Cohesion: 0.13
Nodes (14): src_data, fetchItems(), fetchProfile(), AdminKPIs, Contact, DashboardKPIs, DataInterface, Deal (+6 more)

### Community 73 - "StaffFinance.tsx"
Cohesion: 0.04
Nodes (69): ref_components_emptystate, ref_components_pagination, ref_components_ui_badge, ref_components_ui_button, ref_components_ui_input, ref_components_ui_table, ref_contexts_languagecontext, ref_hooks_usepagination (+61 more)

### Community 74 - "error"
Cohesion: 0.21
Nodes (13): act(), enqueueTask(), error(), flushActQueue(), forwardRef(), isValidElementType(), lazy(), lazyInitializer() (+5 more)

### Community 75 - "handleTimeout"
Cohesion: 0.20
Nodes (18): advanceTimers(), cancelHostTimeout(), compare(), flushWork(), handleTimeout(), markTaskErrored(), peek(), pop() (+10 more)

### Community 76 - "DealsPage.tsx"
Cohesion: 0.18
Nodes (12): ClientProfile, CollaboratorEntry, DealHistoryPanel(), DealRevision, DealsPage(), DealWithContact, fmtCurrency(), stageBadgeClass (+4 more)

### Community 77 - "resolver.ts"
Cohesion: 0.24
Nodes (8): PatternInjector, InjectionPattern, PATTERN_DATA, PATTERN_REGISTRY, PATTERN_SUMMARY, formatPattern(), resolvePatterns(), ResolverResult

### Community 78 - "constructor"
Cohesion: 0.20
Nodes (12): Ar(), constructor(), createTokenizer(), ia(), mapResolve(), pl(), positionBy(), positionInside() (+4 more)

### Community 79 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 80 - "sonner"
Cohesion: 0.09
Nodes (19): ref_components_ui_card, ref_components_ui_label, ref_components_ui_switch, ref_components_ui_tabs, ref_services_collaboratorservice, sonner, getInitials(), PendingProfile (+11 more)

### Community 81 - "getComponentNameFromType"
Cohesion: 0.22
Nodes (14): cloneElementWithValidation(), createElementWithValidation(), getComponentNameFromType(), getContextName(), getCurrentComponentErrorInfo(), getDeclarationErrorAddendum(), getWrappedName(), isArray() (+6 more)

### Community 82 - "🔴 Ares Project"
Cohesion: 0.22
Nodes (8): 📦 Architecture, 🔴 Ares Project, 🛠 Features, 🧠 Intelligence, 🚀 Mission, ⚡ Powered by WebContainers, ✨ The "Killer Feature": True Visual Editing, 🎨 Visual & Interactive

### Community 83 - "add"
Cohesion: 0.07
Nodes (48): add(), already(), checkForWarning(), cleanFromUnprefixed(), cleanOtherPrefixes(), cloneBefore(), contain3d(), convert() (+40 more)

### Community 84 - "Forecast.tsx"
Cohesion: 0.14
Nodes (13): Deal, fmtCurrency(), fmtDate(), Forecast(), ForecastData, labels, MONTH_NAMES_EN, MONTH_NAMES_ES (+5 more)

### Community 85 - "AuthContext.tsx"
Cohesion: 0.15
Nodes (13): ref_react_dom_client, App(), AuthContext, AuthContextType, AuthProvider(), clearProfileCache(), readProfileCache(), writeProfileCache() (+5 more)

### Community 86 - "danglingRefs.js"
Cohesion: 0.14
Nodes (21): APP_HALF_UNWIRED, APP_UNWIRED, asMap(), blankOut(), boundNames(), danglingImportOf(), danglingRefsTelemetry(), exportedSymbols() (+13 more)

### Community 87 - "components.json"
Cohesion: 0.14
Nodes (13): aliases, components, utils, rsc, $schema, style, tailwind, baseColor (+5 more)

### Community 88 - "e"
Cohesion: 0.13
Nodes (29): An(), co(), #e(), functional(), Je(), jo(), keysInNamespaces(), le() (+21 more)

### Community 89 - "Performance.tsx"
Cohesion: 0.19
Nodes (11): defaultDateRange(), fmtDate(), labels, Milestone, milestoneBadgeClass, milestoneBadgeLabel, NpsRow, npsScoreBadgeClass() (+3 more)

### Community 90 - "What You Must Do When Invoked"
Cohesion: 0.12
Nodes (16): Part A - Structural extraction for code files, Part B - Semantic extraction (parallel subagents), Part C - Merge AST + semantic into final extraction, Step 0 - GitHub repos and multi-path merge (only if a URL or several paths), Step 1 - Ensure graphify is installed, Step 2.5 - Video and audio (only if video files detected), Step 2 - Detect files, Step 3 - Extract entities and relationships (+8 more)

### Community 91 - "At"
Cohesion: 0.18
Nodes (11): ar(), At(), Bn(), Eo(), Hn(), ke(), lr(), markUsedVariable() (+3 more)

### Community 92 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 93 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, embed:patterns, lint, preview, seed:patterns, start (+3 more)

### Community 94 - "checkKeyStringCoercion"
Cohesion: 0.24
Nodes (11): checkKeyStringCoercion(), cloneElement(), createElement(), defineKeyPropWarningGetter(), defineRefPropWarningGetter(), hasValidKey(), hasValidRef(), testStringCoercion() (+3 more)

### Community 95 - "CLAUDE.md — Wyrd Forge (NSS-Project)"
Cohesion: 0.22
Nodes (8): CLAUDE.md — Wyrd Forge (NSS-Project), Comandos, Fixtures, Límites duros, Protocolo de sesión — "1 sesión = 1 cirugía completa", Qué es esto, Reglas de comunicación (permanentes), Tablas clave (DB principal)

### Community 96 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 97 - "laneRouting.js"
Cohesion: 0.38
Nodes (9): canEnterFastLane(), hasNoRequiredPatterns(), hasOutOfUniverseWork(), isPlanLaneOnly(), isSelectableSrcFile(), isSimpleEditIntent(), PLAN_LANE_ONLY_TYPES, promptMentionsEdgeFunction() (+1 more)

### Community 98 - "/graphify"
Cohesion: 0.22
Nodes (8): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Usage, What graphify is for

### Community 99 - "MetricsPage.tsx"
Cohesion: 0.08
Nodes (31): recharts, ref_services_data_analyticsservice, ref_services_data_metaadsservice, AnalyticsRow, formatDate(), TrafficCharts(), TrafficChartsProps, AIReports() (+23 more)

### Community 100 - "AdminDashboard.tsx"
Cohesion: 0.20
Nodes (10): AdminDashboard(), CreditStats, DEFAULT_KPIS, ForgeStats, formatCurrency(), PlatformUsage, PlatformUsageRow, ROLE_LABELS (+2 more)

### Community 101 - "ddlProposedGate.e2e.test.ts"
Cohesion: 0.08
Nodes (32): el(), ref_services_aiorchestrator, ref_services_architect, ref_testing_library_jest_dom_vitest, @testing-library/react, @testing-library/user-event, ref_utils_ddlproposalstate, vitest (+24 more)

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
Nodes (18): backoffMs(), CompileDecision, CompileOptions, CompilePayload, compileRequest(), CompileResult, CompileVerdict, compileWithMeta() (+10 more)

### Community 107 - "createIntentAccumulator"
Cohesion: 0.36
Nodes (5): createIntentAccumulator(), accumulate(), close(), get(), toNonNegInt()

### Community 108 - "useProjectFiles.ts"
Cohesion: 0.39
Nodes (5): persistContent(), useProjectFiles(), UseProjectFilesReturn, normalizeBrandVars(), stripDataOid()

### Community 109 - "forge_snapshots"
Cohesion: 0.16
Nodes (14): cap_forge_snapshots, cap_forge_snapshots(), cap_snapshots_trigger, forge_projects, forge_snapshots, forge_snapshots_project_created_idx, forge_snapshots_project_id_idx, profiles (+6 more)

### Community 110 - "ref_lib_utils"
Cohesion: 0.10
Nodes (16): ref_lib_utils, @radix-ui/react-progress, @radix-ui/react-switch, @radix-ui/react-tabs, Card, CardContent, CardDescription, CardFooter (+8 more)

### Community 112 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 114 - "migrationContentGate.test.js"
Cohesion: 0.43
Nodes (6): gateActive(), ROOT, MIGRATIONS_SEGMENT, normalizePath(), touchesMigrations(), underMigrationsPrefix()

### Community 115 - "bootstrapProject.test.js"
Cohesion: 0.39
Nodes (5): bootstrapProject(), EXEC_SQL_DDL, RLS_TRIGGER_DDL, sendManagementQuery(), NORMALIZE_LINE

### Community 125 - "context.ts"
Cohesion: 0.36
Nodes (7): fileSystemTreeToMap(), flattenFileTree(), flattenFileTreeRecursive(), flattenTreeToMap(), generateBlueprintRecursive(), generateProjectBlueprint(), mapToFileSystemTree()

### Community 126 - "ProjectHubPage.tsx"
Cohesion: 0.12
Nodes (16): ref_components_settings_aihistorypanel, ref_components_settings_analytics_lighthousepanel, ref_components_settings_analytics_toppagestable, ref_components_settings_analytics_trafficcharts, ref_components_settings_db_databaseoverview, ref_components_settings_db_schemaviewer, ref_components_settings_db_sqleditor, ref_components_settings_db_usersmanager (+8 more)

### Community 128 - "_set"
Cohesion: 0.29
Nodes (7): _emitEvictions(), _entriesAscending(), _moveToRecent(), resize(), _set(), space(), Vu()

### Community 129 - "ClientDashboard.tsx"
Cohesion: 0.33
Nodes (6): ClientDashboard(), formatCurrency(), PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS, STATUS_COLORS, STATUS_LABELS

### Community 130 - "meta_connections"
Cohesion: 0.67
Nodes (3): meta_connections, meta_connections_user_id_idx, profiles

### Community 132 - "rlsPolicyGuard.d.ts"
Cohesion: 0.33
Nodes (5): RlsDangerousCommand, RlsFinding, RlsFindingReason, RlsMigrationInput, RlsVerdict

### Community 133 - "embed-patterns.ts"
Cohesion: 0.14
Nodes (13): dotenv, ref_path, @tailwindcss/vite, vite, @vitejs/plugin-react, ref_vitest_config, generateEmbedding(), main() (+5 more)

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

### Community 243 - "react"
Cohesion: 0.06
Nodes (23): react, ref_services_supabaseservice, DatabaseOverviewProps, KPI, EdgeFunction, EdgeFunctionsPanel(), EdgeFunctionsPanelProps, getLocalFunctions() (+15 more)

## Knowledge Gaps
- **696 isolated node(s):** `CodeGraph`, `codegraph`, `EmptyStateProps`, `TopbarProps`, `CreditStats` (+691 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1203 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **70 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `value()` connect `server.js` to `react-dom.development.js`, `tailwindcss.js`, `add`?**
  _High betweenness centrality (0.241) - this node is a cross-community bridge._
- **Why does `@supabase/supabase-js` connect `SupabaseService` to `AuthContext.tsx`, `server.js`, `package.json`, `embed-patterns.ts`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `ClientDashboard.tsx`, `AppSidebar.tsx`, `package.json`, `button.tsx`, `StudioEngine.tsx`, `SettingsModal.tsx`, `PreviewOverlay.tsx`, `ChatInterface.tsx`, `DDLApprovalButton.tsx`, `lucide-react`, `PropertyPanel.tsx`, `@webcontainer/api`, `platformService`, `ast.ts`, `StaffFinance.tsx`, `DealsPage.tsx`, `sonner`, `Forecast.tsx`, `AuthContext.tsx`, `Performance.tsx`, `MetricsPage.tsx`, `AdminDashboard.tsx`, `FileExplorer.tsx`, `useProjectFiles.ts`, `ref_lib_utils`, `table.tsx`, `ProjectHubPage.tsx`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `add()` (e.g. with `u()` and `p()`) actually correct?**
  _`add()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `CodeGraph`, `codegraph`, `EmptyStateProps` to the rest of the system?**
  _696 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `react-dom.development.js` be split into smaller, more focused modules?**
  _Cohesion score 0.010263007432818754 - nodes in this community are weakly interconnected._
- **Should `tailwindcss.js` be split into smaller, more focused modules?**
  _Cohesion score 0.018944961620120857 - nodes in this community are weakly interconnected._