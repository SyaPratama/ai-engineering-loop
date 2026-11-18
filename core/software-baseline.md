# Software Engineering Baseline

The shared knowledge base for the loop: 16 specialist domains, each with the traps that domain produces and the evidence that actually settles them. A specialist reads only its own section (`docs software-baseline --section "<heading>"`); nobody reads this whole file.

Layers used below: **L1** static (typecheck, lint, build, review of the diff), **L2** runtime tests (unit, integration, contract), **L3** end-to-end or a recorded manual flow (`docs verification-loop`). A claim with no layer is prose, not evidence.

## Specialist domains

Spawn `specialist` with the domain id. The id is the section heading below, matched case-insensitively with `docs software-baseline --section`.

| Domain id | Section | Spawn when the diff touches |
|---|---|---|
| `architecture` | 1 Architecture and system design | module boundaries, new abstraction, public API shape |
| `distributed` | 2 Distributed systems and data consistency | two stores, retries, locks, queue ordering, replication |
| `resilience` | 3 Resilience and reliability | timeouts, retries, circuit breakers, fallbacks, deploy strategy |
| `failure-modes` | 4 Production failure modes | unbounded growth, hot keys, leaks, migration on a live table |
| `observability` | 5 Observability and operations | logs, metrics, alerts, probes, dashboards |
| `infra-devops` | 6 Infrastructure, DevOps, and cloud | Dockerfile, manifests, IaC, CI config, secrets wiring |
| `network` | 7 Network and protocols | HTTP layer, TLS, proxies, WebSocket/SSE, streaming |
| `api` | 8 API and integration | request/response shape, status codes, pagination, versioning, webhooks |
| `security` | 9 Security | authn/authz, input parsing, secrets, crypto, dependencies, PII |
| `database` | 10 Database | schema, query, index, migration, transaction, pool |
| `concurrency` | 11 Concurrency, memory, and performance | shared state, pools, allocations, latency claims |
| `language-basics` | 12 Language basics and data structures | nullability, casts, iteration, complexity |
| `testing` | 13 Testing and code quality | test changes, mocks, coverage claims, refactors |
| `frontend` | 14 Frontend and web platform | DOM/state, rendering, layout, accessibility, bundles |
| `data-ai` | 15 Data, streaming, and AI | pipelines, consumers, schemas, prompts, model output |
| `process` | 16 Process and collaboration | acceptance criteria, approvals, handoff, scope |

Rules for every domain:

- A domain name is not evidence. "We added a circuit breaker" is prose; the open-state test is evidence.
- One specialist per side of a boundary. A change that crosses two domains (an HTTP handler writing a payment row) needs both reports; the parent merges them, it does not average them.
- A specialist reports `FINDINGS` and `UNKNOWNS`. An unknown is written as an unknown, never upgraded to a finding without a repro.
- A specialist never edits. It reads the diff, the Goal Contract, and at most the files the diff names.

---

## 1. Architecture and system design

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Abstraction with one implementation | Second caller in the diff, or the abstraction is deleted | L1 |
| Layer inversion (handler talks to the DB directly) | Diff reuses the existing path; no new bypass | L1 |
| Pattern asserted by name, no artifact | File and symbol named, plus a repo-graph `EXTRACTED` edge | L1 |
| Circular module dependency | Import graph shows no new cycle | L1 |
| Endpoint added, contract untouched | OpenAPI/schema file in the same diff | L2 |
| Shared state added to a service | Owner and lifetime named; no second writer | L1 |

Vocabulary: Monolith, modular monolith, microservices, serverless, event-driven architecture, CQRS, event sourcing, saga, outbox, hexagonal (ports and adapters), clean architecture, layered architecture, domain-driven design (bounded context, aggregate), BFF, service mesh, sidecar, strangler fig, pub/sub, fan-out/fan-in, CDN, edge computing, multi-tenancy, monorepo vs polyrepo, twelve-factor app, SOLID, DRY, KISS, YAGNI, separation of concerns, dependency injection, inversion of control, coupling and cohesion, design patterns (singleton, factory, observer, strategy, adapter, decorator, repository).

## 2. Distributed systems and data consistency

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Read-after-write on a replica | Test reads through the replica path and asserts staleness handling | L2 |
| Retry repeats the effect | Idempotency key persisted with a uniqueness constraint; replay test | L2 |
| Two writes assumed atomic across services | Compensating step or saga state machine; failure path tested | L2 |
| Order assumed, not guaranteed | Partition key named, or the consumer made order-independent | L2 |
| Distributed lock without a lease | TTL and owner token in the diff; expiry test | L2 |
| Clock used for ordering | Logical clock or sequence column; skew case tested | L2 |

Vocabulary: CAP, PACELC, ACID, BASE, eventual vs strong consistency, consensus (Raft, Paxos), leader election, quorum, sharding, partitioning, replication (primary-replica, multi-primary), read replica, replication lag, split-brain, consistent hashing, CRDT, two-phase commit, distributed lock, vector clock, logical clock, gossip, clock skew, idempotency key, deduplication, at-most-once, at-least-once, exactly-once, ordering guarantee.

## 3. Resilience and reliability

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Retry without backoff or jitter | Backoff formula in the diff; behaviour under repeated failure | L2 |
| No timeout, or inner timeout longer than outer | Both values named and ordered | L2 |
| Circuit breaker that never opens | Test injects failures and asserts the open state | L2 |
| Unbounded queue | Backpressure or load-shedding branch; full-queue test | L2 |
| Fallback with a different shape | Fallback passes the same contract test | L2 |
| Health check that only proves the process is alive | Readiness probes the dependency | L2 |

Vocabulary: circuit breaker, bulkhead, retry with jitter, backpressure, load shedding, graceful degradation, fallback, failover, redundancy, high availability, fault tolerance, single point of failure, disaster recovery, RTO, RPO, chaos engineering, blue-green deployment, canary release, rolling update, feature flag, dark launch, rollback, dead letter queue, poison message.

## 4. Production failure modes

Use these as a Game Day menu at Grill and Goal freeze for T2.

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Cache stampede on a cold or hot key | Single-flight fill; concurrent test | L2 |
| Unbounded growth (threads, FDs, connections) | Release on every path; leak test or counter assertion | L2 |
| Retry storm amplifying an outage | Backoff with jitter and a breaker, both present | L2 |
| Disk full, inode exhaustion, log flooding | Log level and rotation unchanged or capped | L1 |
| Certificate or secret expiry | Renewal path or alert cited | L3 |
| Silent failure (swallowed exception) | No empty catch in the diff; failure logs or rethrows | L1 |
| ReDoS | Regex is linear (no nested quantifier); input length bounded | L2 |
| Off-by-one, integer overflow, float money | Boundary test per AC row; integer or decimal units | L2 |
| DST / timezone bug | Fixed-zone test at a DST boundary | L2 |
| Race, deadlock, lost update, write skew | Isolation level named; concurrent test or serialization | L2 |
| "Works on my machine" | Command reproduced in a clean checkout or CI | L2 |

Vocabulary: thundering herd, cache stampede, cache penetration, cache avalanche, hot key, hot partition, retry storm, cascading failure, noisy neighbor, connection storm, lock convoy, priority inversion, livelock, starvation, lost update, write skew, stale read, goroutine/thread leak, file descriptor leak, CLOSE_WAIT/TIME_WAIT buildup, disk full, inode exhaustion, certificate expiry, config drift, silent failure, swallowed exception, ReDoS, slowloris, log flooding, over-fetching and under-fetching, timezone/DST bug, floating-point error, integer overflow, off-by-one, null pointer dereference, stack overflow, buffer overflow, use-after-free, dependency hell, heisenbug, flaky test.

## 5. Observability and operations

| Trap | Evidence that settles it | Layer |
|---|---|---|
| New failure path emits no signal | Log or metric at the failure branch, in the diff | L1 |
| Unbounded label (user id, raw URL) | Label set enumerated and bounded | L1 |
| Alert with no runbook | Runbook section cited | L1 |
| "Monitoring covers it" | Metric name plus the alert or dashboard path | L1 |
| Probe that hides a broken dependency | Probe checks the dependency; down-state test | L2 |

Vocabulary: SLI, SLO, SLA, error budget, MTTR, MTTD, MTBF, distributed tracing (span, trace id, correlation id, OpenTelemetry), metrics, structured logging, alerting, alert fatigue, golden signals, RED method, USE method, APM, profiling, flame graph, synthetic monitoring, readiness and liveness probe, on-call, incident response, runbook, post-mortem, root cause analysis, toil, cardinality.

## 6. Infrastructure, DevOps, and cloud

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Root user or `latest` tag | Diff shows the user and a pinned tag | L1 |
| Secret in an image, ConfigMap, or command line | Secret reference only; no literal in the diff | L1 |
| IaC change without a plan | `plan`/`diff` output attached | L3 |
| Limit, probe, or resource removed | Manifest diff keeps both | L1 |
| Migration ordered after the deploy that needs it | Order stated; expand-contract path | L2 |
| Environment-specific value hardcoded | Config key named; both environments read it | L1 |

Vocabulary: infrastructure as code (Terraform, Ansible), GitOps, container registry, image layer, multi-stage build, Docker Compose, volume, VM, hypervisor, cgroups, Linux namespaces, Helm, Pod, Node, Deployment, Service, Ingress, ConfigMap, Secret, StatefulSet, DaemonSet, HPA, etcd, autoscaling (horizontal, vertical), immutable infrastructure, pets vs cattle, environments, artifact, build cache, bastion host, VPC, subnet, NAT, firewall, security group, FinOps, vendor lock-in.

## 7. Network and protocols

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Pool or keep-alive exhaustion under load | Pool size and timeouts named; load or unit assertion | L2 |
| WebSocket path outside the smoke check | Health check covers the upgrade | L3 |
| Unbounded header or body size | Limit in config; oversize request test | L2 |
| TLS verification disabled to make it work | `rejectUnauthorized` / `InsecureSkipVerify` absent from the diff | L1 |
| Streaming buffered end to end | Chunked path in the diff; first-byte test | L2 |

Vocabulary: DNS (A, CNAME, TTL), anycast, L4 vs L7 load balancing, sticky session, TLS termination, TLS handshake, mTLS, certificate authority, HSTS, HTTP/1.1, HTTP/2, HTTP/3, QUIC, keep-alive, multiplexing, head-of-line blocking, TCP three-way handshake, congestion control, SYN flood, MTU, latency, throughput, bandwidth, RTT, packet loss, jitter, MQTT, AMQP, WebRTC, SSE, long polling.

## 8. API and integration

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Breaking change with no version or deprecation path | Old shape still accepted, or a version in the diff | L2 |
| Offset pagination on a large table | Keyset pagination; stability test with concurrent inserts | L2 |
| 429 without `Retry-After` | Header asserted | L2 |
| Error body that differs from the rest of the API | Shared error schema; assertion | L2 |
| Webhook without a signature or replay guard | HMAC plus timestamp check; rejected-request test | L2 |
| CORS widened to `*` on a credentialed route | Origin allowlist; preflight test | L2 |

Vocabulary: REST, GraphQL, SOAP, tRPC, webhook, OpenAPI/Swagger, API contract, HATEOAS, HTTP methods and status codes, content negotiation, pagination (offset vs cursor), versioning, deprecation, breaking change, backward compatibility, semantic versioning, ETag, conditional request, Cache-Control, stale-while-revalidate, CORS preflight, 429 and Retry-After, request id, serialization (protobuf, Avro, MessagePack, XML), compression (gzip, brotli), chunked transfer, streaming.

## 9. Security

This domain overrides delivery pressure: a VALID security finding is never waived by the Maker.

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Authorization enforced only in the UI | Server-side check on the changed path; denied test per role | L2 |
| Object id from the request trusted (IDOR) | Ownership predicate in the query; cross-tenant test | L2 |
| String-built SQL or shell command | Parameterized query or argv array in the diff | L1 |
| Secret in code, log, or error text | `learn --check` clean; no literal in the diff | L1 |
| Token readable by page scripts | HttpOnly, Secure, SameSite asserted | L2 |
| Permissive deserialization | Allowlist schema; malformed payload test | L2 |
| New dependency with a known advisory | Version cited, advisory checked | L1 |
| Privileged action with no audit line | Audit record with actor and target; assertion | L2 |

Vocabulary: OWASP Top 10, XSS, CSRF, SSRF, IDOR, broken access control, command injection, NoSQL injection, path traversal, RCE, insecure deserialization, XXE, clickjacking, open redirect, mass assignment, authentication vs authorization, RBAC, ABAC, OAuth2, OIDC, SAML, SSO, MFA, access token vs refresh token, token revocation, cookie flags (HttpOnly, Secure, SameSite), CSP, password hashing (bcrypt, argon2, salt, pepper), encryption at rest and in transit, HMAC, digital signature, key rotation, secrets management, least privilege, zero trust, defense in depth, WAF, penetration testing, SAST, DAST, SCA, supply chain attack, dependency confusion, CVE, SBOM, zero-day, brute force, credential stuffing, replay attack, MITM, audit log, data masking, PII, UU PDP.

## 10. Database

| Trap | Evidence that settles it | Layer |
|---|---|---|
| N+1 query in a loop | Batched fetch; assertion on query count | L2 |
| New filter column with no index | `EXPLAIN` uses the index at a realistic row count | L2 |
| Migration locks a large table | Online or expand-contract path; lock level named | L2 |
| Transaction spanning a network call | Transaction boundary in the diff; no I/O inside | L1 |
| Read-modify-write with no version or lock | Optimistic version column or `FOR UPDATE`; concurrent test | L2 |
| Pool exhausted at peak | Pool size compared with expected concurrency | L2 |
| Soft delete colliding with a unique constraint | Partial unique index in the migration | L2 |
| Connection leaked on the error path | Release in `finally`; error-path test | L2 |

Vocabulary: normalization, denormalization, ERD, primary key, foreign key, constraint, isolation level (read committed, repeatable read, serializable), dirty read, non-repeatable read, phantom read, MVCC, optimistic vs pessimistic locking, lock contention, WAL, vacuum, table bloat, query planner, EXPLAIN, full table scan, covering index, composite index, partial index, B-tree, hash index, cardinality, selectivity, slow query log, keyset pagination, batch insert, upsert, migration, zero-downtime migration (expand-contract), soft delete, ORM, impedance mismatch, lazy vs eager loading, PgBouncer, prepared statement, stored procedure, trigger, view, materialized view, CTE, window function, OLTP vs OLAP, data warehouse, ETL/ELT, data lake, CDC, LSM tree, SSTable, bloom filter, compaction, tombstone, backup (full, incremental, PITR), restore test, NoSQL (document, key-value, wide-column, graph, time-series, vector database).

## 11. Concurrency, memory, and performance

No performance claim without a measurement in the same Run.

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Shared mutable state across threads | Lock or message passing in the diff; concurrent test | L2 |
| Concurrent map write / data race | Race detector or stress test output | L2 |
| Unbounded spawn or worker queue | Cap in the diff; rejection test | L2 |
| Allocation or copy in a hot loop | Benchmark before and after, same command | L2 |
| Lock held across I/O | Lock scope shrinks in the diff | L1 |
| Pool size hardcoded | Value from config | L1 |
| "Faster" with no numbers | Benchmark output attached, or the claim is dropped | L2 |
| No graceful shutdown | SIGTERM handler drains; in-flight test | L2 |

Vocabulary: thread, process, coroutine, goroutine, async/await, event loop, blocking vs non-blocking I/O, epoll, mutex, semaphore, spinlock, atomic operation, CAS, lock-free, false sharing, thread pool, worker pool, context switch, CPU-bound vs I/O-bound, concurrency vs parallelism, garbage collection, GC pause (stop-the-world), heap vs stack, memory fragmentation, memory pressure, swap, page fault, cache locality, tail latency (p95, p99), saturation, contention, Amdahl's law, Little's law, queueing theory, benchmarking, cold start, warm-up, JIT, AOT, file descriptor limit, zombie process, graceful shutdown, SIGTERM.

## 12. Language basics and data structures

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Unchecked type assertion or cast | Narrowed value or validation branch in the diff | L1 |
| Dereference of an optional field | Test with the field absent | L2 |
| Algorithmic regression (nested loop over a large list) | Complexity stated; large-input test or map lookup | L2 |
| Mutated constant or shared default | Frozen or copied value; test asserts the default unchanged | L2 |
| Recursion with no depth bound | Depth limit or iterative version | L2 |
| Slice bound off by one | Empty, single, and last-element tests | L2 |

Vocabulary: constant, data type, static vs dynamic typing, strong vs weak typing, generics, polymorphism, inheritance, encapsulation, abstraction, interface, composition over inheritance, closure, callback, promise, higher-order function, pure function, side effect, immutability, recursion, iterator, generator, exception handling, scope, reference vs value, pointer, null safety, reflection, metaprogramming, DSL, Big-O, array, linked list, hash map, tree, heap, graph, trie, stack, sorting, searching, dynamic programming, BFS, DFS, compiler vs interpreter, bytecode, runtime, package manager, lockfile.

## 13. Testing and code quality

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Test asserts a mock was called, not behaviour | Assertion on the observable result; mock-only test deleted | L2 |
| Test weakened to pass (skip, loosened assertion, re-pinned snapshot) | Integrity scan clean; the baseline still passes | L2 |
| Coverage reported as correctness | Mutation run or a red-then-green pair | L2 |
| Flaky test retried until green | Cause fixed, or the test is quarantined with a reason | L2 |
| Contract drift between two services | Contract test on both sides | L2 |
| Dead code or unused export left behind | No reader in the repo graph | L1 |
| A new test that cannot fail | Delete it; assertions must be falsifiable | L2 |

Vocabulary: unit test, integration test, end-to-end test, regression test, smoke test, load test, stress test, soak test, spike test, fuzzing, mutation testing, property-based testing, TDD, BDD, test coverage, test double (mock, stub, fake, spy), test pyramid, snapshot test, contract test, A/B testing, static analysis, linting, code review, pair programming, refactoring, code smell, technical debt, cyclomatic complexity, dead code, god object, premature optimization, bus factor.

## 14. Frontend and web platform

| Trap | Evidence that settles it | Layer |
|---|---|---|
| No loading state on a slow path | Branch in the diff; DOM or visual assertion | L3 |
| Layout shift or a broken breakpoint | Screenshots at two widths, or a CLS number | L3 |
| Interactive element with no accessible name | Name assertion; measured contrast | L2 |
| Client bundle pulled into the first render | Import boundary in the diff; bundle report | L1 |
| State duplicated across two stores | One owner; test asserts a single source of truth | L2 |
| New user-facing text with no translation key | Key present in every locale | L1 |
| Hydration mismatch | Server and client markup compared | L2 |

Vocabulary: DOM, virtual DOM, SSR, CSR, SSG, ISR, hydration, SPA, MPA, PWA, service worker, web worker, lazy loading, code splitting, tree shaking, bundling, minification, critical rendering path, Core Web Vitals (LCP, INP, CLS), reflow and repaint, debounce, memoization, state management, accessibility (WCAG, ARIA), responsive design, CSS specificity, flexbox, grid, localStorage, IndexedDB, polyfill, transpiler, source map, HMR, SEO, i18n, l10n, Unicode, text shaping.

## 15. Data, streaming, and AI

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Consumer assumes exactly-once | Idempotent handler; redelivery test | L2 |
| Schema change breaks an old consumer | Compatibility check output | L2 |
| Hot partition from a poor key choice | Key named; distribution test or count | L2 |
| Rebalance drops in-flight work | Drain or commit on revoke; test | L2 |
| Prompt assembled from untrusted input | Input delimited and labelled untrusted; injection test | L2 |
| Model output trusted as a decision | Output validated against a schema; reject path tested | L2 |
| Retrieval returns stale or foreign documents | Freshness and tenant filter asserted | L2 |

Vocabulary: batch vs stream processing, Kafka (topic, partition, consumer group, offset, consumer lag, rebalancing), schema registry, data lineage, data quality, data skew, feature store, MLOps, model drift, inference, embedding, vector search, RAG, fine-tuning, quantization, token, context window, hallucination, prompt injection.

## 16. Process and collaboration

| Trap | Evidence that settles it | Layer |
|---|---|---|
| Acceptance criteria written as the happy path only | Failure table: happy, empty, boundary, error, sibling | gate |
| "Approved in chat" taken as approval | `goal freeze --by human`, or `deliver --approve` | gate |
| Definition of done expressed as prose | Gates pass and their artifacts exist | gate |
| A decision remade without its earlier rationale | ADR or handoff entry cited | L1 |
| Handoff with no state | `handoff` artifact with the redacted pack | L1 |
| Scope grew mid-Run | Impact map confirmed; drift reported with a reason | gate |

Vocabulary: SDLC, Agile, Scrum, Kanban, sprint, backlog, user story, acceptance criteria, definition of done, MVP, PoC, roadmap, DevOps, DevSecOps, SRE, platform engineering, trunk-based development, Git flow, rebase, cherry-pick, merge conflict, pull request, hotfix, code freeze, ADR, RFC, design doc, story point, velocity, retrospective, build vs buy, TCO.

---

## Initial term list → domain

Terms from the starting list, mapped so a mention routes to one specialist.

| Term | Domain id |
|---|---|
| rate limiting, throttling, load balancing, reverse proxy, API gateway, CDN | `resilience`, `network` |
| caching, idempotency, distributed transaction | `distributed` |
| CI/CD, Docker, Kubernetes, health check, log aggregation | `infra-devops` |
| N+1 query, missing index, index fragmentation, connection pool exhaustion, deadlock storm, seeder, query builder | `database` |
| CORS policy, SSL/TLS, WebSocket, gRPC, timeout | `network`, `api` |
| JWT, SQL injection, hardcoded credentials | `security` |
| deadlock, race condition, concurrent map writes, memory leak, OOM, disk I/O bottleneck, TCP port exhaustion | `concurrency`, `failure-modes` |
| exponential backoff, DDoS mitigation | `resilience` |
| message queue, queue, payload, JSON | `api`, `data-ai` |
| unchecked type assertion, variable | `language-basics` |
