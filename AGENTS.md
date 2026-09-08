# Hotel Revealer working agreement

- Implement the smallest correct change; preserve unrelated work.
- Commit coherent, verified milestones regularly. Inspect status and the staged
  diff, check for secrets and whitespace, then commit. Do not push without a request.
- At substantial milestones, ask a separate skeptical agent to critique the code,
  assumptions, scope and complexity. The reviewer should report concrete defects
  and useful simplifications, not add speculative infrastructure or features.
- Address consequential findings before the milestone commit; record remaining
  verification gaps honestly. Do not infer seniority from code or test volume.
- Use Node from `.nvmrc` and the root npm workspace lock. Run `npm run check` and
  relevant production-build browser tests for affected behavior.
- The server defaults to the public Priceline adapter. Read `docs/LIVE_ACCESS.md`
  for verified behavior and remaining limits; CI must set `HOTEL_PROVIDER=disabled`.
  No test/demo endpoint may substitute for live functionality or make the release
  appear complete.
- Keep one application process and bounded work. New infrastructure or abstraction
  needs a concrete problem demonstrated by the existing implementation.
- Hosted, physical-device, assistive-technology and human usability evidence are
  separate from local tests. Track the release gates in `docs/ACCEPTANCE.md`.
