import {
  getLandingSections,
  type LandingKey,
  type LandingSection,
} from "@/lib/landing-analytics/sections";
import { computeHeatScore, computeReachOnlyHeatScore } from "@/lib/landing-analytics/heatScore";
import { maxDepthToYRatio } from "@/lib/landing-analytics/metrics";
import type { LandingEventAggregateRow } from "@/lib/landing-analytics/eventRow";

export type SessionSummary = {
  session_id: string;
  max_depth: number;
  duration_seconds: number;
  device_type: string;
  reached_depths: Set<number>;
};

export type LandingAnalyticsReport = {
  total_sessions: number;
  avg_duration_seconds: number;
  avg_max_depth: number;
  depth_reach_rates: { depth: number; rate: number; count: number }[];
  section_dropout: {
    name: string;
    label: string;
    reached: number;
    dropped: number;
    dropout_rate: number;
    next_section_reached: number;
    next_section_reach_rate: number;
    submission_count: number;
  }[];
  device_depth_reach: {
    device: string;
    sessions: number;
    avg_max_depth: number;
    reach_25: number;
    reach_50: number;
    reach_75: number;
    reach_100: number;
  }[];
  section_clicks: { name: string; label: string; count: number }[];
  section_dwell: {
    name: string;
    label: string;
    total_seconds: number;
    sessions_with_dwell: number;
    avg_seconds: number;
  }[];
  section_heatmap: {
    name: string;
    label: string;
    reach_rate: number;
    avg_dwell_seconds: number;
    dropout_rate: number;
    click_count: number;
    heat_score: number;
  }[];
  scroll_heatmap: {
    bucket: string;
    bucket_start: number;
    count: number;
    rate: number;
    heat_score: number;
  }[];
  click_y_buckets: { bucket: string; count: number }[];
};

function buildSessionMap(events: LandingEventAggregateRow[]): Map<string, SessionSummary> {
  const map = new Map<string, SessionSummary>();

  for (const ev of events) {
    let s = map.get(ev.session_id);
    if (!s) {
      s = {
        session_id: ev.session_id,
        max_depth: 0,
        duration_seconds: 0,
        device_type: ev.device_type ?? "unknown",
        reached_depths: new Set(),
      };
      map.set(ev.session_id, s);
    }

    if (ev.device_type) s.device_type = ev.device_type;

    if (ev.event_type === "scroll_depth" && ev.depth != null) {
      s.reached_depths.add(ev.depth);
      s.max_depth = Math.max(s.max_depth, ev.depth);
    }

    if (ev.max_depth != null) {
      s.max_depth = Math.max(s.max_depth, ev.max_depth);
    }

    if (ev.event_type === "heartbeat" || ev.event_type === "leave") {
      if (ev.duration_seconds != null) {
        s.duration_seconds = Math.max(s.duration_seconds, ev.duration_seconds);
      }
      if (ev.max_depth != null) {
        s.max_depth = Math.max(s.max_depth, ev.max_depth);
      }
    }
  }

  return map;
}

export function aggregateLandingAnalytics(
  landingKey: LandingKey,
  events: LandingEventAggregateRow[]
): LandingAnalyticsReport {
  const sessions = buildSessionMap(events);
  const sessionList = Array.from(sessions.values());
  const total = sessionList.length;

  const milestones = [25, 50, 75, 100];
  const depth_reach_rates = milestones.map((depth) => {
    const count = sessionList.filter(
      (s) => s.reached_depths.has(depth) || s.max_depth >= depth
    ).length;
    return {
      depth,
      count,
      rate: total > 0 ? (count / total) * 100 : 0,
    };
  });

  const avg_duration_seconds =
    total > 0
      ? sessionList.reduce((sum, s) => sum + s.duration_seconds, 0) / total
      : 0;

  const avg_max_depth =
    total > 0 ? sessionList.reduce((sum, s) => sum + s.max_depth, 0) / total : 0;

  const sections = getLandingSections(landingKey);
  const section_dropout = computeSectionDropout(sessionList, sections);

  const deviceMap = new Map<string, SessionSummary[]>();
  for (const s of sessionList) {
    const d = s.device_type || "unknown";
    if (!deviceMap.has(d)) deviceMap.set(d, []);
    deviceMap.get(d)!.push(s);
  }

  const device_depth_reach = Array.from(deviceMap.entries()).map(([device, list]) => {
    const n = list.length;
    const reach = (d: number) =>
      n > 0
        ? (list.filter((s: SessionSummary) => s.max_depth >= d || s.reached_depths.has(d)).length / n) *
          100
        : 0;
    return {
      device,
      sessions: n,
      avg_max_depth:
        n > 0 ? list.reduce((a: number, s: SessionSummary) => a + s.max_depth, 0) / n : 0,
      reach_25: reach(25),
      reach_50: reach(50),
      reach_75: reach(75),
      reach_100: reach(100),
    };
  });

  const clickCounts = new Map<string, { label: string; count: number }>();
  for (const ev of events) {
    if (ev.event_type !== "click" || !ev.section_name) continue;
    const cur = clickCounts.get(ev.section_name) ?? {
      label: ev.section_label ?? ev.section_name,
      count: 0,
    };
    cur.count += 1;
    clickCounts.set(ev.section_name, cur);
  }

  const section_clicks = sections.map((sec) => ({
    name: sec.name,
    label: sec.label,
    count: clickCounts.get(sec.name)?.count ?? 0,
  }));

  const section_dwell = computeSectionDwell(events, sections);

  const maxSectionAvgDwell = Math.max(0, ...section_dwell.map((d) => d.avg_seconds));
  const dropoutByName = new Map(section_dropout.map((d) => [d.name, d]));
  const dwellByName = new Map(section_dwell.map((d) => [d.name, d]));
  const clicksByName = new Map(section_clicks.map((c) => [c.name, c]));

  const section_heatmap = sections.map((sec) => {
    const dropout = dropoutByName.get(sec.name);
    const dwell = dwellByName.get(sec.name);
    const clicks = clicksByName.get(sec.name);
    const reach_rate = total > 0 ? ((dropout?.reached ?? 0) / total) * 100 : 0;
    const avg_dwell_seconds = dwell?.avg_seconds ?? 0;
    const heat_score = computeHeatScore(reach_rate, avg_dwell_seconds, maxSectionAvgDwell);

    return {
      name: sec.name,
      label: sec.label,
      reach_rate,
      avg_dwell_seconds,
      dropout_rate: dropout?.dropout_rate ?? 0,
      click_count: clicks?.count ?? 0,
      heat_score,
    };
  });

  const heatBuckets = new Map<number, number>();
  for (const s of sessionList) {
    const bucket = Math.min(9, Math.floor(maxDepthToYRatio(s.max_depth) * 10));
    heatBuckets.set(bucket, (heatBuckets.get(bucket) ?? 0) + 1);
  }

  const scroll_heatmap = Array.from({ length: 10 }, (_, i) => {
    const count = heatBuckets.get(i) ?? 0;
    const startPct = i * 10;
    const endPct = i === 9 ? 100 : (i + 1) * 10;
    const rate = total > 0 ? (count / total) * 100 : 0;
    return {
      bucket: `${startPct}–${endPct}%`,
      bucket_start: startPct,
      count,
      rate,
      heat_score: computeReachOnlyHeatScore(rate),
    };
  });

  const yClickBuckets = new Map<number, number>();
  for (const ev of events) {
    if (ev.event_type !== "click" || ev.y_ratio == null) continue;
    const bucket = Math.min(9, Math.floor(ev.y_ratio * 10));
    yClickBuckets.set(bucket, (yClickBuckets.get(bucket) ?? 0) + 1);
  }

  const click_y_buckets = Array.from({ length: 10 }, (_, i) => {
    const startPct = i * 10;
    const endPct = i === 9 ? 100 : (i + 1) * 10;
    return {
      bucket: `y ${startPct}–${endPct}%`,
      count: yClickBuckets.get(i) ?? 0,
    };
  });

  return {
    total_sessions: total,
    avg_duration_seconds,
    avg_max_depth,
    depth_reach_rates,
    section_dropout,
    device_depth_reach,
    section_clicks,
    section_dwell,
    section_heatmap,
    scroll_heatmap,
    click_y_buckets,
  };
}

function computeSectionDwell(
  events: LandingEventAggregateRow[],
  sections: LandingSection[]
) {
  const perSession = new Map<string, Map<string, number>>();

  for (const ev of events) {
    if (ev.event_type !== "section_dwell" || !ev.section_name) continue;
    const sec = Math.round(ev.duration_seconds ?? 0);
    if (sec < 1) continue;

    let map = perSession.get(ev.session_id);
    if (!map) {
      map = new Map();
      perSession.set(ev.session_id, map);
    }
    map.set(ev.section_name, (map.get(ev.section_name) ?? 0) + sec);
  }

  return sections.map((sec) => {
    let total_seconds = 0;
    let sessions_with_dwell = 0;

    for (const map of Array.from(perSession.values())) {
      const secSeconds = map.get(sec.name) ?? 0;
      if (secSeconds > 0) {
        total_seconds += secSeconds;
        sessions_with_dwell += 1;
      }
    }

    return {
      name: sec.name,
      label: sec.label,
      total_seconds,
      sessions_with_dwell,
      avg_seconds: sessions_with_dwell > 0 ? total_seconds / sessions_with_dwell : 0,
    };
  });
}

function computeSectionDropout(
  sessions: SessionSummary[],
  sections: LandingSection[]
) {
  return sections.map((section, index) => {
    const nextStart = sections[index + 1]?.start ?? 1;
    let reached = 0;
    let dropped = 0;

    for (const s of sessions) {
      const y = maxDepthToYRatio(s.max_depth);
      if (y >= section.start) {
        reached += 1;
        if (y < nextStart) dropped += 1;
      }
    }

    const next_section_reached = reached - dropped;

    return {
      name: section.name,
      label: section.label,
      reached,
      dropped,
      dropout_rate: reached > 0 ? (dropped / reached) * 100 : 0,
      next_section_reached,
      next_section_reach_rate:
        reached > 0 ? (next_section_reached / reached) * 100 : 0,
      submission_count: 0,
    };
  });
}
