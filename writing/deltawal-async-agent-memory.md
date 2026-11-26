---
title: Your async agent memory is answering from the past
description: Async fact extraction makes agent memory answer from superseded facts, and in-place updates erase earlier values. I measured both on LongMemEval-S and fixed them with a Redis write-ahead log, DeltaWAL. The preprint and code are public.
date: 2026-11-26
tags:
  - deltawal
  - llm
  - agents
  - memory
  - research
---

*Preprint: [Read-After-Write Staleness and History Erasure in Asynchronous LLM Agent Memory](https://doi.org/10.5281/zenodo.24446418) (Zenodo, doi:10.5281/zenodo.24446418). Code and every number below: [github.com/jagritvats/deltawal](https://github.com/jagritvats/deltawal).*

## The bug

Most LLM agent memories work the same way. After each conversation session, an LLM extracts facts ("user lives in Austin"), embeds them, and stores them. At question time you retrieve the most similar facts and hand them to the reader model.

Extraction is slow, so it moves off the write path: the client gets an acknowledgement right away, the session goes onto a message broker, and a worker extracts it later. That is a sensible design, and it has a read-after-write hole. If the user says "I moved to Denver" and then asks "where should I get dinner tonight?" before the worker has committed that session, the reader sees only "Austin". It answers confidently and wrongly, and nothing looks broken: no error, no empty retrieval, just a superseded fact.

There is a second, quieter failure. Once the update does commit, a store that updates facts in place, or a read path that hides older facts once a newer one exists, loses the earlier value. "Where did I live before Denver?" now has no answer. I call these *read-after-write staleness* and *history erasure*.

## How I measured it

I used 138 held-out LongMemEval-S questions, including 60 knowledge-update (KU) and 52 temporal-reasoning questions. A deterministic lag barrier holds back the last ℓ sessions' extraction when the question arrives, so the update is still in flight. I tested three readers: gemma4 (12B, local), glm-5.3 and gpt-6-luna.

![DeltaWAL architecture. Write path: the client session goes to a Redis write-ahead log with an epoch (acknowledged at a median of 2.7 ms) and to a Redpanda topic; a worker extracts facts into append-only PostgreSQL and advances the committed watermark. Read path: a single Lua snapshot returns the watermark and uncommitted log tail, a relevance gate keeps tail turns with cosine similarity of at least 0.35 (top 8), and these are merged in epoch order with the top 12 stored versions before going to the reader. Read path median 10.6 ms, excluding the reader and query embedding.](/images/writing/deltawal-architecture.png)

## What fails

- **Plain async (B2)** answers **10.0–11.7%** of KU questions correctly with one session in flight, against **76.7–83.3%** for the synchronous store (B1). Most of those errors are stale reads: **53.3–68.3%** of KU answers give the old value. A stronger reader doesn't help, because the right fact isn't in its context.
- **A recency window (B3)**, which appends the newest uncommitted raw turns to the prompt, recovers part of the loss (**63.3–80.0%** KU) but still gives stale answers on **11.7–30.0%** of KU questions.

## What works: DeltaWAL

The fix is a write-ahead log. Before publishing a session to the broker, I append its raw turns to a Redis WAL with a monotonic per-user epoch. That's one atomic Lua script, so the client is acknowledged as soon as the turns are in the log. At read time:

1. Take the WAL tail that hasn't been committed to the fact store yet.
2. **Gate it by relevance.** Keep only tail turns whose cosine similarity to the question is at least **0.35**.
3. Merge the surviving turns with retrieved facts, in epoch order, with epoch tags.

**DeltaWAL-Versioned** also keeps every version of a fact instead of overwriting it.

At lag 1, DeltaWAL-Versioned answers **88.3–96.7%** of KU questions correctly. With glm-5.3 it scores **96.7%**, exactly its score with a complete store.

**The gate does the work.** This was the ablation I cared most about. If you fill the same tail budget with the *newest* uncommitted turns instead of the relevance-gated ones, accuracy drops from **84.5% to 39.1%** pooled over readers (**193** questions lost, **5** won; p < 0.001). The evidence usually sits earlier in the in-flight session, not in its last few turns.

The explicit "newer wins" instruction in the prompt adds nothing measurable: removing it gives **83.8%** against **84.5%** (p = 0.580). Ordering and dates carry the precedence; you don't need to tell the model.

**Latency.** All DeltaWAL variants share one write path. The write acknowledgement is **2.67 ms** at the median with in-memory Redis, against **10,168 ms** for synchronous extraction with a local 12B model. With `appendfsync always` it was **18.3 ms**, in a back-to-back run where in-memory measured **7.27 ms** on the same loaded machine. The read path, excluding the reader and query embedding, is **10.6 ms** at the median.

## History erasure, including in Mem0

At lag 0, where staleness plays no role, an in-place store answers **43.6%** of past-value KU questions with a plain prompt and **46.2%** with epoch tags. An append-only store with the same tagged prompt answers **97.4%** (**20** won, **0** lost, p = 0.016). So the gain comes from the store, not the prompt format.

Read-side masking does the same damage on an intact store. Dropping facts that a newer WAL sentence resembles takes past-value accuracy from **84.6%** with masking off down to **15.4%** at the most aggressive threshold, and buys nothing on current-value questions.

I then ran **Mem0 OSS 1.0.11**, a widely used open-source memory library, on the 60 KU questions. Its UPDATE path rewrites memories in place, and it updated the older evidence memory in place on **11** of the **13** past-value questions. Synchronous Mem0 answers **48.7%** of past-value questions, pooled. The old text still exists, but only in a history table exposed by `Memory.history()`, not by search.

A **read-only hook** that adds each retrieved memory's earlier versions to the prompt, in epoch order, raises KU accuracy from **76.7%** to **88.3–91.7%** (**25** questions won, **0** lost, p = 0.001). Past-value accuracy goes to **100.0%**, with no current-value question lost. To be honest about the mechanism: in **5** of the 13 past-value questions the old value survived only in history; in the other **8** it was still live, and the hook helped by presenting versions in order.

## Where it breaks

- **Worst case by construction.** Every question arrives while its update is in flight, so these staleness rates are conditional on that, not deployment rates. Your real exposure depends on how often questions land inside the extraction window.
- **False corrections.** Newer-wins ordering is the wrong rule when the later statement is false. On **17** clean static-conflict questions from the synthetic MemConflict set, DeltaWAL-Versioned believed the later, false statement on **86.3%** against **64.7%** for the synchronous baseline (**11** answers flipped toward it, **0** away; p = 0.015, but 0.058 under a second judge). This is exploratory, but real.
- **Small readers and raw turns.** gemma4's temporal accuracy drops from **65.4%** at lag 0 to **48.1%** at lag 1, while glm-5.3 holds **86.5%**. Prompt length isn't the cause: padding a lag-0 prompt to the lag-1 length keeps **67.3%**. The 12B model misreads "today" in raw turns. Dating the tail turns or putting them before the facts each recovers about half of the gap (**57.7%**).

## If you run async memory, do this

1. **Log before you publish.** Append raw turns with a monotonic epoch to a WAL in the same step as the acknowledgement.
2. **Read the uncommitted tail, gated by relevance,** not by recency.
3. **Merge in epoch order, with dates.** Skip the "newer wins" instruction.
4. **Never overwrite or mask facts.** Keep versions; if your store already overwrites (Mem0's UPDATE), surface `history()` at read time.
5. **Pick your durability deliberately.** `appendfsync always` costs about 11 ms per write here.
6. **Decide how to handle false corrections,** and test temporal questions with your smallest reader.

Code, harness and every number in this post are in the [repo](https://github.com/jagritvats/deltawal). Every figure traces back to `paper/numbers_manifest.json`.
