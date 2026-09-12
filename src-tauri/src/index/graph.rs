//! The link graph (WP-7.3): which notes point at which, as nodes and edges.
//!
//! Everything here is derived from the index, so nothing is read off disk to draw a graph.
//! The one rule for what a link points at is `Index::resolve` — the same one backlinks and
//! rename propagation use — called through a memo, because a Folio's links repeat their
//! targets far more often than not and resolution is the expensive part.
//!
//! Clusters are Boundings (ADR-011): a note's cluster is the first Bounding that holds it, in
//! the order they are written in `boundings.yaml`. A note can be in several and the graph
//! has to put it somewhere; the order the user wrote is the only answer that is theirs.

use std::collections::{HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{sql_err, Index};
use crate::boundings::Bounding;
use crate::folio::Result;

/// The most notes a Folio-wide graph will draw.
///
/// Past a point a graph stops being a picture and becomes a texture, and the layout cost is
/// quadratic in a way no screen repays. The busiest notes are the ones kept, because a graph
/// of the least-connected notes in a Folio would say nothing at all.
pub const MAX_NODES: usize = 1200;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub path: String,
    pub title: String,
    pub words: u32,
    /// Links from this note that land on another note in the Folio.
    pub outgoing: u32,
    /// Links from elsewhere that land here.
    pub incoming: u32,
    /// The id of the first Bounding holding it, if any.
    pub cluster: Option<String>,
    /// Steps from the focus note. 0 for the focus itself, and for every node when there is
    /// no focus.
    pub depth: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    /// How many links run this way — a note quoted four times is more tied than one quoted
    /// once, and the line is drawn heavier for it.
    pub count: u32,
}

/// A Bounding, as much of it as the graph draws.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphCluster {
    pub id: String,
    pub name: String,
    pub colour: String,
    pub notes: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub clusters: Vec<GraphCluster>,
    /// Notes in the Folio, whether or not they are drawn.
    pub total: u32,
    /// True when the Folio has more notes than the graph will draw.
    pub truncated: bool,
}

/// Every resolved link in the Folio, as `(from, to) → how many`.
///
/// Self-links are dropped: a note that mentions its own name is not tied to itself, and a
/// loop on a node is a smudge on the drawing.
fn resolved_edges(index: &Index) -> Result<HashMap<(String, String), u32>> {
    let mut stmt = index
        .conn
        .prepare("SELECT n.path, l.target, l.kind FROM links l JOIN notes n ON n.id = l.note")
        .map_err(sql_err)?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(sql_err)?
        .flatten()
        .collect();

    // A link resolves by where it was written and what it says, so two links agreeing on both
    // resolve alike. In a Folio of any size most links are to the same handful of notes.
    let mut memo: HashMap<(String, String, String), Option<String>> = HashMap::new();
    let mut edges: HashMap<(String, String), u32> = HashMap::new();
    for (from, target, kind) in rows {
        let dir = from
            .rfind('/')
            .map(|i| &from[..i])
            .unwrap_or("")
            .to_string();
        let key = (dir, target.clone(), kind.clone());
        let to = match memo.get(&key) {
            Some(hit) => hit.clone(),
            None => {
                let hit = index.resolve(&from, &target, &kind)?;
                memo.insert(key, hit.clone());
                hit
            }
        };
        let Some(to) = to else { continue };
        if to == from {
            continue;
        }
        *edges.entry((from, to)).or_insert(0) += 1;
    }
    Ok(edges)
}

/// Both directions, for walking out from a note: a graph you can only follow forwards is not
/// the neighbourhood of a note, it is its bibliography.
fn adjacency(edges: &HashMap<(String, String), u32>) -> HashMap<&str, Vec<&str>> {
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    for (from, to) in edges.keys() {
        adj.entry(from).or_default().push(to);
        adj.entry(to).or_default().push(from);
    }
    adj
}

/// Notes within `depth` steps of `focus`, with how far out each one is.
fn neighbourhood(adj: &HashMap<&str, Vec<&str>>, focus: &str, depth: u32) -> HashMap<String, u32> {
    let mut seen: HashMap<String, u32> = HashMap::from([(focus.to_string(), 0)]);
    let mut queue: VecDeque<(String, u32)> = VecDeque::from([(focus.to_string(), 0)]);
    while let Some((path, d)) = queue.pop_front() {
        if d >= depth {
            continue;
        }
        for next in adj.get(path.as_str()).into_iter().flatten() {
            if !seen.contains_key(*next) {
                seen.insert((*next).to_string(), d + 1);
                queue.push_back(((*next).to_string(), d + 1));
            }
        }
    }
    seen
}

impl Index {
    /// The link graph, whole or around one note.
    ///
    /// `focus` of `None` is the Folio, isolated notes included — a note nothing links to is
    /// exactly what someone opens a graph to find. With a focus it is that note's
    /// neighbourhood out to `depth` steps, following links in either direction.
    pub fn graph(&self, boundings: &[Bounding], focus: Option<&str>, depth: u32) -> Result<Graph> {
        let edges = resolved_edges(self)?;

        let mut stmt = self
            .conn
            .prepare("SELECT path, title, words FROM notes ORDER BY path")
            .map_err(sql_err)?;
        let all: Vec<(String, String, u32)> = stmt
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? as u32))
            })
            .map_err(sql_err)?
            .flatten()
            .collect();
        let total = all.len() as u32;

        let mut outgoing: HashMap<&str, u32> = HashMap::new();
        let mut incoming: HashMap<&str, u32> = HashMap::new();
        for ((from, to), count) in &edges {
            *outgoing.entry(from.as_str()).or_insert(0) += count;
            *incoming.entry(to.as_str()).or_insert(0) += count;
        }

        // Which notes are drawn, and how far out each one is.
        let (keep, truncated): (HashMap<String, u32>, bool) = match focus {
            Some(path) => (neighbourhood(&adjacency(&edges), path, depth), false),
            None if all.len() <= MAX_NODES => {
                (all.iter().map(|(p, _, _)| (p.clone(), 0)).collect(), false)
            }
            None => {
                // The busiest notes, and ties broken by path so the same Folio always draws
                // the same graph.
                let mut ranked: Vec<&(String, String, u32)> = all.iter().collect();
                ranked.sort_by(|a, b| {
                    let degree =
                        |p: &str| outgoing.get(p).unwrap_or(&0) + incoming.get(p).unwrap_or(&0);
                    degree(&b.0).cmp(&degree(&a.0)).then_with(|| a.0.cmp(&b.0))
                });
                (
                    ranked
                        .into_iter()
                        .take(MAX_NODES)
                        .map(|(p, _, _)| (p.clone(), 0))
                        .collect(),
                    true,
                )
            }
        };

        let cluster_of: HashMap<&str, &str> = {
            let mut map = HashMap::new();
            for b in boundings {
                for note in &b.notes {
                    map.entry(note.as_str()).or_insert(b.id.as_str());
                }
            }
            map
        };

        let mut nodes: Vec<GraphNode> = all
            .iter()
            .filter(|(path, _, _)| keep.contains_key(path))
            .map(|(path, title, words)| GraphNode {
                outgoing: *outgoing.get(path.as_str()).unwrap_or(&0),
                incoming: *incoming.get(path.as_str()).unwrap_or(&0),
                cluster: cluster_of.get(path.as_str()).map(|c| (*c).to_string()),
                depth: *keep.get(path).unwrap_or(&0),
                path: path.clone(),
                title: title.clone(),
                words: *words,
            })
            .collect();
        nodes.sort_by(|a, b| a.path.cmp(&b.path));

        let mut drawn: Vec<GraphEdge> = edges
            .into_iter()
            .filter(|((from, to), _)| keep.contains_key(from) && keep.contains_key(to))
            .map(|((from, to), count)| GraphEdge { from, to, count })
            .collect();
        drawn.sort_by(|a, b| a.from.cmp(&b.from).then_with(|| a.to.cmp(&b.to)));

        // Only the Boundings with something on screen, so the key never names a colour the
        // graph is not using.
        let on_screen: HashSet<&str> = nodes.iter().filter_map(|n| n.cluster.as_deref()).collect();
        let clusters = boundings
            .iter()
            .filter(|b| on_screen.contains(b.id.as_str()))
            .map(|b| GraphCluster {
                id: b.id.clone(),
                name: b.name.clone(),
                colour: b.colour.clone(),
                notes: nodes
                    .iter()
                    .filter(|n| n.cluster.as_deref() == Some(b.id.as_str()))
                    .count() as u32,
            })
            .collect();

        Ok(Graph {
            nodes,
            edges: drawn,
            clusters,
            total,
            truncated,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folio::Folio;
    use std::fs;

    fn folio_with(notes: &[(&str, &str)]) -> (tempfile::TempDir, Folio, Index) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("T")).unwrap();
        for (path, text) in notes {
            let abs = dir.path().join(path);
            fs::create_dir_all(abs.parent().unwrap()).unwrap();
            fs::write(abs, text).unwrap();
        }
        let index = Index::open(&dir.path().join("idx.sqlite"), &folio).unwrap();
        index.refresh(&mut |_, _| {}).unwrap();
        (dir, folio, index)
    }

    fn bounding(id: &str, notes: &[&str]) -> Bounding {
        Bounding {
            id: id.to_string(),
            name: id.to_string(),
            colour: "#006078".to_string(),
            icon: String::new(),
            notes: notes.iter().map(|n| (*n).to_string()).collect(),
        }
    }

    /// a → b, a → c, b → c twice, and d off on its own.
    fn sample() -> (tempfile::TempDir, Folio, Index) {
        folio_with(&[
            ("a.md", "# A\nSee [[b]] and [[c]].\n"),
            ("b.md", "# B\n[[c]] again, and [[c]] once more.\n"),
            ("c.md", "# C\nNothing leaves here.\n"),
            ("d.md", "# D\nAlone.\n"),
        ])
    }

    #[test]
    fn the_whole_folio_includes_the_notes_nothing_links_to() {
        let (_dir, _folio, index) = sample();
        let g = index.graph(&[], None, 1).unwrap();
        let paths: Vec<&str> = g.nodes.iter().map(|n| n.path.as_str()).collect();
        // `d.md` is the whole reason to open a graph: nothing points at it.
        assert_eq!(paths, vec!["a.md", "b.md", "c.md", "d.md"]);
        assert_eq!(g.total, 4);
        assert!(!g.truncated);
    }

    #[test]
    fn repeated_links_are_one_edge_carrying_its_weight() {
        let (_dir, _folio, index) = sample();
        let g = index.graph(&[], None, 1).unwrap();
        let edge = |from: &str, to: &str| {
            g.edges
                .iter()
                .find(|e| e.from == from && e.to == to)
                .map(|e| e.count)
        };
        assert_eq!(edge("a.md", "b.md"), Some(1));
        assert_eq!(edge("b.md", "c.md"), Some(2), "two links, one edge");
        assert_eq!(edge("c.md", "a.md"), None);
        assert_eq!(g.edges.len(), 3);
    }

    #[test]
    fn counts_are_per_link_and_split_by_direction() {
        let (_dir, _folio, index) = sample();
        let g = index.graph(&[], None, 1).unwrap();
        let node = |path: &str| g.nodes.iter().find(|n| n.path == path).unwrap();
        assert_eq!((node("a.md").outgoing, node("a.md").incoming), (2, 0));
        assert_eq!((node("c.md").outgoing, node("c.md").incoming), (0, 3));
        assert_eq!((node("d.md").outgoing, node("d.md").incoming), (0, 0));
    }

    #[test]
    fn a_focus_walks_out_in_both_directions_and_stops_where_told() {
        let (_dir, _folio, index) = sample();
        // c is only ever linked *to*, so a one-step graph around it has to follow links
        // backwards or it would be a graph of one note.
        let g = index.graph(&[], Some("c.md"), 1).unwrap();
        let mut paths: Vec<&str> = g.nodes.iter().map(|n| n.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, vec!["a.md", "b.md", "c.md"]);
        assert_eq!(g.nodes.iter().find(|n| n.path == "c.md").unwrap().depth, 0);
        assert_eq!(g.nodes.iter().find(|n| n.path == "a.md").unwrap().depth, 1);
        // d is not reachable at any depth; the walk does not wander into it.
        let far = index.graph(&[], Some("c.md"), 4).unwrap();
        assert!(!far.nodes.iter().any(|n| n.path == "d.md"));
    }

    #[test]
    fn an_edge_is_drawn_only_when_both_of_its_notes_are() {
        let (_dir, _folio, index) = sample();
        let g = index.graph(&[], Some("a.md"), 1).unwrap();
        // b and c are both one step out, so b → c comes with them …
        assert!(g.edges.iter().any(|e| e.from == "b.md" && e.to == "c.md"));
        // … and nothing points off the edge of the drawing.
        for e in &g.edges {
            assert!(g.nodes.iter().any(|n| n.path == e.from));
            assert!(g.nodes.iter().any(|n| n.path == e.to));
        }
    }

    #[test]
    fn a_note_in_two_boundings_goes_to_the_one_written_first() {
        let (_dir, _folio, index) = sample();
        let boundings = vec![
            bounding("thesis", &["a.md", "b.md"]),
            bounding("reading", &["b.md", "c.md"]),
        ];
        let g = index.graph(&boundings, None, 1).unwrap();
        let cluster = |path: &str| {
            g.nodes
                .iter()
                .find(|n| n.path == path)
                .unwrap()
                .cluster
                .clone()
        };
        assert_eq!(cluster("b.md").as_deref(), Some("thesis"));
        assert_eq!(cluster("c.md").as_deref(), Some("reading"));
        assert_eq!(cluster("d.md"), None);
        assert_eq!(g.clusters.len(), 2);
        assert_eq!(g.clusters[0].notes, 2);
    }

    #[test]
    fn the_key_names_only_the_boundings_on_screen() {
        let (_dir, _folio, index) = sample();
        let boundings = vec![
            bounding("thesis", &["a.md"]),
            bounding("elsewhere", &["d.md"]),
        ];
        let g = index.graph(&boundings, Some("a.md"), 1).unwrap();
        let ids: Vec<&str> = g.clusters.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["thesis"],
            "d is not in this graph, so its Bounding is not in the key"
        );
    }
}
