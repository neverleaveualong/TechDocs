# ClaimLens Accuracy Improvement Plan

## Background

Recent ClaimLens tests confirmed that the end-to-end workflow works:

- input analysis
- candidate search
- low-relevance supervisor decision
- KIPRIS auto ingest
- retry search
- claim loading
- feature matching
- report generation

However, the result quality is still below the level expected for a portfolio-ready AI patent analysis service. The system can find and analyze candidates, but the selected candidate, claim chart rows, feature extraction, and confidence presentation need improvement.

## Current Issues

### 1. Product feature extraction is too shallow

Current behavior:

- A short product description is preserved as a single feature.
- Example: `특허 데이터를 AI를 활용하여 검색해주고 분석해주는 서비스`
- This becomes one generic `Feature 1`, so claim element matching has too little structured evidence.

Expected behavior:

- The agent should decompose the input into concrete functional capabilities.
- Example feature breakdown:
  - collect or store patent data
  - vectorize or semantically index patent documents
  - accept a user query or technical description
  - search related patent candidates using AI
  - analyze claims, abstracts, and bibliographic information
  - provide analysis results with evidence and sources

Implementation tasks:

- Improve `extract_product_features`.
- Add fallback decomposition for short or abstract input.
- Remove generic `Feature 1` labels from user-facing output.
- Render decomposed product features clearly in the ClaimLens UI.

### 2. Candidate reranking is weak after auto ingest

Current behavior:

- Auto ingest can find a better patent candidate.
- After retry search, a generic internal document search patent can still remain above more domain-relevant patent-analysis candidates.

Expected behavior:

- Reranking should combine vector similarity with domain relevance and claim availability.

Suggested scoring factors:

- vector score
- domain keyword score
- claim availability score
- penalty for generic non-patent search domains

Domain weighting examples:

- Strong: `특허`, `청구항`, `지식재산`, `선행기술`, `문헌`, `특허분석`
- Medium: `검색`, `분석`, `AI`, `자연어처리`, `데이터`
- Weak: `문서`, `정보`, `시스템`

Implementation tasks:

- Add a ClaimLens-specific rerank score.
- Penalize generic document, product, bidding, or recommendation search patents when the query is patent-analysis oriented.
- Re-rank old and newly ingested candidates with the same scoring function.
- Show the candidate selection reason in the UI.

### 3. Abstract rows should not appear in the claim chart

Current behavior:

- `patent_abstract` candidates can become claim chart rows.
- This creates an `uncertain` row with a message that no claim element is attached.

Expected behavior:

- Claim charts should compare product features only against claim elements.
- Abstracts should be shown as candidate context, not as claim element rows.

Implementation tasks:

- Exclude `matchedTextType === "patent_abstract"` from claim chart row generation.
- Use only `claim_element` or claim-derived rows for the chart.
- If a candidate has no claim elements, mark it as insufficient for claim comparison.
- Move abstract text into the candidate summary panel.

### 4. Stored-candidate threshold UI is confusing

Current behavior:

- UI can show `저장 기준 0.600` while a stored candidate displays score `0.594`.
- This looks inconsistent even when the backend selected it through fallback logic.

Expected behavior:

- The UI should separate threshold pass from fallback pass.

Example display:

- final score: `0.594`
- selection reason: `coverage_fallback`
- threshold passed: `false`
- fallback passed: `true`
- reason: core keywords overlap enough even though rerank score is below threshold

Implementation tasks:

- Add explicit fields to the auto-ingest response:
  - `selectionReason`
  - `thresholdPassed`
  - `fallbackPassed`
  - `score`
  - `threshold`
- Replace the standalone `저장 기준 0.600` label with a clearer threshold/fallback explanation.
- Normalize score rounding across API and UI.

### 5. Quality warnings should be more visible

Current behavior:

- The workflow shows completed steps even when confidence is weak.
- Users can mistake a completed workflow for a high-confidence result.

Expected behavior:

- The supervisor should produce a user-facing quality grade.
- The UI should explain result limitations and recommend better input when needed.

Suggested grades:

- `good`: candidate and claim matching quality are acceptable
- `weak`: result is usable but needs review
- `insufficient`: input or candidates are not enough for reliable analysis

Implementation tasks:

- Extend `supervisor_decision` with:
  - `qualityGrade`
  - `confidenceSummary`
  - `recommendedInputFields`
- Show a quality banner near the top of the ClaimLens result.
- Trigger warnings when:
  - top score is below threshold
  - too many rows are `not_found` or `uncertain`
  - product feature count is too low
  - candidate has weak domain relevance
- Add an "analysis limitations" section to the final report.

## Recommended Implementation Order

1. Improve product feature decomposition.
2. Exclude abstract rows from the claim chart.
3. Add ClaimLens-specific candidate reranking.
4. Fix auto-ingest threshold and fallback display.
5. Add quality warnings and additional-input guidance.

This order fixes the most misleading result problems first, then improves search quality, and finally improves user trust and portfolio presentation.

## Portfolio Positioning

The target portfolio narrative should be:

`Input Analysis Agent -> Patent Search Agent -> Auto Ingest Agent -> Supervisor Agent -> Claim Comparison Agent -> Report Agent`

The next implementation should make that architecture visible through both behavior and UI:

- the system decomposes vague input into structured product capabilities
- the system detects weak search quality
- the system searches and ingests better candidates
- the system refuses to overstate low-confidence analysis
- the system explains its evidence, limits, and next recommended input
