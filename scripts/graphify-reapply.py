#!/usr/bin/env python3
"""Re-apply our graph corrections after a `/graphify . --update` or full rebuild.

1. Drops the false INFERRED `calls` edges the extractor matches by name only:
   the private `t()` in server/lib/rules-draft.ts and `refresh()` in
   app/composables/usePush.ts (every Vue component's own `t`/`refresh` got
   attached to them).
2. Re-clusters.
3. Names communities from scripts/graphify-labels.json, matching each new
   community to the saved label with the most source files in common, and
   falls back to "<top file stem> (cN)".
4. Rewrites graph.json and GRAPH_REPORT.md.

Run from the repo root, then `graphify export html`:
    $(cat graphify-out/.graphify_python) scripts/graphify-reapply.py
Add --save-labels to snapshot the current community names as the new anchors.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.detect import detect
from graphify.export import to_json
from graphify.paths import out_path
from graphify.report import generate
from graphify.watch import _read_build_excludes, _read_build_gitignore

OUT = Path("graphify-out")
LABELS = Path("scripts/graphify-labels.json")
BAD_TARGETS = {
    "server_lib_rules_draft_t",
    "app_composables_usepush_usepush_refresh",
}
MIN_OVERLAP = 0.15


def edges_key(g):
    return "links" if "links" in g else "edges"


def files_of(G, ids):
    return Counter(
        G.nodes[i].get("source_file") for i in ids if G.nodes[i].get("source_file")
    )


def save_labels():
    g = json.loads((OUT / "graph.json").read_text())
    groups = {}
    for n in g["nodes"]:
        name = n.get("community_name")
        if name and n.get("source_file"):
            groups.setdefault(name, Counter())[n["source_file"]] += 1
    data = {
        name: [f for f, _ in c.most_common(12)]
        for name, c in groups.items()
        if not name.endswith(")")  # skip auto-named fallbacks
    }
    LABELS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"saved {len(data)} labels to {LABELS}")


def main():
    if "--save-labels" in sys.argv:
        return save_labels()

    root = (OUT / ".graphify_root").read_text().strip()
    g = json.loads((OUT / "graph.json").read_text())
    key = edges_key(g)
    before = len(g[key])
    g[key] = [
        e
        for e in g[key]
        if not (
            e.get("relation") == "calls"
            and e.get("confidence") == "INFERRED"
            and e["target"] in BAD_TARGETS
        )
    ]
    print(f"removed {before - len(g[key])} false edges")

    ex = {
        "nodes": g["nodes"],
        "edges": g[key],
        "hyperedges": g.get("hyperedges", []),
    }
    G = build_from_json(ex, root=root, directed=False)
    com = cluster(G)
    coh = score_all(G, com)

    anchors = json.loads(LABELS.read_text()) if LABELS.exists() else {}
    anchor_sets = {name: set(files) for name, files in anchors.items()}
    labels, used = {}, set()
    for c, ids in sorted(com.items(), key=lambda x: -len(x[1])):
        files = files_of(G, ids)
        best, score = None, 0.0
        for name, aset in anchor_sets.items():
            if name in used:
                continue
            top = set(f for f, _ in files.most_common(12))
            union = top | aset
            s = len(top & aset) / len(union) if union else 0.0
            if s > score:
                best, score = name, s
        if best and score >= MIN_OVERLAP:
            labels[c] = best
            used.add(best)
        else:
            stem = files.most_common(1)[0][0].split("/")[-1].rsplit(".", 1)[0] if files else "Misc"
            labels[c] = f"{stem} (c{c})"

    detection = detect(
        Path(root),
        extra_excludes=_read_build_excludes(out_path()),
        gitignore=_read_build_gitignore(out_path()),
    )
    gods = god_nodes(G)
    sur = surprising_connections(G, com)
    q = suggest_questions(G, com, labels)
    to_json(G, com, str(OUT / "graph.json"), community_labels=labels, force=True)
    (OUT / "GRAPH_REPORT.md").write_text(
        generate(G, com, coh, labels, gods, sur, detection,
                 {"input": 0, "output": 0}, root, suggested_questions=q)
    )
    named = sum(1 for v in labels.values() if not v.endswith(")"))
    print(f"{len(com)} communities, {named} named from anchors")


if __name__ == "__main__":
    main()
