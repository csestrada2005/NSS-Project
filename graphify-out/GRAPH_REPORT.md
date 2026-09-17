# Graph Report - NSS-Project  (2026-09-17)

## Corpus Check
- 299 files · ~461,518 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 4, .css 3, .graphify-bak 1)

## Summary
- 3973 nodes · 9396 edges · 226 communities (145 shown, 81 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 292 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8212577f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- react-dom.development.js
- tailwindcss.js
- captureCommitPhaseError
- ensureRootIsScheduled
- ref_node_assert_strict
- add
- diffHydratedProperties
- react-router.development.js
- completeWork
- has
- some
- split
- package.json
- push
- e
- tailwindcss-browser.js
- error
- dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay
- react-router-dom.development.js
- AIOrchestrator.ts
- .parseUserCommand
- mergeLanes
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
- describeNativeComponentFrame
- migrationDirNormalization.test.js
- PreviewOverlay.tsx
- uo
- react.development.js
- devDependencies
- commitRootImpl
- clone
- DDLApprovalButton.tsx
- ast.ts
- server.js
- App.tsx
- DesignBriefService
- ref_path
- ddlProposalState.js
- planGuard.test.js
- rlsPolicyGuard.js
- O
- SupabaseService
- MigrationRunner.ts
- Ms
- get
- replace
- Verifier.ts
- PropertyPanel.tsx
- createElement
- compilerOptions
- importGraph.js
- q
- compilerOptions
- classifierHarness.mjs
- danglingRefs.js
- PlatformService
- ProjectDetailPanel.tsx
- BrowserCompiler.ts
- ddlGuard.js
- templates.ts
- constructor
- ddlProposedGate.e2e.test.ts
- types.ts
- StaffContacts.tsx
- error
- handleTimeout
- ge
- resolver.ts
- ProjectMemoryService
- ChatInterface.tsx
- StaffFinance.tsx
- createElementWithValidation
- A4
- Ue
- Forecast.tsx
- AuthContext.tsx
- classifierDefaultTelemetry.test.js
- components.json
- co
- Performance.tsx
- CLAUDE.md — Wyrd Forge (NSS-Project)
- DealsPage.tsx
- mapIntoArray
- scripts
- checkKeyStringCoercion
- U
- vitest
- laneRouting.js
- CreditBalance.tsx
- MetricsPage.tsx
- AdminDashboard.tsx
- fakeFetch.ts
- describeUnknownElementTypeFrameInDEV
- FileExplorer.tsx
- WebAnalytics.tsx
- SQLEditor.tsx
- migrationContentGate.test.js
- edgeFunctionDeploy.test.js
- createIntentAccumulator
- useProjectFiles.ts
- table.tsx
- MetaAds.tsx
- ProjectDBService
- bootstrapProject.test.js
- unsplash.test.js
- AppSidebar.tsx
- LighthousePanel.tsx
- DevDashboard.tsx
- ClientFinance.tsx
- data/index.ts
- context.ts
- EdgeFunctionsPanel.tsx
- card.tsx
- ClientProjectPage.tsx
- ClientDashboard.tsx
- AIReports.tsx
- ProjectHubPage.tsx
- ProposalsPage.tsx
- UserApprovalPanel.tsx
- AIHistoryPanel.tsx
- UsersManager.tsx
- LanguageContext.tsx
- rlsPolicyGuard.d.ts
- embed-patterns.ts
- seed-patterns.ts
- credits.js
- applyEdits.js
- ShareProjectModal.tsx
- LogsViewer.tsx
- ForgeSessionContext.tsx
- ddlProposalState.d.ts
- DatabaseOverview.tsx
- Topbar.tsx
- badge.tsx
- button.tsx
- tabs.tsx
- RoleSelectionPage.tsx
- danglingRefs.d.ts
- ddlGuard.d.ts
- migrationIntent.d.ts
- Component
- pt
- mainProjectExecSql.test.js
- BottomNav.tsx
- EmptyState.tsx
- NewProjectModal.tsx
- UsagePanel.tsx
- label.tsx
- useNotifications.ts
- useProjectAccess.ts
- PendingApprovalPage.tsx
- applyEdits.d.ts
- ddlVerdict.d.ts
- groupCompileErrors.d.ts
- importGraph.d.ts
- tsconfig.json
- input.tsx
- progress.tsx
- switch.tsx
- jsxOrdinal.d.ts
- laneRouting.d.ts
- planGuard.d.ts
- planTrim.d.ts
- previewClient.ts
- schemaContext.ts
- forge-analytics-collector/index.ts
- forge-lighthouse/index.ts
- meta-data/index.ts
- meta-oauth-init/index.ts
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
- SecretsPanel.tsx
- DomainsPanel.tsx
- GitHubService

## God Nodes (most connected - your core abstractions)
1. `error()` - 118 edges
2. `push()` - 68 edges
3. `add()` - 67 edges
4. `replace()` - 54 edges
5. `has()` - 51 edges
6. `AIOrchestrator` - 43 edges
7. `uo()` - 43 edges
8. `remove()` - 40 edges
9. `completeWork()` - 40 edges
10. `push()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `chargeAccumulatedIntent()` --calls--> `computeCreditsFromTokens()`  [EXTRACTED]
  server.js → server/credits.js
- `orchestratorBridge()` --calls--> `resolveMigrationTargets()`  [EXTRACTED]
  server/projectMemoryMigrationPaths.test.js → src/utils/migrationPath.js
- `gateActive()` --calls--> `touchesMigrations()`  [EXTRACTED]
  server/migrationContentGate.test.js → src/utils/migrationGate.js
- `buildNoMemoryIntent()` --calls--> `promptNeedsServer()`  [EXTRACTED]
  server/noMemoryFallbackNeedsServer.test.js → src/utils/serverLogicSignals.js
- `proposes()` --calls--> `ddlProposedMark()`  [EXTRACTED]
  server/ddlProposalState.test.js → src/utils/ddlProposalState.js

## Import Cycles
- 1-file cycle: `server.js -> server.js`

## Communities (226 total, 81 thin omitted)

### Community 0 - "react-dom.development.js"
Cohesion: 0.01
Nodes (209): addEventBubbleListener(), addEventBubbleListenerWithPassiveFlag(), addEventCaptureListener(), addEventCaptureListenerWithPassiveFlag(), addTrappedEventListener(), callCallback(), canHydrateInstance(), canHydrateSuspenseInstance() (+201 more)

### Community 1 - "tailwindcss.js"
Cohesion: 0.02
Nodes (114): Aa(), Ap(), applyVariantOffset(), async(), av(), ba(), be(), blueGray() (+106 more)

### Community 2 - "captureCommitPhaseError"
Cohesion: 0.04
Nodes (96): callComponentWillMount(), captureCommitPhaseError(), clearContainer(), clearSuspenseBoundary(), clearSuspenseBoundaryFromContainer(), commitAttachRef(), commitBeforeMutationEffects_complete(), commitBeforeMutationEffectsOnFiber() (+88 more)

### Community 3 - "ensureRootIsScheduled"
Cohesion: 0.04
Nodes (88): attemptContinuousHydration$1(), attemptHydrationAtCurrentPriority$1(), attemptSynchronousHydration$1(), batchedUpdates$1(), cancelCallback$1(), captureCommitPhaseErrorOnRoot(), checkForNestedUpdates(), checkIfSnapshotChanged() (+80 more)

### Community 4 - "ref_node_assert_strict"
Cohesion: 0.06
Nodes (33): esbuild, ref_node_assert_strict, ref_node_fs, ref_node_path, ref_node_test, ref_node_url, collectSourceFiles(), ROOT (+25 more)

### Community 5 - "add"
Cohesion: 0.06
Nodes (66): _3(), add(), after(), al(), already(), B3(), before(), checkForWarning() (+58 more)

### Community 6 - "diffHydratedProperties"
Cohesion: 0.06
Nodes (63): appendChild(), appendChildToContainer(), appendInitialChild(), assertValidProps(), checkControlledValueProps(), checkSelectPropTypes(), createDangerousStringForStyles(), dangerousStyleValue() (+55 more)

### Community 7 - "react-router.development.js"
Cohesion: 0.06
Nodes (47): Await(), AwaitErrorBoundary, createMemoryRouter(), createRoutesFromChildren(), DataRoutes(), DefaultErrorComponent(), _extends(), getDataRouterConsoleError() (+39 more)

### Community 8 - "completeWork"
Cohesion: 0.05
Nodes (75): addSubtreeSuspenseContext(), attemptEarlyBailoutIfNoScheduledUpdate(), cloneUpdateQueue(), completeWork(), createCapturedValue(), cutOffTailIfNeeded(), findFirstSuspended(), findLastContentRow() (+67 more)

### Community 9 - "has"
Cohesion: 0.06
Nodes (52): addFiberToLanesMap(), attachPingListener(), attachRetryListener(), attachSuspenseRetryListeners(), checkClassInstance(), enqueueCapturedUpdate(), errorHydratingContainer(), finishQueueingConcurrentUpdates() (+44 more)

### Community 10 - "some"
Cohesion: 0.06
Nodes (56): a3(), o(), u(), Ah(), ai(), applyParallelOffset(), arbitraryProperty(), br() (+48 more)

### Community 11 - "split"
Cohesion: 0.06
Nodes (57): atrule(), beforeAfter(), block(), bm(), body(), calcBefore(), check(), cleanBrackets() (+49 more)

### Community 12 - "package.json"
Cohesion: 0.04
Nodes (55): name, private, type, version, autoprefixer, @babel/generator, @babel/standalone, @babel/types (+47 more)

### Community 13 - "push"
Cohesion: 0.05
Nodes (55): accumulateEnterLeaveListenersForEvent(), accumulateEnterLeaveTwoPhaseListeners(), accumulateSinglePhaseListeners(), accumulateTwoPhaseListeners(), constructSelectEvent(), createAndAccumulateChangeEvent(), createDispatchListener(), createLaneMap() (+47 more)

### Community 14 - "e"
Cohesion: 0.09
Nodes (54): ae(), append(), As(), bb(), bo(), Df(), e(), e3() (+46 more)

### Community 15 - "tailwindcss-browser.js"
Cohesion: 0.07
Nodes (45): ar(), At(), Bn(), constructor(), dl(), Dn(), end(), Eo() (+37 more)

### Community 16 - "error"
Cohesion: 0.08
Nodes (50): checkAttributeStringCoercion(), checkCSSPropertyStringCoercion(), checkDepsAreArrayDev(), checkFormFieldValueStringCoercion(), checkHtmlStringCoercion(), checkKeyStringCoercion(), checkPropStringCoercion(), createContainer() (+42 more)

### Community 17 - "dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay"
Cohesion: 0.06
Nodes (41): accumulateOrCreateContinuousQueuedReplayableEvent(), assertIsMounted(), attemptExplicitHydrationTarget(), attemptReplayContinuousQueuedEvent(), attemptReplayContinuousQueuedEventInMap(), attemptSynchronousHydration(), batchedUpdates(), clearIfContinuousEvent() (+33 more)

### Community 18 - "react-router-dom.development.js"
Cohesion: 0.08
Nodes (36): createBrowserRouter(), createHashRouter(), createSearchParams(), Deferred, deserializeErrors(), _extends(), flushSyncSafe(), getDataRouterConsoleError() (+28 more)

### Community 19 - "AIOrchestrator.ts"
Cohesion: 0.07
Nodes (29): getPageImportFiles(), isEditableSrcPath(), KNOWN_DEP_VERSIONS, LLMResponse, ModifiedFile, NODE_BUILTINS, OrchestratorResult, packageNameFromSpecifier() (+21 more)

### Community 20 - ".parseUserCommand"
Cohesion: 0.13
Nodes (6): AIOrchestrator, generateBlueprintFromFiles(), selectRelevantFiles(), trackAICall(), Intent, isAbortError()

### Community 21 - "mergeLanes"
Cohesion: 0.06
Nodes (53): areHookInputsEqual(), basicStateReducer(), createFunctionComponentUpdateQueue(), getBitLength(), getLeadingBit(), getTreeId(), getWorkInProgressRoot(), includesBlockingLane() (+45 more)

### Community 22 - "has"
Cohesion: 0.07
Nodes (44): Af(), _b(), d(), delete(), _deleteIfExpired(), Ef(), eh(), Ei() (+36 more)

### Community 23 - ".getInstance"
Cohesion: 0.19
Nodes (3): CollaboratorService, NotificationService, PatternRetriever

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
Cohesion: 0.06
Nodes (32): jszip, react-resizable-panels, react-router-dom, sonner, CommandBubble(), CommandBubbleProps, CommandModal(), CommandModalProps (+24 more)

### Community 28 - "beginWork"
Cohesion: 0.05
Nodes (114): adoptClassInstance(), applyDerivedStateFromProps(), bailoutHooks(), bailoutOnAlreadyFinishedWork(), beginWork(), cacheContext(), callComponentWillReceiveProps(), checkDidRenderIdHook() (+106 more)

### Community 29 - "popHydrationState"
Cohesion: 0.08
Nodes (37): bubbleProperties(), completeDehydratedSuspenseBoundary(), createFiberFromHostInstanceForDeletion(), deleteHydratableInstance(), didNotFindHydratableInstance(), didNotFindHydratableInstanceWithinContainer(), didNotFindHydratableInstanceWithinSuspenseInstance(), didNotFindHydratableTextInstance() (+29 more)

### Community 30 - "push"
Cohesion: 0.09
Nodes (37): cloneDiv(), colorStops(), content(), convert(), css(), d3(), Fr(), getAsyncError() (+29 more)

### Community 31 - "compilerPerfHarness.mjs"
Cohesion: 0.06
Nodes (55): @babel/parser, @babel/traverse, ref_fs, ref_node_os, ALIAS, ALIAS_EXTRA_SOLO_HARNESS, bytesLabel(), checkIconsPresent() (+47 more)

### Community 32 - "SettingsModal.tsx"
Cohesion: 0.09
Nodes (22): DeployManager(), DeployManagerProps, DeployStage, STAGE_MESSAGES, PageStat, TopPagesTable(), TopPagesTableProps, Column (+14 more)

### Community 33 - "describeNativeComponentFrame"
Cohesion: 0.19
Nodes (14): createCapturedValueAtFiber(), describeBuiltInComponentFrame(), describeClassComponentFrame(), describeFiber(), describeFunctionComponentFrame(), describeNativeComponentFrame(), describeUnknownElementTypeFrameInDEV(), disabledLog() (+6 more)

### Community 34 - "migrationDirNormalization.test.js"
Cohesion: 0.15
Nodes (23): NOW, orchestrate(), persistedPaths(), ROOT, T, NOW, orchestratorBridge(), ROOT (+15 more)

### Community 35 - "PreviewOverlay.tsx"
Cohesion: 0.21
Nodes (11): ElementEditPopover(), ElementEditPopoverProps, DEFAULT_LAYOUT_CONTEXT, ElementInfo, getTranslateFromClass(), PreviewOverlay(), PreviewOverlayProps, Rect (+3 more)

### Community 36 - "uo"
Cohesion: 0.13
Nodes (34): Ce(), compound(), Do(), Fn(), ft(), functional(), It(), jn() (+26 more)

### Community 37 - "react.development.js"
Cohesion: 0.09
Nodes (20): TODO: Second argument used to be an optional `calculateChangedBits`, TODO: add a more generic warning for invalid values., TODO: Drop this when these are no longer allowed as the type argument., TODO: Use symbols?, TODO: Test that a single child and an array with one item have the same key, resolveDispatcher(), useCallback(), useDebugValue() (+12 more)

### Community 38 - "devDependencies"
Cohesion: 0.06
Nodes (32): devDependencies, autoprefixer, esbuild, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+24 more)

### Community 39 - "commitRootImpl"
Cohesion: 0.08
Nodes (36): commitLayoutEffects(), commitLayoutEffects_begin(), commitMutationEffects(), commitPassiveMountEffects(), commitPassiveMountEffects_begin(), commitPassiveUnmountEffects(), commitRoot(), commitRootImpl() (+28 more)

### Community 40 - "clone"
Cohesion: 0.11
Nodes (30): Bn(), clone(), cloneAfter(), eo(), Fn(), FS(), group(), Ht() (+22 more)

### Community 41 - "DDLApprovalButton.tsx"
Cohesion: 0.19
Nodes (12): lucide-react, ref_services_migrationrunner, ref_utils_ddlguard_js, ref_utils_ddlproposalstate_js, DDLApprovalButton(), fileName(), Props, fileName() (+4 more)

### Community 42 - "ast.ts"
Cohesion: 0.12
Nodes (18): StateGraph(), StateGraphProps, InspectorPanel(), InspectorPanelProps, PropertyPanelProps, analyzeDependencyGraph(), CONFLICT_PREFIXES, extractComponentProps() (+10 more)

### Community 43 - "server.js"
Cohesion: 0.08
Nodes (24): @anthropic-ai/sdk, ref_crypto, ref_dns_promises, ref_dotenv_config, express, stripe, @supabase/supabase-js, ref_url (+16 more)

### Community 44 - "App.tsx"
Cohesion: 0.09
Nodes (17): Login(), ProtectedRoute(), StudioLayout(), WorkspaceLayout(), AIStudioPage(), HistoryEntry, Message, Tab (+9 more)

### Community 45 - "DesignBriefService"
Cohesion: 0.13
Nodes (3): parseFontsFromDesignMd(), reinjectBrandBriefIfDropped(), DesignBriefService

### Community 46 - "ref_path"
Cohesion: 0.50
Nodes (3): ref_path, @vitejs/plugin-react, ref_vitest_config

### Community 47 - "ddlProposalState.js"
Cohesion: 0.15
Nodes (27): proposes(), resolves(), states(), APPLIED, buildOutcomeMessage(), ddlOutcomeMark(), ddlProposedMark(), EXECUTABLE (+19 more)

### Community 48 - "planGuard.test.js"
Cohesion: 0.11
Nodes (25): completePlan(), step(), orders(), paths(), section(), step(), Architect, src_utils_importgraph_filemap (+17 more)

### Community 49 - "rlsPolicyGuard.js"
Cohesion: 0.15
Nodes (27): applyGuard(), addMissingRls(), ALLOWED_PUBLIC_COMMANDS, alterTableAnchorsInSql(), createTableAnchorsInSql(), displayIdentifier(), evaluateRlsPolicies(), extractParenBody() (+19 more)

### Community 50 - "O"
Cohesion: 0.12
Nodes (28): addKeyframes(), compoundsWith(), F(), fromAst(), G(), getKeyframes(), ho(), keys() (+20 more)

### Community 51 - "SupabaseService"
Cohesion: 0.05
Nodes (22): SUPABASE_ANON_KEY, SUPABASE_URL, USE_MOCK_DATA, PersistedChatMessage, Collaborator, InviteEntry, AnalyticsConnection, GADailyRow (+14 more)

### Community 52 - "MigrationRunner.ts"
Cohesion: 0.15
Nodes (21): BASE, SRC, asColumns(), columnKey(), describeError(), MigrationOutcome, MigrationResult, MigrationRunner (+13 more)

### Community 53 - "Ms"
Cohesion: 0.10
Nodes (27): ao(), Aw(), Bi(), Di(), Dw(), Ew(), G3(), il() (+19 more)

### Community 54 - "get"
Cohesion: 0.15
Nodes (27): add(), Br(), Ci(), f(), clearNamespace(), Fo(), get(), getCompletions() (+19 more)

### Community 55 - "replace"
Cohesion: 0.11
Nodes (25): addToError(), Dn(), dr(), et(), It(), lt(), mt(), negative() (+17 more)

### Community 56 - "Verifier.ts"
Cohesion: 0.09
Nodes (33): batchFor(), EXPORT_MISMATCH, filesAfterPlan(), originalFiles(), RESOLVE_ERRORS, err(), DEFAULT_INTENT, CompileErrorDetail (+25 more)

### Community 57 - "PropertyPanel.tsx"
Cohesion: 0.11
Nodes (19): BRAND_VAR_ORDER, BrandVar, FONT_SIZES, FONT_WEIGHTS, hasToken(), isAlign(), isFontSize(), isFontWeight() (+11 more)

### Community 58 - "createElement"
Cohesion: 0.12
Nodes (20): checkForUnmatchedText(), commitUpdate(), createElement(), createInstance(), createTextInstance(), createTextNode(), didNotMatchHydratedContainerTextInstance(), didNotMatchHydratedTextInstance() (+12 more)

### Community 59 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 60 - "importGraph.js"
Cohesion: 0.13
Nodes (22): runDeleteSteps(), asMap(), DeleteVerdict, DeleteVerdictInput, deleteVerdict(), deletionTargetsTelemetry(), expandDeletionTargets(), NOT_TARGETED_STILL_IMPORTED (+14 more)

### Community 61 - "q"
Cohesion: 0.15
Nodes (23): ae(), l(), Be(), bo(), Bt(), compare(), Ei(), En() (+15 more)

### Community 62 - "compilerOptions"
Cohesion: 0.09
Nodes (22): ES2023, node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module (+14 more)

### Community 63 - "classifierHarness.mjs"
Cohesion: 0.12
Nodes (20): CHAT_HISTORY, classifyOutcome(), DELAY_MS, ENTRY_TS, HERE, loadClassifier(), main(), majorityOf() (+12 more)

### Community 64 - "danglingRefs.js"
Cohesion: 0.15
Nodes (20): APP_HALF_UNWIRED, APP_UNWIRED, asMap(), blankOut(), boundNames(), danglingImportOf(), danglingRefsTelemetry(), exportedSymbols() (+12 more)

### Community 65 - "PlatformService"
Cohesion: 0.14
Nodes (9): BrandColor, DesignBrief, PoolImage, REQUIRED_BRAND_VARS, SiteFacts, SiteHours, SiteInfoShape, VALID_DIRECTIONS (+1 more)

### Community 66 - "ProjectDetailPanel.tsx"
Cohesion: 0.11
Nodes (17): ClientProjects(), labels, ProjectWithClient, statusBadgeClass, labels, ProjectDetailPanel(), ProjectDetailPanelProps, ProjectWithClient (+9 more)

### Community 67 - "BrowserCompiler.ts"
Cohesion: 0.14
Nodes (20): PublicPreviewPage(), backoffMs(), compile(), CompileDecision, CompileOptions, CompilePayload, compileRequest(), CompileResult (+12 more)

### Community 68 - "ddlGuard.js"
Cohesion: 0.21
Nodes (18): kinds(), targets(), DELETE_WITHOUT_WHERE, destructiveTargets(), DROP, DROP_COLUMN, findDestructiveDDL(), isDestructiveDDL() (+10 more)

### Community 69 - "templates.ts"
Cohesion: 0.14
Nodes (14): commonFiles, commonSrc, TEMPLATES, MOTION_DIR, SEO_FILE, bridgeTokens(), COLOR_PROPS, file() (+6 more)

### Community 70 - "constructor"
Cohesion: 0.14
Nodes (19): Ar(), constructor(), createTokenizer(), ia(), isStretch(), load(), mapResolve(), old() (+11 more)

### Community 71 - "ddlProposedGate.e2e.test.ts"
Cohesion: 0.26
Nodes (11): ref_utils_ddlproposalstate, claudeTextResponse(), extractSystemText(), installRig(), jsonResponse(), MIGRATION_STEP, NO_MIGRATION_STEP, parseBody() (+3 more)

### Community 72 - "types.ts"
Cohesion: 0.20
Nodes (9): AdminKPIs, Contact, DashboardKPIs, DataInterface, Deal, DealStatus, Payment, Project (+1 more)

### Community 73 - "StaffContacts.tsx"
Cohesion: 0.14
Nodes (14): ClientContactView(), labels, typeBadgeClass, ContactDetailPanel(), ContactDetailPanelProps, labels, typeBadgeClass, ContactForm() (+6 more)

### Community 74 - "error"
Cohesion: 0.14
Nodes (18): act(), createContext(), createFactoryWithValidation(), enqueueTask(), error(), flushActQueue(), forwardRef(), isValidElementType() (+10 more)

### Community 75 - "handleTimeout"
Cohesion: 0.20
Nodes (18): advanceTimers(), cancelHostTimeout(), compare(), flushWork(), handleTimeout(), markTaskErrored(), peek(), pop() (+10 more)

### Community 76 - "ge"
Cohesion: 0.14
Nodes (18): dr(), ge(), f(), h(), he(), kind(), li(), mr() (+10 more)

### Community 77 - "resolver.ts"
Cohesion: 0.24
Nodes (8): PatternInjector, InjectionPattern, PATTERN_DATA, PATTERN_REGISTRY, PATTERN_SUMMARY, formatPattern(), resolvePatterns(), ResolverResult

### Community 79 - "ChatInterface.tsx"
Cohesion: 0.23
Nodes (12): react-markdown, getPlainEnglish(), isLastDone(), isLastError(), ProgressLine, actionVerb(), BuildProgress(), ChatInterface() (+4 more)

### Community 80 - "StaffFinance.tsx"
Cohesion: 0.16
Nodes (14): formatCurrency(), labels, PaymentDetailPanel(), PaymentDetailPanelProps, PaymentWithProject, statusBadgeClass, labels, PaymentForm() (+6 more)

### Community 81 - "createElementWithValidation"
Cohesion: 0.18
Nodes (16): cloneElementWithValidation(), createElementWithValidation(), getComponentNameFromType(), getContextName(), getCurrentComponentErrorInfo(), getDeclarationErrorAddendum(), getSourceInfoErrorAddendum(), getSourceInfoErrorAddendumForProps() (+8 more)

### Community 82 - "A4"
Cohesion: 0.17
Nodes (16): A4(), C4(), E4(), hr(), jb(), k4(), Lu(), Mb() (+8 more)

### Community 83 - "Ue"
Cohesion: 0.18
Nodes (16): ab(), Bu(), Cb(), Eb(), g4(), h4(), ki(), m4() (+8 more)

### Community 84 - "Forecast.tsx"
Cohesion: 0.14
Nodes (13): Deal, fmtCurrency(), fmtDate(), Forecast(), ForecastData, labels, MONTH_NAMES_EN, MONTH_NAMES_ES (+5 more)

### Community 85 - "AuthContext.tsx"
Cohesion: 0.18
Nodes (11): App(), AuthContext, AuthContextType, AuthProvider(), clearProfileCache(), readProfileCache(), writeProfileCache(), ViewMode (+3 more)

### Community 86 - "classifierDefaultTelemetry.test.js"
Cohesion: 0.18
Nodes (9): asHaikuJson(), asHaikuText(), ENTRY_TS, HERE, PROJECT_MEMORY, REPO_ROOT, stubPlatformService, transport (+1 more)

### Community 87 - "components.json"
Cohesion: 0.14
Nodes (13): aliases, components, utils, rsc, $schema, style, tailwind, baseColor (+5 more)

### Community 88 - "co"
Cohesion: 0.19
Nodes (14): An(), co(), #e(), entries(), keysInNamespaces(), lo(), Pr(), prefixKey() (+6 more)

### Community 89 - "Performance.tsx"
Cohesion: 0.19
Nodes (11): defaultDateRange(), fmtDate(), labels, Milestone, milestoneBadgeClass, milestoneBadgeLabel, NpsRow, npsScoreBadgeClass() (+3 more)

### Community 90 - "CLAUDE.md — Wyrd Forge (NSS-Project)"
Cohesion: 0.18
Nodes (10): CLAUDE.md — Wyrd Forge (NSS-Project), Comandos, Fixtures, graphify, Graphify — cuándo sí y cuándo no, Límites duros, Protocolo de sesión — "1 sesión = 1 cirugía completa", Qué es esto (+2 more)

### Community 91 - "DealsPage.tsx"
Cohesion: 0.18
Nodes (12): ClientProfile, CollaboratorEntry, DealHistoryPanel(), DealRevision, DealsPage(), DealWithContact, fmtCurrency(), stageBadgeClass (+4 more)

### Community 92 - "mapIntoArray"
Cohesion: 0.17
Nodes (12): cloneAndReplaceKey(), countChildren(), escape(), escapeUserProvidedKey(), forEachChildren(), getElementKey(), getIteratorFn(), isValidElement() (+4 more)

### Community 93 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, embed:patterns, lint, preview, seed:patterns, start (+3 more)

### Community 94 - "checkKeyStringCoercion"
Cohesion: 0.24
Nodes (11): checkKeyStringCoercion(), cloneElement(), createElement(), defineKeyPropWarningGetter(), defineRefPropWarningGetter(), hasValidKey(), hasValidRef(), testStringCoercion() (+3 more)

### Community 95 - "U"
Cohesion: 0.25
Nodes (11): ao(), Bi(), Cn(), dt(), Ee(), ii(), J(), rn() (+3 more)

### Community 96 - "vitest"
Cohesion: 0.20
Nodes (6): el(), ref_testing_library_jest_dom_vitest, @testing-library/react, @testing-library/user-event, vitest, PaginationProps

### Community 97 - "laneRouting.js"
Cohesion: 0.38
Nodes (9): canEnterFastLane(), hasNoRequiredPatterns(), hasOutOfUniverseWork(), isPlanLaneOnly(), isSelectableSrcFile(), isSimpleEditIntent(), PLAN_LANE_ONLY_TYPES, promptMentionsEdgeFunction() (+1 more)

### Community 98 - "CreditBalance.tsx"
Cohesion: 0.29
Nodes (5): CreditBalance(), useAuth(), DISPLAY_DIVISOR, formatCredits(), CreditService

### Community 99 - "MetricsPage.tsx"
Cohesion: 0.24
Nodes (8): AnalyticsRow, formatDate(), TrafficCharts(), TrafficChartsProps, ForgeAnalyticsSummary(), ForgeProject, TabId, TABS

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

### Community 104 - "WebAnalytics.tsx"
Cohesion: 0.33
Nodes (7): defaultDateRange(), fmtCurrency(), fmtDate(), fmtDuration(), fmtNumber(), toYMD(), WebAnalytics()

### Community 105 - "SQLEditor.tsx"
Cohesion: 0.33
Nodes (8): @monaco-editor/react, react, ref_services_projectdbservice, formatQueryError(), loadHistory(), saveToHistory(), SQLEditor(), SQLEditorProps

### Community 106 - "migrationContentGate.test.js"
Cohesion: 0.43
Nodes (6): gateActive(), ROOT, MIGRATIONS_SEGMENT, normalizePath(), touchesMigrations(), underMigrationsPrefix()

### Community 107 - "edgeFunctionDeploy.test.js"
Cohesion: 0.24
Nodes (8): deployEdgeFunctionViaManagement(), validateEdgeFunctionDeployRequest(), requireAuth(), requireProjectOwnership(), EDGE_FUNCTIONS_DIR, edgeFunctionSlug(), isEdgeFunctionEntrypoint(), isValidEdgeFunctionSlug()

### Community 108 - "createIntentAccumulator"
Cohesion: 0.33
Nodes (5): createIntentAccumulator(), accumulate(), close(), get(), toNonNegInt()

### Community 109 - "useProjectFiles.ts"
Cohesion: 0.39
Nodes (5): persistContent(), useProjectFiles(), UseProjectFilesReturn, normalizeBrandVars(), stripDataOid()

### Community 110 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 111 - "MetaAds.tsx"
Cohesion: 0.36
Nodes (6): defaultDateRange(), fmtCurrency(), fmtDate(), fmtNumber(), MetaAds(), toYMD()

### Community 113 - "bootstrapProject.test.js"
Cohesion: 0.39
Nodes (5): bootstrapProject(), EXEC_SQL_DDL, RLS_TRIGGER_DDL, sendManagementQuery(), NORMALIZE_LINE

### Community 114 - "unsplash.test.js"
Cohesion: 0.39
Nodes (4): searchOneKeyword(), searchUnsplash(), triggerUnsplashDownloads(), withUtmParams()

### Community 115 - "AppSidebar.tsx"
Cohesion: 0.25
Nodes (6): AppSidebarProps, NavItem, navItems, Page, ROLE_LABELS, routeMapping

### Community 116 - "LighthousePanel.tsx"
Cohesion: 0.29
Nodes (6): CWV, LighthousePanel(), LighthousePanelProps, scoreColor(), ScoreGauge(), Scores

### Community 117 - "DevDashboard.tsx"
Cohesion: 0.32
Nodes (7): DEFAULT_KPIS, DevDashboard(), ForgeProject, formatCurrency(), relativeTime(), STATUS_COLORS, STATUS_LABELS

### Community 118 - "ClientFinance.tsx"
Cohesion: 0.32
Nodes (6): ClientFinance(), formatCurrency(), labels, PaymentWithProject, statusBadgeClass, FinancePage()

### Community 120 - "context.ts"
Cohesion: 0.36
Nodes (7): fileSystemTreeToMap(), flattenFileTree(), flattenFileTreeRecursive(), flattenTreeToMap(), generateBlueprintRecursive(), generateProjectBlueprint(), mapToFileSystemTree()

### Community 121 - "EdgeFunctionsPanel.tsx"
Cohesion: 0.33
Nodes (6): ref_services_supabaseservice, @webcontainer/api, EdgeFunction, EdgeFunctionsPanel(), EdgeFunctionsPanelProps, getLocalFunctions()

### Community 122 - "card.tsx"
Cohesion: 0.29
Nodes (6): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle

### Community 123 - "ClientProjectPage.tsx"
Cohesion: 0.29
Nodes (5): ClientProjectPage(), Milestone, MilestoneNote, ProjectDetails, STATUS_CONFIG

### Community 124 - "ClientDashboard.tsx"
Cohesion: 0.33
Nodes (6): ClientDashboard(), formatCurrency(), PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS, STATUS_COLORS, STATUS_LABELS

### Community 125 - "AIReports.tsx"
Cohesion: 0.38
Nodes (6): AIReports(), fmtDate(), labels, renderMarkdown(), statusBadgeClass, statusBadgeLabel

### Community 126 - "ProjectHubPage.tsx"
Cohesion: 0.33
Nodes (6): DB_SUB_TABS, ForgeProject, formatDate(), HUB_TABS, HubTab, ProjectHubPage()

### Community 127 - "ProposalsPage.tsx"
Cohesion: 0.33
Nodes (6): DealRevisionSummary, fmtCurrency(), ProposalDeal, ProposalsPage(), statusBadgeClass, statusLabel

### Community 128 - "UserApprovalPanel.tsx"
Cohesion: 0.40
Nodes (5): getInitials(), PendingProfile, ROLE_BADGE, UserApprovalPanel(), UserApprovalPanelProps

### Community 129 - "AIHistoryPanel.tsx"
Cohesion: 0.33
Nodes (4): AIHistoryPanelProps, AIHistoryRecord, colorMap, riskColorMap

### Community 130 - "UsersManager.tsx"
Cohesion: 0.47
Nodes (5): getInitials(), Profile, relativeTime(), ROLES, UsersManager()

### Community 131 - "LanguageContext.tsx"
Cohesion: 0.33
Nodes (3): Language, LanguageContext, LanguageContextType

### Community 132 - "rlsPolicyGuard.d.ts"
Cohesion: 0.33
Nodes (5): RlsDangerousCommand, RlsFinding, RlsFindingReason, RlsMigrationInput, RlsVerdict

### Community 133 - "embed-patterns.ts"
Cohesion: 0.60
Nodes (4): generateEmbedding(), main(), sleep(), supabase

### Community 134 - "seed-patterns.ts"
Cohesion: 0.40
Nodes (3): patterns, TODO: replace with actual submit logic, supabase

### Community 135 - "credits.js"
Cohesion: 0.70
Nodes (3): computeCreditsFromTokens(), CREDIT_PRICING, tryAtomicDeduct()

### Community 136 - "applyEdits.js"
Cohesion: 0.57
Nodes (4): applyEditsFromResponse(), applySearchReplace(), countOccurrences(), parseSearchReplaceBlocks()

### Community 137 - "ShareProjectModal.tsx"
Cohesion: 0.29
Nodes (5): PendingInvite, Props, ROLE_BADGE, SearchResult, ShareProjectModal()

### Community 138 - "LogsViewer.tsx"
Cohesion: 0.40
Nodes (3): LogLine, LogSource, SAMPLE_LOGS

### Community 140 - "ddlProposalState.d.ts"
Cohesion: 0.40
Nodes (4): DdlProposal, ProposalOutcome, ProposalSourceMessage, ProposalState

### Community 143 - "badge.tsx"
Cohesion: 0.67
Nodes (3): Badge(), BadgeProps, badgeVariants

### Community 144 - "button.tsx"
Cohesion: 0.67
Nodes (3): Button, ButtonProps, buttonVariants

### Community 145 - "tabs.tsx"
Cohesion: 0.50
Nodes (3): TabsContent, TabsList, TabsTrigger

### Community 147 - "danglingRefs.d.ts"
Cohesion: 0.50
Nodes (3): DanglingRef, FileMap, SyntheticDanglingError

### Community 148 - "ddlGuard.d.ts"
Cohesion: 0.50
Nodes (3): DestructiveFinding, DestructiveKind, SqlStatement

### Community 149 - "migrationIntent.d.ts"
Cohesion: 0.50
Nodes (3): IntentLogResult, MigrationIntentInput, MigrationIntentParams

### Community 223 - "SecretsPanel.tsx"
Cohesion: 0.33
Nodes (5): PLATFORM_LABELS, PLATFORM_MANAGED_KEYS, Secret, SecretsPanel(), SecretsPanelProps

### Community 224 - "DomainsPanel.tsx"
Cohesion: 0.50
Nodes (4): Domain, DomainsPanel(), DomainsPanelProps, getAuthHeader()

## Knowledge Gaps
- **661 isolated node(s):** `Qué es esto`, `Reglas de comunicación (permanentes)`, `Protocolo de sesión — "1 sesión = 1 cirugía completa"`, `Límites duros`, `Fixtures` (+656 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1114 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **81 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@supabase/supabase-js` connect `server.js` to `SupabaseService`, `package.json`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `re()` connect `uo` to `server.js`, `tailwindcss-browser.js`, `O`, `get`, `co`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `SupabaseService` connect `SupabaseService` to `BrowserCompiler.ts`, `MetricsPage.tsx`, `useProjectFiles.ts`, `AIOrchestrator.ts`, `MigrationRunner.ts`, `.getInstance`, `Verifier.ts`, `supabaseData.ts`, `StudioEngine.tsx`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `add()` (e.g. with `u()` and `p()`) actually correct?**
  _`add()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Qué es esto`, `Reglas de comunicación (permanentes)`, `Protocolo de sesión — "1 sesión = 1 cirugía completa"` to the rest of the system?**
  _661 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `react-dom.development.js` be split into smaller, more focused modules?**
  _Cohesion score 0.011108951936779375 - nodes in this community are weakly interconnected._
- **Should `tailwindcss.js` be split into smaller, more focused modules?**
  _Cohesion score 0.018320501853435985 - nodes in this community are weakly interconnected._